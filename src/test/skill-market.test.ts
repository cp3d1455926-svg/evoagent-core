/**
 * EvoAgent — SkillMarket 测试 v0.5.0
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillMarket, type MarketConfig } from '../core/skill-market.js';

// 模拟 fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function createMarket(config?: Partial<MarketConfig>): SkillMarket {
  return new SkillMarket('/tmp/skills', config);
}

describe('SkillMarket', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const m = createMarket();
      const cfg = m.getConfig();
      expect(cfg.apiUrl).toBe('https://clawhub.ai/api/v1');
      expect(cfg.cacheEnabled).toBe(true);
      expect(cfg.maxRetries).toBe(3);
    });

    it('should merge partial config with defaults', () => {
      const m = createMarket({ apiUrl: 'http://localhost:8080/api', maxRetries: 1 });
      const cfg = m.getConfig();
      expect(cfg.apiUrl).toBe('http://localhost:8080/api');
      expect(cfg.maxRetries).toBe(1);
      expect(cfg.cacheEnabled).toBe(true); // 默认值
    });

    it('should update config at runtime', () => {
      const m = createMarket();
      m.updateConfig({ cacheEnabled: false });
      expect(m.getConfig().cacheEnabled).toBe(false);
    });
  });

  describe('installed slugs tracking', () => {
    it('should track installed slugs', () => {
      const m = createMarket();
      expect(m.isInstalled('test-skill')).toBe(false);
      m.markInstalled('test-skill');
      expect(m.isInstalled('test-skill')).toBe(true);
      expect(m.getInstalledSlugs()).toEqual(['test-skill']);
      m.markUninstalled('test-skill');
      expect(m.isInstalled('test-skill')).toBe(false);
    });
  });

  describe('search', () => {
    it('should search and cache results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { slug: 'weather', displayName: 'Weather', summary: 'Get weather data', stats: { downloads: 100, stars: 4 } }
          ],
          total: 1
        })
      });

      const m = createMarket();
      const result = await m.search('weather', { limit: 5 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].slug).toBe('weather');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 第二次应该走缓存
      const cached = await m.search('weather', { limit: 5 });
      expect(cached.items).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1); // 没新增请求
    });

    it('should handle 404 gracefully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

      const m = createMarket();
      // 404 返回空结果但不抛异常
      const result = await m.search('nonexistent');
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0 })
        });

      const m = createMarket({ maxRetries: 3, cacheEnabled: false });
      const result = await m.search('retry-test');
      expect(result.items).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should respect disabled cache', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ items: [], total: 0 })
      });

      const m = createMarket({ cacheEnabled: false });
      await m.search('no-cache');
      await m.search('no-cache');
      expect(mockFetch).toHaveBeenCalledTimes(2); // 每次都请求
    });
  });

  describe('getSkill', () => {
    it('should get skill details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          skill: {
            slug: 'test-skill',
            displayName: 'Test Skill',
            summary: 'A test skill',
            tags: { 'utility': {} },
            stats: { downloads: 500, stars: 3, installsAllTime: 100, installsCurrent: 10 },
            owner: { displayName: 'Author', handle: 'author' },
            createdAt: 1000,
            updatedAt: 2000,
            latestVersion: { version: '1.0.0', changelog: 'Initial' }
          }
        })
      });

      const m = createMarket();
      const skill = await m.getSkill('test-skill');
      expect(skill).not.toBeNull();
      expect(skill!.slug).toBe('test-skill');
      expect(skill!.displayName).toBe('Test Skill');
      expect(skill!.author).toBe('Author');
      expect(skill!.version).toBe('1.0.0');
    });

    it('should return null for missing skill', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
      const m = createMarket();
      const skill = await m.getSkill('not-exist');
      expect(skill).toBeNull();
    });
  });

  describe('popular / latest / topRated', () => {
    it('should get popular skills', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: Array.from({ length: 3 }, (_, i) => ({
            slug: `skill-${i}`, displayName: `Skill ${i}`, summary: '',
            stats: { downloads: 1000 - i * 100, stars: 5 - i }
          })),
          total: 3
        })
      });

      const m = createMarket();
      const popular = await m.getPopular(3);
      expect(popular).toHaveLength(3);
    });
  });
});
