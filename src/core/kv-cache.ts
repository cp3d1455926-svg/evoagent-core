/**
 * EvoAgent — KV 缓存层
 *
 * 提高缓存命中率的核心模块：
 * 1. LLM 响应缓存 — 相同/相似输入复用输出
 * 2. 工具结果缓存 — 相同工具调用参数复用结果
 * 3. 记忆检索缓存 — 相似查询复用检索结果
 * 4. TTL 过期 + LRU 淘汰
 *
 * v0.4.0: 新增缓存层
 */

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  hits: number;
  hash: string;
}

export interface CacheConfig {
  maxSize: number;        // 最大条目数
  defaultTTLMs: number;   // 默认过期时间
  similarityThreshold: number; // 相似度阈值 (0-1)
}

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 500,
  defaultTTLMs: 30 * 60 * 1000, // 30 分钟
  similarityThreshold: 0.92
};

export class KVCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private config: CacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 精确匹配查找
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    entry.hits++;
    this.hits++;
    return entry.value;
  }

  /**
   * 存储
   */
  set(key: string, value: T, ttlMs?: number): void {
    // LRU 淘汰
    if (this.store.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.store.set(key, {
      value,
      createdAt: now,
      expiresAt: now + (ttlMs ?? this.config.defaultTTLMs),
      hits: 0,
      hash: key
    });
  }

  /**
   * 查找或存储（缓存模式）
   */
  async getOrCompute(
    key: string,
    compute: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await compute();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * 模糊匹配查找（用于自然语言查询）
   * 使用 Jaccard 相似度对 key 的 token 集合做近似匹配
   */
  getFuzzy(query: string): T | undefined {
    const queryTokens = this.tokenize(query);
    let bestMatch: { key: string; score: number } | null = null;

    for (const [key, entry] of this.store) {
      if (Date.now() > entry.expiresAt) continue;
      const keyTokens = this.tokenize(key);
      const score = this.jaccardSimilarity(queryTokens, keyTokens);
      if (score >= this.config.similarityThreshold) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { key, score };
        }
      }
    }

    if (bestMatch) {
      const entry = this.store.get(bestMatch.key)!;
      entry.hits++;
      this.hits++;
      return entry.value;
    }

    this.misses++;
    return undefined;
  }

  /**
   * 批量删除匹配前缀的条目
   */
  invalidate(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 缓存统计
   */
  stats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      maxSize: this.config.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Math.round((this.hits / total) * 10000) / 10000 : 0
    };
  }

  // ─── 内部方法 ─────────────────────────────────────

  private tokenize(text: string): Set<string> {
    const tokens = new Set<string>();

    // 英文/数字词
    const words = text.toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);
    for (const w of words) tokens.add(w);

    // 中文双字组合（提升中文模糊匹配效果）
    const chineseChars = text.replace(/[^\u4e00-\u9fff]/g, '');
    for (let i = 0; i < chineseChars.length - 1; i++) {
      tokens.add(chineseChars.slice(i, i + 2));
    }

    return tokens;
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private evictLRU(): void {
    // 移除最少访问的 20% 条目
    const entries = Array.from(this.store.entries());
    entries.sort((a, b) => a[1].hits - b[1].hits);
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.store.delete(entries[i][0]);
    }
  }
}

// ─── 全局缓存实例 ────────────────────────────────────

/** LLM 响应缓存 */
export const llmCache = new KVCache<string>({
  maxSize: 200,
  defaultTTLMs: 60 * 60 * 1000, // 1 小时
  similarityThreshold: 0.95
});

/** 工具结果缓存 */
export const toolCache = new KVCache<{ content: string; isError: boolean }>({
  maxSize: 300,
  defaultTTLMs: 10 * 60 * 1000, // 10 分钟
  similarityThreshold: 0.85
});

/** 记忆检索缓存 */
export const memorySearchCache = new KVCache<Array<{ content: string; score: number }>>({
  maxSize: 100,
  defaultTTLMs: 5 * 60 * 1000, // 5 分钟
  similarityThreshold: 0.90
});
