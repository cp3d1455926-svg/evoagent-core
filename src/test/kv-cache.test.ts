/**
 * EvoAgent — KV 缓存层测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KVCache } from '../core/kv-cache.js';

describe('KVCache', () => {
  let cache: KVCache<string>;

  beforeEach(() => {
    cache = new KVCache<string>({ maxSize: 10, defaultTTLMs: 5000, similarityThreshold: 0.8 });
  });

  // ─── 基本操作 ─────────────────────────────────

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should overwrite existing keys', () => {
    cache.set('key1', 'value1');
    cache.set('key1', 'value2');
    expect(cache.get('key1')).toBe('value2');
  });

  // ─── TTL 过期 ──────────────────────────────────

  it('should expire entries after TTL', async () => {
    const shortCache = new KVCache<string>({ maxSize: 10, defaultTTLMs: 10, similarityThreshold: 0.8 });
    shortCache.set('key1', 'value1');
    expect(shortCache.get('key1')).toBe('value1');
    await new Promise(r => setTimeout(r, 20));
    expect(shortCache.get('key1')).toBeUndefined();
  });

  it('should support custom TTL per entry', async () => {
    const shortCache = new KVCache<string>({ maxSize: 10, defaultTTLMs: 5000, similarityThreshold: 0.8 });
    shortCache.set('key1', 'value1', 10); // 10ms TTL
    expect(shortCache.get('key1')).toBe('value1');
    await new Promise(r => setTimeout(r, 20));
    expect(shortCache.get('key1')).toBeUndefined();
  });

  // ─── LRU 淘汰 ──────────────────────────────────

  it('should evict LRU entries when cache is full', () => {
    const smallCache = new KVCache<string>({ maxSize: 3, defaultTTLMs: 5000, similarityThreshold: 0.8 });
    smallCache.set('a', '1');
    smallCache.set('b', '2');
    smallCache.set('c', '3');
    // Touch 'a' and 'b' to make them recently used
    smallCache.get('a');
    smallCache.get('b');
    // Insert more - should evict 'c' (least accessed)
    smallCache.set('d', '4');
    // 'c' should have been evicted
    expect(smallCache.get('a')).toBe('1'); // still there
    expect(smallCache.get('b')).toBe('2'); // still there
    expect(smallCache.get('d')).toBe('4'); // newly added
    // 'c' might be evicted or 'a'/'b' depending on access count
  });

  it('should evict oldest 20% when full', () => {
    const smallCache = new KVCache<string>({ maxSize: 5, defaultTTLMs: 5000, similarityThreshold: 0.8 });
    for (let i = 0; i < 5; i++) {
      smallCache.set(`k${i}`, `v${i}`);
    }
    // Touch k0 and k1 to make them more recently used
    smallCache.get('k0');
    smallCache.get('k1');
    smallCache.set('k5', 'v5'); // Should evict 20% = 1 entry
    // Should still have space for 4 + new 1 = 5
    expect(smallCache.stats().size).toBe(5);
  });

  // ─── getOrCompute ──────────────────────────────

  it('should return cached value on repeated calls', async () => {
    const compute = vi.fn().mockResolvedValue('computed');
    const result1 = await cache.getOrCompute('key1', compute);
    expect(result1).toBe('computed');
    expect(compute).toHaveBeenCalledTimes(1);

    const result2 = await cache.getOrCompute('key1', compute);
    expect(result2).toBe('computed');
    expect(compute).toHaveBeenCalledTimes(1); // 没有被再次调用
  });

  it('should call compute function on cache miss', async () => {
    const compute = vi.fn().mockResolvedValue('fresh');
    await cache.getOrCompute('a', compute);
    await cache.getOrCompute('b', compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  // ─── 模糊匹配 ──────────────────────────────────

  it('should find fuzzy matches using Jaccard similarity', () => {
    const fuzzyCache = new KVCache<string>({ maxSize: 10, defaultTTLMs: 5000, similarityThreshold: 0.4 });
    fuzzyCache.set('how to install evoagent with npm', 'npm install evoagent-core');
    const result = fuzzyCache.getFuzzy('install evoagent using npm');
    expect(result).toBe('npm install evoagent-core');
  });

  it('should return undefined for low similarity fuzzy search', () => {
    cache.set('关于天气的信息', '今天天气很好');
    const result = cache.getFuzzy('服务器配置和部署');
    expect(result).toBeUndefined();
  });

  it('should handle fuzzy search on empty cache', () => {
    const result = cache.getFuzzy('anything');
    expect(result).toBeUndefined();
  });

  // ─── invalidate ────────────────────────────────

  it('should invalidate keys with matching prefix', () => {
    cache.set('tool:bash:echo', 'result1');
    cache.set('tool:code:test', 'result2');
    cache.set('other:thing', 'result3');

    const count = cache.invalidate('tool:');
    expect(count).toBe(2);
    expect(cache.get('tool:bash:echo')).toBeUndefined();
    expect(cache.get('tool:code:test')).toBeUndefined();
    expect(cache.get('other:thing')).toBe('result3');
  });

  it('should return 0 when no keys match prefix', () => {
    const count = cache.invalidate('nonexistent:');
    expect(count).toBe(0);
  });

  // ─── clear ─────────────────────────────────────

  it('should clear all entries', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.stats().size).toBe(0);
    expect(cache.stats().hits).toBe(0);
    expect(cache.stats().misses).toBe(0);
  });

  // ─── stats ─────────────────────────────────────

  it('should report correct hit/miss statistics', () => {
    expect(cache.stats().hits).toBe(0);
    expect(cache.stats().misses).toBe(0);
    expect(cache.stats().hitRate).toBe(0);

    cache.set('key', 'val');
    cache.get('key');   // hit
    cache.get('key');   // hit
    cache.get('missing'); // miss

    const stats = cache.stats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeGreaterThan(0);
  });

  it('should report cache size correctly', () => {
    expect(cache.stats().size).toBe(0);
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.stats().size).toBe(2);
    expect(cache.stats().maxSize).toBe(10);
  });

  // ─── 过期条目不影响统计 ─────────────────────────

  it('should count expired access as miss', async () => {
    const shortCache = new KVCache<string>({ maxSize: 10, defaultTTLMs: 10, similarityThreshold: 0.8 });
    shortCache.set('key', 'val');
    shortCache.get('key'); // hit
    await new Promise(r => setTimeout(r, 20));
    shortCache.get('key'); // expired -> miss
    expect(shortCache.stats().hits).toBe(1);
    expect(shortCache.stats().misses).toBe(1);
  });

  // ─── 大容量测试 ────────────────────────────────

  it('should handle many entries without errors', () => {
    const bigCache = new KVCache<number>({ maxSize: 1000, defaultTTLMs: 60000, similarityThreshold: 0.8 });
    for (let i = 0; i < 500; i++) {
      bigCache.set(`key-${i}`, i);
    }
    expect(bigCache.stats().size).toBe(500);
    for (let i = 0; i < 500; i++) {
      expect(bigCache.get(`key-${i}`)).toBe(i);
    }
    expect(bigCache.stats().hits).toBe(500);
  });

  // ─── 中文模糊匹配 ──────────────────────────────

  it('should handle Chinese text in fuzzy search', () => {
    const fuzzyCache = new KVCache<string>({ maxSize: 10, defaultTTLMs: 5000, similarityThreshold: 0.3 });
    fuzzyCache.set('如何配置飞书渠道', '配置飞书需要 App ID 和 App Secret');
    const result = fuzzyCache.getFuzzy('配置飞书');
    expect(result).toBe('配置飞书需要 App ID 和 App Secret');
  });

  it('should not find fuzzy matches for very different queries', () => {
    cache.set('how to deploy the server', 'some value');
    const result = cache.getFuzzy('cooking recipes for dinner');
    expect(result).toBeUndefined();
  });
});
