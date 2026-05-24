/**
 * 短期记忆层 — Working Memory
 * 
 * 当前会话的活跃上下文窗口
 * 滑动窗口算法，超出阈值时自动裁剪最早的非关键消息
 * 支持重要性标记，关键消息不会被裁剪
 */

import type { LLMMessage } from '../../core/types.js';

export interface MemoryStats {
  messageCount: number;
  estimatedTokens: number;
  maxTokens: number;
  utilizationPercent: number;
}

export class WorkingMemory {
  private maxTokens: number;
  private messages: LLMMessage[] = [];
  private importantIds = new Set<string>();

  constructor(maxTokens: number = 4096) {
    this.maxTokens = maxTokens;
  }

  add(message: LLMMessage): void {
    this.messages.push(message);
    this.enforceLimit();
  }

  /** 标记某条消息为重要（不会被裁剪） */
  markImportant(index: number): void {
    if (index >= 0 && index < this.messages.length) {
      this.importantIds.add(this.getMessageId(index));
    }
  }

  getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
    this.importantIds.clear();
  }

  getStats(): MemoryStats {
    const tokens = this.estimateTokensForMessages(this.messages);
    return {
      messageCount: this.messages.length,
      estimatedTokens: tokens,
      maxTokens: this.maxTokens,
      utilizationPercent: Math.round((tokens / this.maxTokens) * 100)
    };
  }

  private getMessageId(index: number): string {
    return `${index}:${this.messages[index].role}:${(this.messages[index].content ?? '').slice(0, 50)}`;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private estimateTokensForMessages(msgs: LLMMessage[]): number {
    return msgs.reduce((sum, m) => sum + this.estimateTokens(m.content ?? ''), 0);
  }

  /**
   * 滑动窗口：超出限制时裁剪最早的非关键消息
   * 策略：
   * 1. 保留所有 system 消息
   * 2. 保留被标记为重要的消息
   * 3. 保留最后一条 user 消息（当前问题）
   * 4. 优先裁剪中间的工具输出和旧对话
   */
  private enforceLimit(): void {
    let totalTokens = this.estimateTokensForMessages(this.messages);
    if (totalTokens <= this.maxTokens) return;

    // 第一轮：裁剪过长的工具输出
    for (let i = 0; i < this.messages.length && totalTokens > this.maxTokens; i++) {
      const m = this.messages[i];
      if (m.role === 'tool' && (m.content?.length ?? 0) > 2000) {
        const originalLen = m.content!.length;
        this.messages[i] = {
          ...m,
          content: m.content!.slice(0, 1000) + `\n... [${originalLen - 2000} chars truncated] ...\n` + m.content!.slice(-1000)
        };
        totalTokens -= this.estimateTokens(m.content!) - this.estimateTokens(this.messages[i].content!);
      }
    }

    // 第二轮：移除最早的旧消息（保留 system + 重要 + 最后 user）
    while (totalTokens > this.maxTokens && this.messages.length > 2) {
      const lastUserIdx = this.messages.map((m, i) => ({ m, i })).reverse().find(x => x.m.role === 'user')?.i ?? -1;
      const idx = this.messages.findIndex((m: LLMMessage, i: number) => {
        if (m.role === 'system') return false;
        if (this.importantIds.has(this.getMessageId(i))) return false;
        if (i === lastUserIdx) return false;
        return true;
      });
      if (idx === -1) break;

      const removed = this.messages.splice(idx, 1)[0];
      totalTokens -= this.estimateTokens(removed.content ?? '');
    }

    // 第三轮：如果还超，只保留 system + 最近 3 条
    if (totalTokens > this.maxTokens) {
      const systemMsgs = this.messages.filter(m => m.role === 'system');
      const recent = this.messages.filter(m => m.role !== 'system').slice(-3);
      this.messages = [...systemMsgs, ...recent];
    }
  }
}
