/* eslint-disable no-console */
/**
 * 长期记忆层 — Long-term Memory
 * 
 * 基于向量数据库的语义检索系统
 * 支持 ChromaDB（开发）和内存模式（降级）
 */

export class LongTermMemory {
  private provider: string;
  private url?: string;
  private memories: string[] = []; // 内存模式下的简单存储

  constructor(provider: string, url?: string) {
    this.provider = provider;
    this.url = url;
  }

  async initialize(): Promise<void> {
    if (this.provider === 'chromadb') {
      // TODO: 连接 ChromaDB
      console.log(`📦 LongTermMemory: connecting to ChromaDB at ${this.url}`);
    } else {
      console.log('📦 LongTermMemory: using in-memory mode');
    }
  }

  async store(content: string): Promise<void> {
    this.memories.push(content);
    // TODO: 向量化并存储到向量数据库
  }

  async search(query: string, limit: number = 5): Promise<Array<{ content: string; score: number }>> {
    // TODO: 语义搜索
    // 简化版：按词匹配（查询中任一词出现在记忆中即匹配）
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return [];
    return this.memories
      .filter(m => {
        const lower = m.toLowerCase();
        return queryWords.some(w => lower.includes(w));
      })
      .slice(0, limit)
      .map(m => ({ content: m, score: 0.8 }));
  }

  async close(): Promise<void> {
    // TODO: 关闭数据库连接
  }
}
