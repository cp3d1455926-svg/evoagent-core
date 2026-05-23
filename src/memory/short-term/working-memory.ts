/**
 * 短期记忆层 — Working Memory
 * 
 * 当前会话的活跃上下文窗口
 * 滑动窗口算法，超出阈值时自动裁剪最早的非关键消息
 */

import type { LLMMessage } from '../../core/types.js';

export class WorkingMemory {
  private maxTokens: number;
  private messages: LLMMessage[] = [];

  constructor(maxTokens: number = 4096) {
    this.maxTokens = maxTokens;
  }

  add(message: LLMMessage): void {
    this.messages.push(message);
    this.enforceLimit();
  }

  getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }

  /**
   * 估算 token 数（简化版：1 token ≈ 4 字符）
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * 滑动窗口：超出限制时裁剪最早的非关键消息
   */
  private enforceLimit(): void {
    let totalTokens = this.messages.reduce(
      (sum, m) => sum + this.estimateTokens(m.content ?? ''),
      0
    );

    // 保留 system 消息和最近的消息，裁剪中间的
    while (totalTokens > this.maxTokens && this.messages.length > 2) {
      // 找到第一个可以裁剪的消息（非 system、非最后一条 user）
      const idx = this.messages.findIndex(
        (m, i) => m.role !== 'system' && i < this.messages.length - 1
      );
      if (idx === -1) break;

      const removed = this.messages.splice(idx, 1)[0];
      totalTokens -= this.estimateTokens(removed.content ?? '');
    }
  }
}
