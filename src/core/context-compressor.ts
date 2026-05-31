/**
 * EvoAgent — 上下文压缩器 v2.0
 *
 * 六层压缩策略，最大化节省 token：
 * 1. 裁剪冗余工具输出（保留头尾 + 关键行）
 * 2. 摘要早期对话（LLM 摘要 / 紧凑摘要）
 * 3. 移除重复内容（精确 + 模糊去重）
 * 4. 保留关键系统消息
 * 5. 强制适配（逐步减少保留消息数）
 * 6. 紧急截断（最后手段）
 *
 * v0.5.0 改进：
 * - 模糊去重（Jaccard 相似度）
 * - 工具输出智能提取（保留错误/关键行）
 * - 渐进式压缩（按需逐步增强）
 * - 压缩统计
 */

import type { LLMMessage } from './types.js';

export interface CompressionResult {
  messages: LLMMessage[];
  modified: boolean;
  originalTokenCount: number;
  compressedTokenCount: number;
  savingsPercent: number;
}

export interface ContextCompressorConfig {
  maxTokens: number;
  softThreshold: number;    // 达到此阈值开始压缩（如 80%）
  preserveSystemMessages: boolean;
  /** 是否启用模糊去重 */
  enableFuzzyDedup: boolean;
  /** 摘要模式: 'compact'（纯文本） */
  summaryMode: 'compact';
}

export class ContextCompressor {
  private config: ContextCompressorConfig;
  private totalCompressions = 0;
  private totalTokensSaved = 0;

  constructor(config: Partial<ContextCompressorConfig> = {}) {
    this.config = {
      maxTokens: config.maxTokens ?? 100000,
      softThreshold: config.softThreshold ?? 0.8,
      preserveSystemMessages: config.preserveSystemMessages ?? true,
      enableFuzzyDedup: config.enableFuzzyDedup ?? true,
      summaryMode: config.summaryMode ?? 'compact'
    };
  }

  async compress(messages: LLMMessage[]): Promise<CompressionResult> {
    const originalTokens = this.estimateTokens(messages);
    const threshold = this.config.maxTokens * this.config.softThreshold;

    if (originalTokens <= threshold) {
      return {
        messages, modified: false,
        originalTokenCount: originalTokens,
        compressedTokenCount: originalTokens,
        savingsPercent: 0
      };
    }

    let result = [...messages];
    const stages: string[] = [];

    // Layer 1: 裁剪冗余工具输出
    result = this.trimToolOutputs(result);
    if (this.estimateTokens(result) <= threshold) stages.push('trim-tool-outputs');

    // Layer 2: 模糊去重
    if (this.estimateTokens(result) > threshold && this.config.enableFuzzyDedup) {
      result = this.fuzzyDedup(result);
      if (this.estimateTokens(result) <= threshold) stages.push('fuzzy-dedup');
    }

    // Layer 3: 精确去重
    if (this.estimateTokens(result) > threshold) {
      result = this.removeDuplicates(result);
      if (this.estimateTokens(result) <= threshold) stages.push('exact-dedup');
    }

    // Layer 4: 摘要早期对话
    if (this.estimateTokens(result) > threshold) {
      result = this.summarizeEarlyConversation(result, threshold);
      stages.push('summarize-early');
    }

    // Layer 5: 强制适配
    if (this.estimateTokens(result) > threshold) {
      result = this.forceFit(result, threshold);
      stages.push('force-fit');
    }

    // Layer 6: 紧急截断
    if (this.estimateTokens(result) > this.config.maxTokens) {
      result = this.emergencyTruncate(result);
      stages.push('emergency-truncate');
    }

    const compressedTokens = this.estimateTokens(result);
    const savings = originalTokens - compressedTokens;

    this.totalCompressions++;
    this.totalTokensSaved += savings;

    return {
      messages: result,
      modified: true,
      originalTokenCount: originalTokens,
      compressedTokenCount: compressedTokens,
      savingsPercent: Math.round((savings / originalTokens) * 10000) / 10000
    };
  }

  /**
   * 压缩统计
   */
  getStats(): { totalCompressions: number; totalTokensSaved: number } {
    return {
      totalCompressions: this.totalCompressions,
      totalTokensSaved: this.totalTokensSaved
    };
  }

  // ─── Token 估算 ──────────────────────────────────────

  estimateTokens(messages: LLMMessage[]): number {
    return messages.reduce((sum, m) => {
      let len = m.content?.length ?? 0;
      if (m.toolCalls) len += JSON.stringify(m.toolCalls).length;
      return sum + Math.ceil(len / 4);
    }, 0);
  }

  // ─── Layer 1: 智能裁剪工具输出 ───────────────────────

