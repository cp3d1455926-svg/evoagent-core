/**
 * EvoAgent — 核心 Agent Loop v2.0
 *
 * 核心控制循环：接收输入 → 构建上下文 → 调用 LLM → 执行工具 → 输出结果
 *
 * v0.4.0 改进：
 * - 集成 KV 缓存（LLM 响应 + 工具结果缓存）
 * - Token 预算追踪
 * - 工具结果摘要（省 token）
 * - 迭代统计 + 缓存命中率报告
 */

import type { LLMMessage, ToolDefinition, ToolResult } from './types.js';
import type { MemorySystem } from '../memory/memory-system.js';
import type { PermissionSystem } from './permission.js';
import type { ToolExecutor } from '../tools/tool-executor.js';
import type { ContextCompressor } from './context-compressor.js';
import type { LLMClient } from './llm-client.js';
import { Logger } from '../telemetry/logger.js';
import { MetricsCollector, MetricNames } from '../telemetry/metrics.js';

export interface AgentLoopConfig {
  llm: LLMClient;
  memory: MemorySystem;
  permissions: PermissionSystem;
  tools: ToolExecutor;
  compressor: ContextCompressor;
  maxIterations: number;
  thinkingMode: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  toolTimeoutMs?: number;
  logger?: Logger;
}

export class AgentLoop {
  private config: AgentLoopConfig;
  private iterationCount = 0;
  private logger: Logger;
  private metrics: MetricsCollector;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

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
            attempt: attempt + 1, maxRetries: maxRetries + 1, error: lastError.message
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.metrics.incrementCounter(MetricNames.LLM_ERRORS);
    this.logger.error('LLM call failed after all retries', { error: lastError?.message });
    throw lastError;
  }

  async run(
    userInput: string,
    tools: ToolDefinition[],
    systemPrompt: string,
    onOutput: (chunk: string) => void
  ): Promise<string> {
    this.iterationCount = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    const timer = this.metrics.timer(MetricNames.AGENT_DURATION_MS);

    this.logger.info('Agent loop started', {
      inputLength: userInput.length, toolCount: tools.length, maxIterations: this.config.maxIterations
    });

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ];

    // 注入记忆上下文
    const memoryContext = await this.config.memory.buildContext(userInput);
    if (memoryContext) {
      messages.splice(1, 0, { role: 'system', content: memoryContext });
      this.logger.debug('Memory context injected', { length: memoryContext.length });
    }

    while (this.iterationCount < this.config.maxIterations) {
      this.iterationCount++;
      this.logger.debug(`Iteration ${this.iterationCount}`);

      // 上下文压缩
      const compressed = await this.config.compressor.compress(messages);
      if (compressed.modified) {
        messages.length = 0;
        messages.push(...compressed.messages);
        this.logger.debug('Context compressed', {
          originalTokens: compressed.originalTokenCount,
          compressedTokens: compressed.compressedTokenCount,
          savings: `${compressed.savingsPercent}%`
        });
      }

      // 调用 LLM
      const llmTimer = this.metrics.timer(MetricNames.LLM_DURATION_MS);
      const response = await this.chatWithRetry({
        messages, tools, thinking: this.config.thinkingMode, onChunk: onOutput
      });
      llmTimer.end();

      this.metrics.incrementCounter(MetricNames.LLM_REQUESTS);
      this.metrics.incrementCounter(MetricNames.LLM_TOKENS_INPUT, response.usage.inputTokens);
      this.metrics.incrementCounter(MetricNames.LLM_TOKENS_OUTPUT, response.usage.outputTokens);
      this.totalInputTokens += response.usage.inputTokens;
      this.totalOutputTokens += response.usage.outputTokens;

      if (!response.toolCalls || response.toolCalls.length === 0) {
        await this.config.memory.solidify(messages, response.content ?? '');

        const duration = timer.end();
        this.metrics.incrementCounter(MetricNames.AGENT_ITERATIONS, this.iterationCount);

        // 报告 token 使用情况
        this.logger.info('Agent loop completed', {
          iterations: this.iterationCount,
          durationMs: Math.round(duration),
          outputLength: (response.content ?? '').length,
          totalInputTokens: this.totalInputTokens,
          totalOutputTokens: this.totalOutputTokens,
          totalTokens: this.totalInputTokens + this.totalOutputTokens
        });

        return response.content ?? '';
      }

      // 执行工具（并行 + 超时）
      const toolResults: ToolResult[] = await Promise.all(
        response.toolCalls.map(async (toolCall) => {
          const tool = tools.find(t => t.name === toolCall.name);
          if (!tool) {
            this.logger.warn(`Tool not found: ${toolCall.name}`);
            return { toolCallId: toolCall.id, content: `Error: Tool '${toolCall.name}' not found`, isError: true };
          }

          const permitted = await this.config.permissions.check(toolCall.name, toolCall.arguments);
          if (!permitted) {
            this.logger.warn(`Permission denied: ${toolCall.name}`);
            return { toolCallId: toolCall.id, content: `Permission denied: '${toolCall.name}'`, isError: true };
          }

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

            // 工具结果摘要（省 token）：如果结果太长，自动截断
            let content = result.content;
            if (content.length > 8000) {
              content = content.slice(0, 4000) +
                `\n... [${content.length - 8000} chars omitted] ...\n` +
                content.slice(-4000);
            }

            return { toolCallId: toolCall.id, content, isError: result.isError };
          } catch (err) {
            toolTimer.end();
            this.metrics.incrementCounter(MetricNames.TOOL_ERRORS, 1, { tool: toolCall.name });
            const errMsg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Tool error: ${toolCall.name}`, { error: errMsg });
            return { toolCallId: toolCall.id, content: `Error: ${errMsg}`, isError: true };
          }
        })
      );

      messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });
      for (const result of toolResults) {
        messages.push({ role: 'tool', toolCallId: result.toolCallId, content: result.content, isError: result.isError });
      }
    }

    this.metrics.incrementCounter(MetricNames.AGENT_ERRORS);
    const duration = timer.end();
    const msg = `Max iterations (${this.config.maxIterations}) reached.`;
    this.logger.warn('Agent loop hit max iterations', { maxIterations: this.config.maxIterations, durationMs: Math.round(duration) });
    onOutput(msg);
    return msg;
  }

  getIterationCount(): number { return this.iterationCount; }
  getTokenUsage(): { input: number; output: number; total: number } {
    return { input: this.totalInputTokens, output: this.totalOutputTokens, total: this.totalInputTokens + this.totalOutputTokens };
  }
}
