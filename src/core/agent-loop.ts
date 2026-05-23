/**
 * EvoAgent — 核心 Agent Loop
 * 
 * 核心控制循环：接收输入 → 构建上下文 → 调用 LLM → 执行工具 → 输出结果
 * 参考 Claude Code 的约 200 行核心循环设计
 */

import type { LLMMessage, ToolDefinition, ToolResult } from './types.js';
import type { MemorySystem } from '../memory/memory-system.js';
import type { PermissionSystem, PermissionMode } from './permission.js';
import type { ToolExecutor } from '../tools/tool-executor.js';
import type { ContextCompressor } from './context-compressor.js';
import type { LLMClient } from './llm-client.js';

// ─── Agent Loop 配置 ───────────────────────────────────
export interface AgentLoopConfig {
  llm: LLMClient;
  memory: MemorySystem;
  permissions: PermissionSystem;
  tools: ToolExecutor;
  compressor: ContextCompressor;
  maxIterations: number;
  thinkingMode: boolean;
}

// ─── Agent Loop 核心类 ─────────────────────────────────
export class AgentLoop {
  private config: AgentLoopConfig;
  private iterationCount = 0;

  constructor(config: AgentLoopConfig) {
    this.config = config;
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

    // 1. 构建初始消息列表
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ];

    // 2. 注入记忆上下文
    const memoryContext = await this.config.memory.buildContext(userInput);
    if (memoryContext) {
      messages.splice(1, 0, { role: 'system', content: memoryContext });
    }

    // 3. 主循环
    while (this.iterationCount < this.config.maxIterations) {
      this.iterationCount++;

      // 上下文压缩（如果超出阈值）
      const compressed = await this.config.compressor.compress(messages);
      if (compressed.modified) {
        messages.length = 0;
        messages.push(...compressed.messages);
      }

      // 调用 LLM（流式）
      const response = await this.config.llm.chat({
        messages,
        tools,
        thinking: this.config.thinkingMode,
        onChunk: onOutput
      });

      // 如果没有工具调用，直接返回最终结果
      if (!response.toolCalls || response.toolCalls.length === 0) {
        // 固化记忆
        await this.config.memory.solidify(messages, response.content ?? '');
        return response.content ?? '';
      }

      // 执行工具调用
      const toolResults: ToolResult[] = [];
      for (const toolCall of response.toolCalls) {
        const tool = tools.find(t => t.name === toolCall.name);
        if (!tool) {
          toolResults.push({
            toolCallId: toolCall.id,
            content: `Error: Tool '${toolCall.name}' not found`,
            isError: true
          });
          continue;
        }

        // 权限检查
        const permitted = await this.config.permissions.check(
          toolCall.name,
          toolCall.arguments
        );
        if (!permitted) {
          toolResults.push({
            toolCallId: toolCall.id,
            content: `Permission denied: Tool '${toolCall.name}' requires approval`,
            isError: true
          });
          continue;
        }

        // 执行工具
        const result = await this.config.tools.execute(toolCall.name, toolCall.arguments);
        toolResults.push({
          toolCallId: toolCall.id,
          content: result.content,
          isError: result.isError
        });
      }

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
    const msg = `Max iterations (${this.config.maxIterations}) reached. Task may be incomplete.`;
    onOutput(msg);
    return msg;
  }

  getIterationCount(): number {
    return this.iterationCount;
  }
}
