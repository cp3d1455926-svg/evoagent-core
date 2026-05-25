/**
 * EvoAgent — 核心 Agent Loop
 *
 * 核心控制循环：接收输入 → 构建上下文 → 调用 LLM → 执行工具 → 输出结果
 * 参考 Claude Code 的约 200 行核心循环设计
 *
 * v0.2.0 改进：
 * - 结构化日志 + 指标收集
 * - 工具调用并行超时控制
 * - 更清晰的错误分类
 */

import type { LLMMessage, ToolDefinition, ToolResult } from './types.js';
import type { MemorySystem } from '../memory/memory-system.js';
import type { PermissionSystem } from './permission.js';
import type { ToolExecutor } from '../tools/tool-executor.js';
import type { ContextCompressor } from './context-compressor.js';
import type { LLMClient } from './llm-client.js';
import { Logger } from '../telemetry/logger.js';
import { MetricsCollector, MetricNames } from '../telemetry/metrics.js';

// ─── Agent Loop 配置 ───────────────────────────────────
export interface AgentLoopConfig {
  llm: LLMClient;
  memory: MemorySystem;
  permissions: PermissionSystem;
  tools: ToolExecutor;
  compressor: ContextCompressor;
  maxIterations: number;
  thinkingMode: boolean;
  maxRetries?: number;       // LLM 调用最大重试次数
  retryDelayMs?: number;     // 重试基础延迟
  toolTimeoutMs?: number;    // 单个工具调用超时
  logger?: Logger;           // 可选外部 Logger
}

// ─── Agent Loop 核心类 ─────────────────────────────────
export class AgentLoop {
  private config: AgentLoopConfig;
  private iterationCount = 0;
  private logger: Logger;
  private metrics: MetricsCollector;