  private trimToolOutputs(messages: LLMMessage[]): LLMMessage[] {
    return messages.map(m => {
      if (m.role !== 'tool' || !m.content || m.content.length <= 1500) return m;

      const lines = m.content.split('\n');
      const importantLines: string[] = [];
      const otherLines: string[] = [];

      for (const line of lines) {
        const t = line.trim();
        // 保留重要行：错误、警告、结果、关键数据
        if (/error|err\b|fail|exception|warning|warn\b|result|output|✅|❌|⚠️|✓|✗/i.test(t) ||
            t.startsWith('>') || t.startsWith('$') || t.startsWith('+')) {
          importantLines.push(line);
        } else {
          otherLines.push(line);
        }
      }

      // 如果重要行已经够用，只保留重要行 + 头尾
      if (importantLines.length > 0 && importantLines.length < lines.length * 0.5) {
        const head = lines.slice(0, 3).join('\n');
        const tail = lines.slice(-3).join('\n');
        const important = importantLines.slice(0, 20).join('\n');
        const omitted = lines.length - 6 - importantLines.length;
        return {
          ...m,
          content: `${head}\n\n... [${omitted} lines omitted] ...\n\nKey output:\n${important}\n\n${tail}`
        };
      }

      // 否则保留头尾
      const head = lines.slice(0, 15).join('\n');
      const tail = lines.slice(-10).join('\n');
      const omitted = lines.length - 25;
      return {
        ...m,
        content: `${head}\n... [${omitted} lines omitted] ...\n${tail}`
      };
    });
  }

  // ─── Layer 2: 模糊去重 ───────────────────────────────

  private fuzzyDedup(messages: LLMMessage[]): LLMMessage[] {
    const result: LLMMessage[] = [];
    const signatures: string[] = [];

    for (const msg of messages) {
      // system 消息不去重
      if (msg.role === 'system') {
        result.push(msg);
        continue;
      }

      const sig = this.signature(msg.content ?? '');
      let isDuplicate = false;

      for (const existing of signatures) {
        if (this.similarity(sig, existing) > 0.85) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        result.push(msg);
        signatures.push(sig);
      }
    }

    return result;
  }

  private signature(text: string): string {
    // 取前 200 字符的关键词集合
    const words = text.slice(0, 200).toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3);
    return [...new Set(words)].sort().join(' ');
  }

  private similarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const setA = new Set(a.split(' '));
    const setB = new Set(b.split(' '));
    let intersection = 0;
    for (const item of setA) { if (setB.has(item)) intersection++; }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  // ─── Layer 3: 精确去重 ───────────────────────────────

  private removeDuplicates(messages: LLMMessage[]): LLMMessage[] {
    const seen = new Set<string>();
    return messages.filter(m => {
      if (m.role === 'system') return true;
      const key = `${m.role}:${m.content?.slice(0, 150)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ─── Layer 4: 摘要早期对话 ───────────────────────────

  private summarizeEarlyConversation(messages: LLMMessage[], threshold: number): LLMMessage[] {
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    for (let recentCount = 15; recentCount >= 2; recentCount--) {
      const recentMessages = nonSystem.slice(-recentCount);
      const olderMessages = nonSystem.slice(0, -recentCount);
      if (olderMessages.length === 0) return messages;

      const summary = this.generateCompactSummary(olderMessages);
      const candidate = [...systemMessages, summary, ...recentMessages];

      if (this.estimateTokens(candidate) <= threshold) return candidate;
    }

    return [...systemMessages, ...nonSystem.slice(-2)];
  }

  private generateCompactSummary(messages: LLMMessage[]): LLMMessage {
    const userCount = messages.filter(m => m.role === 'user').length;
    const assistantCount = messages.filter(m => m.role === 'assistant').length;
    const toolCount = messages.filter(m => m.role === 'tool').length;

    // 提取关键用户请求
    const userMessages = messages.filter(m => m.role === 'user');
    const lastUser = userMessages[userMessages.length - 1]?.content?.slice(0, 80) || '';

    // 提取关键工具结果摘要
    const toolErrors = messages
      .filter(m => m.role === 'tool' && m.isError)
      .map(m => m.content?.slice(0, 50));

    const parts = [
      `[压缩: ${messages.length}条历史消息 | ${userCount}次用户 | ${assistantCount}次回复 | ${toolCount}次工具]`
    ];
    if (lastUser) parts.push(`最近请求: ${lastUser}`);
    if (toolErrors.length > 0) parts.push(`工具错误: ${toolErrors.length}个`);

    return { role: 'system', content: parts.join(' | ') };
  }

  // ─── Layer 5: 强制适配 ───────────────────────────────

  private forceFit(messages: LLMMessage[], threshold: number): LLMMessage[] {
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    for (let keep = nonSystem.length; keep >= 1; keep--) {
      const candidate = [...systemMessages, ...nonSystem.slice(-keep)];
      if (this.estimateTokens(candidate) <= threshold) return candidate;
    }
    return systemMessages;
  }

  // ─── Layer 6: 紧急截断 ───────────────────────────────

  private emergencyTruncate(messages: LLMMessage[]): LLMMessage[] {
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');
    return [...systemMessages, ...nonSystem.slice(-5)];
  }
}
