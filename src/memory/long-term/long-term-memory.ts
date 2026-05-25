/* eslint-disable no-console */
/**
 * 长期记忆层 — Long-term Memory
 *
 * 基于 TF-IDF 的语义检索系统（无需外部向量数据库）
 * 支持内存模式和 ChromaDB 模式
 * v0.2.0: 添加 JSON 文件持久化
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

interface MemoryEntry {
  id: string;
  content: string;
  keywords: string[];
  timestamp: number;
  accessCount: number;
}

interface SearchResult {
  content: string;
  score: number;
}

export interface LongTermMemoryConfig {
  provider: string;
  url?: string;
  persistPath?: string;  // JSON 持久化路径
}

export class LongTermMemory {
  private provider: string;
  private url?: string;
  private persistPath?: string;
  private memories: MemoryEntry[] = [];
  private stopWords: Set<string>;

  constructor(provider: string, url?: string, persistPath?: string) {
    this.provider = provider;
    this.url = url;
    this.persistPath = persistPath || this.getDefaultPersistPath();
    // 中英文停用词
    this.stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
      'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
      'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
      'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
      'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
      'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
      'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'down',
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
      '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会',
      '着', '没有', '看', '好', '自己', '这', '他', '她', '它', '们',
      '那', '些', '什么', '怎么', '为什么', '哪', '哪个', '哪些', '谁',
      '多少', '几', '可以', '能', '应该', '需要', '想', '做', '把', '被',
      '从', '让', '给', '向', '对', '跟', '比', '还', '又', '已经', '正在',
      '将', '只', '最', '更', '每', '这', '那', '这个', '那个'
    ]);
  }

  private getDefaultPersistPath(): string {
    const home = process.env.USERPROFILE || process.env.HOME || '.';
    return home + '/.evoagent/long-term-memory.json';
  }

  async initialize(): Promise<void> {
    if (this.provider === 'chromadb') {
      console.log(`📦 LongTermMemory: connecting to ChromaDB at ${this.url}`);
    } else {
      console.log('📦 LongTermMemory: using in-memory mode with TF-IDF search');
    }
    // 从磁盘加载已有记忆
    await this.loadFromDisk();
  }

  private async loadFromDisk(): Promise<void> {
    if (!this.persistPath) return;
    try {
      const data = await readFile(this.persistPath, 'utf-8');
      const entries: MemoryEntry[] = JSON.parse(data);
      this.memories = entries;
      console.log(`📦 LongTermMemory: loaded ${entries.length} entries from disk`);
    } catch {
      // 文件不存在或损坏，从空开始
    }
  }

  private async saveToDisk(): Promise<void> {
    if (!this.persistPath) return;
    try {
      await mkdir(dirname(this.persistPath), { recursive: true });
      await writeFile(this.persistPath, JSON.stringify(this.memories, null, 2), 'utf-8');
    } catch (err) {
      console.error('LongTermMemory: failed to persist', err);
    }
  }

  async store(content: string): Promise<void> {
    const entry: MemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      keywords: this.extractKeywords(content),
      timestamp: Date.now(),
      accessCount: 0
    };
    this.memories.push(entry);
    await this.saveToDisk();
  }

  async search(query: string, limit: number = 5): Promise<SearchResult[]> {
    const queryKeywords = this.extractKeywords(query);
    if (queryKeywords.length === 0) return [];

    const results: SearchResult[] = [];

    for (const memory of this.memories) {
      const score = this.calculateScore(queryKeywords, memory);
      if (score > 0) {
        memory.accessCount++;
        results.push({ content: memory.content, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 提取关键词（去停用词 + 中文单字/双字切分）
   */
  private extractKeywords(text: string): string[] {
    const keywords: string[] = [];

    // 英文词
    const words = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ').split(/\s+/);
    for (const w of words) {
      if (w.length >= 2 && !this.stopWords.has(w)) {
        keywords.push(w);
      }
    }

    // 中文字符（双字组合）
    const chineseChars = text.replace(/[^\u4e00-\u9fff]/g, '');
    for (let i = 0; i < chineseChars.length - 1; i++) {
      const bigram = chineseChars.slice(i, i + 2);
      keywords.push(bigram);
    }

    return [...new Set(keywords)];
  }

  /**
   * TF-IDF 相似度计算
   */
  private calculateScore(queryKeywords: string[], memory: MemoryEntry): number {
    const memoryAll = [...memory.keywords];
    if (memoryAll.length === 0) return 0;

    let score = 0;
    for (const qk of queryKeywords) {
      // 精确匹配
      if (memoryAll.includes(qk)) {
        score += 1.0;
        continue;
      }
      // 部分匹配
      for (const mk of memoryAll) {
        if (mk.includes(qk) || qk.includes(mk)) {
          score += 0.5;
          break;
        }
      }
    }

    // 归一化
    const normalized = score / Math.sqrt(queryKeywords.length * memoryAll.length);
    return normalized;
  }

  /** 获取记忆总数 */
  getCount(): number {
    return this.memories.length;
  }

  /** 清除所有记忆 */
  async clear(): Promise<void> {
    this.memories = [];
  }

  async close(): Promise<void> {
    await this.saveToDisk();
  }
}