  constructor(config: AgentLoopConfig) {
    this.config = {
      maxRetries: 3,
      retryDelayMs: 1000,
      toolTimeoutMs: 60000,
      ...config
    };
    this.logger = config.logger ?? new Logger('agent-loop');
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * 带重试的 LLM 调用
   */
  private async chatWithRetry(
    request: Parameters<LLMClient['chat']>[0]
  ): Promise<ReturnType<LLMClient['chat']>> {
    const maxRetries = this.config.maxRetries ?? 3;
    const baseDelay = this.config.retryDelayMs ?? 1000;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.metrics.incrementCounter(MetricNames.LLM_RETRIES, 1, { attempt: String(attempt) });
          this.logger.warn(`LLM retry attempt ${attempt}/${maxRetries}`);
        }
        return await this.config.llm.chat(request);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          this.logger.warn(`LLM call failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            error: lastError.message
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.metrics.incrementCounter(MetricNames.LLM_ERRORS);
    this.logger.error('LLM call failed after all retries', { error: lastError?.message });
    throw lastError;
  }

  /**
   * 运行 Agent Loop — 核心入口
   * @param userInput 用户输入
   * @param tools 可用工具列表
   * @param systemPrompt 系统提示词
   * @param onOutput 输出回调（用于流式输出到不同渠道）
   */
  async run(
    userInput: string,
    tools: ToolDefinition[],
    systemPrompt: string,
    onOutput: (chunk: string) => void
  ): Promise<string> {
    this.iterationCount = 0;
    const timer = this.metrics.timer(MetricNames.AGENT_DURATION_MS);

    this.logger.info('Agent loop started', {
      inputLength: userInput.length,
      toolCount: tools.length,
      maxIterations: this.config.maxIterations
    });

    // 1. 构建初始消息列表
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ];

    // 2. 注入记忆上下文
    const memoryContext = await this.config.memory.buildContext(userInput);
    if (memoryContext) {
      messages.splice(1, 0, { role: 'system', content: memoryContext });
      this.logger.debug('Memory context injected', { length: memoryContext.length });
    }

    // 3. 主循环
    while (this.iterationCount < this.config.maxIterations) {
      this.iterationCount++;
      this.logger.debug(`Iteration ${this.iterationCount}`);

      // 上下文压缩（如果超出阈值）
      const compressed = await this.config.compressor.compress(messages);
      if (compressed.modified) {
        messages.length = 0;
        messages.push(...compressed.messages);
        this.logger.debug('Context compressed', {
          originalTokens: compressed.originalTokenCount,
          compressedTokens: compressed.compressedTokenCount
        });
      }

      // 调用 LLM（流式 + 重试）
      const llmTimer = this.metrics.timer(MetricNames.LLM_DURATION_MS);
      const response = await this.chatWithRetry({
        messages,
        tools,
        thinking: this.config.thinkingMode,
        onChunk: onOutput
      });
      llmTimer.end();

      this.metrics.incrementCounter(MetricNames.LLM_REQUESTS);
      this.metrics.incrementCounter(MetricNames.LLM_TOKENS_INPUT, response.usage.inputTokens);
      this.metrics.incrementCounter(MetricNames.LLM_TOKENS_OUTPUT, response.usage.outputTokens);

      // 如果没有工具调用，直接返回最终结果
      if (!response.toolCalls || response.toolCalls.length === 0) {
        // 固化记忆
        await this.config.memory.solidify(messages, response.content ?? '');

        const duration = timer.end();
        this.metrics.incrementCounter(MetricNames.AGENT_ITERATIONS, this.iterationCount);
        this.logger.info('Agent loop completed', {
          iterations: this.iterationCount,
          durationMs: Math.round(duration),
          outputLength: (response.content ?? '').length
        });
        return response.content ?? '';
      }

      // 执行工具调用（并行化 + 超时控制）
      const toolResults: ToolResult[] = await Promise.all(
        response.toolCalls.map(async (toolCall) => {
          const tool = tools.find(t => t.name === toolCall.name);
          if (!tool) {
            this.logger.warn(`Tool not found: ${toolCall.name}`);
            return {
              toolCallId: toolCall.id,
              content: `Error: Tool '${toolCall.name}' not found`,
              isError: true
            };
          }

          // 权限检查
          const permitted = await this.config.permissions.check(
            toolCall.name,
            toolCall.arguments
          );
          if (!permitted) {
            this.logger.warn(`Permission denied for tool: ${toolCall.name}`);
            return {
              toolCallId: toolCall.id,
              content: `Permission denied: Tool '${toolCall.name}' requires approval`,
              isError: true
            };
          }

          // 执行工具（带超时和错误恢复）
          const toolTimer = this.metrics.timer(MetricNames.TOOL_DURATION_MS, { tool: toolCall.name });
          try {
            const timeoutMs = this.config.toolTimeoutMs ?? 60000;
            const result = await Promise.race([
              this.config.tools.execute(toolCall.name, toolCall.arguments),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Tool '${toolCall.name}' timed out after ${timeoutMs}ms`)), timeoutMs)
              )
            ]);
            toolTimer.end();
            this.metrics.incrementCounter(MetricNames.TOOL_CALLS, 1, { tool: toolCall.name });

            return {
              toolCallId: toolCall.id,
              content: result.content,
              isError: result.isError
            };
          } catch (err) {
            toolTimer.end();
            this.metrics.incrementCounter(MetricNames.TOOL_ERRORS, 1, { tool: toolCall.name });
            const errMsg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Tool execution error: ${toolCall.name}`, { error: errMsg });
            return {
              toolCallId: toolCall.id,
              content: `Tool execution error: ${errMsg}`,
              isError: true
            };
          }
        })
      );

      // 将结果追加到消息列表
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls
      });

      for (const result of toolResults) {
        messages.push({
          role: 'tool',
          toolCallId: result.toolCallId,
          content: result.content,
          isError: result.isError
        });
      }
    }

    // 超出最大迭代次数
    this.metrics.incrementCounter(MetricNames.AGENT_ERRORS);
    const duration = timer.end();
    const msg = `Max iterations (${this.config.maxIterations}) reached. Task may be incomplete.`;
    this.logger.warn('Agent loop hit max iterations', {
      maxIterations: this.config.maxIterations,
      durationMs: Math.round(duration)
    });
    onOutput(msg);
    return msg;
  }

  getIterationCount(): number {
    return this.iterationCount;
  }
}
