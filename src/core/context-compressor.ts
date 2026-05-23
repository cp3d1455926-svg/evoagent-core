/**
 * EvoAgent — 上下文压缩器
 * 
 * 当对话上下文超出 token 限制时，自动压缩历史消息
 * 五层压缩策略：
 * 1. 裁剪冗余工具输出
 * 2. 摘要早期对话
 * 3. 移除重复内容
 * 4. 保留关键系统消息
 * 5. 紧急截断（最后手段）
 */

import type { LLMMessage } from './types.js';

export interface CompressionResult {
  messages: LLMMessage[];
  modified: boolean;
  originalTokenCount: number;
  compressedTokenCount: number;
}

export interface ContextCompressorConfig {
  maxTokens: number;
  softThreshold: number;   // 达到此阈值开始压缩（如 80%）
  preserveSystemMessages: boolean;
}

export class ContextCompressor {
  private config: ContextCompressorConfig;

  constructor(config: Partial<ContextCompressorConfig> = {}) {
    this.config = {
      maxTokens: config.maxTokens ?? 100000,
      softThreshold: config.softThreshold ?? 0.8,
      preserveSystemMessages: config.preserveSystemMessages ?? true
    };
  }

  /**
   * 压缩消息列表
   */
  async compress(messages: LLMMessage[]): Promise<CompressionResult> {
    const originalTokens = this.estimateTokens(messages);
    const threshold = this.config.maxTokens * this.config.softThreshold;

    if (originalTokens <= threshold) {
      return {
        messages,
        modified: false,
        originalTokenCount: originalTokens,
        compressedTokenCount: originalTokens
      };
    }

    // 执行五层压缩
    let result = [...messages];

    // Layer 1: 裁剪冗余工具输出
    result = this.trimToolOutputs(result);

    // Layer 2: 如果还超，摘要早期对话
    if (this.estimateTokens(result) > threshold) {
      result = this.summarizeEarlyConversation(result);
    }

    // Layer 3: 移除重复内容
    if (this.estimateTokens(result) > threshold) {
      result = this.removeDuplicates(result);
    }

    // Layer 4: 紧急截断
    if (this.estimateTokens(result) > this.config.maxTokens) {
      result = this.emergencyTruncate(result);
    }

    return {
      messages: result,
      modified: true,
      originalTokenCount: originalTokens,
      compressedTokenCount: this.estimateTokens(result)
    };
  }

  /**
   * 估算 token 数
   */
  private estimateTokens(messages: LLMMessage[]): number {
    return messages.reduce((sum, m) => sum + Math.ceil((m.content?.length ?? 0) / 4), 0);
  }

  /**
   * Layer 1: 裁剪工具输出（保留前后各 500 字符）
   */
  private trimToolOutputs(messages: LLMMessage[]): LLMMessage[] {
    return messages.map(m => {
      if (m.role === 'tool' && m.content && m.content.length > 1000) {
        const head = m.content.slice(0, 500);
        const tail = m.content.slice(-500);
        return { ...m, content: `${head}\n... [${m.content.length - 1000} chars truncated] ...\n${tail}` };
      }
      return m;
    });
  }

  /**
   * Layer 2: 摘要早期对话（保留最近 N 条）
   */
  private summarizeEarlyConversation(messages: LLMMessage[]): LLMMessage[] {
    // 保留 system 消息 + 最近 10 条
    const systemMessages = messages.filter(m => m.role === 'system');
    const recentMessages = messages.filter(m => m.role !== 'system').slice(-10);

    if (systemMessages.length + recentMessages.length < messages.length) {
      const summary: LLMMessage = {
        role: 'system',
        content: `[Context compressed: ${messages.length - systemMessages.length - recentMessages.length} earlier messages summarized]`
      };
      return [...systemMessages, summary, ...recentMessages];
    }

    return messages;
  }

  /**
   * Layer 3: 移除重复内容
   */
  private removeDuplicates(messages: LLMMessage[]): LLMMessage[] {
    const seen = new Set<string>();
    return messages.filter(m => {
      const key = `${m.role}:${m.content?.slice(0, 100)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Layer 4: 紧急截断（保留 system + 最近 5 条）
   */
  private emergencyTruncate(messages: LLMMessage[]): LLMMessage[] {
    const systemMessages = messages.filter(m => m.role === 'system');
    const recentMessages = messages.filter(m => m.role !== 'system').slice(-5);
    return [...systemMessages, ...recentMessages];
  }
}
