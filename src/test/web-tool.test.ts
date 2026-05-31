/**
 * EvoAgent — Web Tool 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WebTool } from '../tools/web.js';

describe('WebTool', () => {
  let tool: WebTool;

  beforeEach(() => {
    tool = new WebTool();
  });

  describe('validation', () => {
    it('should require action parameter', async () => {
      const result = await tool.execute({});
      expect(result.isError).toBe(true);
    });

    it('should return error for unknown action', async () => {
      const result = await tool.execute({ action: 'unknown' as any });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Unknown');
    });

    it('should require query for search', async () => {
      const result = await tool.execute({ action: 'search' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('query is required');
    });

    it('should require query for multi_search', async () => {
      const result = await tool.execute({ action: 'multi_search' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('query is required');
    });

    it('should require url for fetch', async () => {
      const result = await tool.execute({ action: 'fetch' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('url is required');
    });
  });

  describe('search', () => {
    it('should search with tavily engine', async () => {
      const result = await tool.execute({
        action: 'search',
        query: 'EvoAgent AI',
        engine: 'tavily',
        maxResults: 3
      });
      expect(result.isError).toBe(false);
      expect(result.content.length).toBeGreaterThan(10);
    }, 30000);

    it('should default to auto engine selection', async () => {
      const result = await tool.execute({
        action: 'search',
        query: 'TypeScript programming',
        maxResults: 2
      });
      expect(result.isError).toBe(false);
      expect(result.content.length).toBeGreaterThan(10);
    }, 30000);
  });

  describe('multi_search', () => {
    it('should run concurrent multi-engine search', async () => {
      const result = await tool.execute({
        action: 'multi_search',
        query: 'EvoAgent AI agent framework',
        maxResults: 2
      });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Multi-search');
    }, 60000);
  });

  describe('fetch', () => {
    it('should fetch web page content', async () => {
      const result = await tool.execute({
        action: 'fetch',
        url: 'https://example.com',
        maxChars: 500
      });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('This domain');
    }, 30000);

    it('should return error for invalid URL', async () => {
      const result = await tool.execute({
        action: 'fetch',
        url: 'https://invalid-nonexistent-domain-xyz789.com'
      });
      expect(result.isError).toBe(true);
    }, 30000);
  });

  describe('content extraction', () => {
    it('should work end-to-end with fetch', async () => {
      const result = await tool.execute({
        action: 'fetch',
        url: 'https://example.com',
        maxChars: 500
      });
      expect(result.isError).toBe(false);
      // Scripts and nav should be removed, readable text should remain
      expect(result.content).not.toContain('<script>');
      expect(result.content).not.toContain('<style>');
    }, 30000);

    it('should handle large HTML via fetch with truncation', async () => {
      const result = await tool.execute({
        action: 'fetch',
        url: 'https://example.com',
        maxChars: 50
      });
      expect(result.isError).toBe(false);
    }, 30000);
  });
});
