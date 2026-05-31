/**
 * EvoAgent — Web 工具 v2.0
 *
 * 多引擎网络搜索 + 智能网页抓取
 * v0.5.0 改进：
 * - 多搜索引擎：Tavily / Serper / Bing / DuckDuckGo
 * - 搜索结果缓存
 * - 智能内容提取（Readability 算法）
 * - 并发搜索 + 结果融合
 * - 自动降级
 */

import type { Tool, ToolExecuteResult } from './tool-executor.js';
import { toolCache } from '../core/kv-cache.js';

interface WebArgs {
  action: 'search' | 'fetch' | 'multi_search';
  query?: string;
  url?: string;
  maxResults?: number;
  maxChars?: number;
  engine?: 'auto' | 'tavily' | 'serper' | 'bing' | 'duckduckgo';
  /** multi_search: 并发使用多个引擎 */
  engines?: Array<'tavily' | 'serper' | 'bing' | 'duckduckgo'>;
}

export class WebTool implements Tool {
  name = 'web';
  description = 'Search the web or fetch page content. Actions: search (single engine), multi_search (concurrent engines), fetch (page content). Engines: tavily, serper, bing, duckduckgo.';
  permissionLevel = 'network' as const;

  parameters = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['search', 'fetch', 'multi_search'], description: 'Web operation' },
      query: { type: 'string', description: 'Search query (for search/multi_search)' },
      url: { type: 'string', description: 'URL to fetch (for fetch action)' },
      maxResults: { type: 'number', description: 'Max results per engine (default 5, max 10)' },
      maxChars: { type: 'number', description: 'Max chars for fetch (default 8000)' },
      engine: { type: 'string', enum: ['auto', 'tavily', 'serper', 'bing', 'duckduckgo'], description: 'Search engine (default: auto)' },
      engines: { type: 'array', items: { type: 'string', enum: ['tavily', 'serper', 'bing', 'duckduckgo'] }, description: 'Engines for multi_search (default: all)' }
    },
    required: ['action']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action } = args as unknown as WebArgs;
    try {
      switch (action) {
        case 'search': {
          const { query, maxResults = 5, engine = 'auto' } = args as unknown as WebArgs;
          if (!query) return { content: 'Error: query is required', isError: true };
          return await this.search(query, maxResults, engine);
        }
        case 'multi_search': {
          const { query, maxResults = 5, engines } = args as unknown as WebArgs;
          if (!query) return { content: 'Error: query is required', isError: true };
          return await this.multiSearch(query, maxResults, engines);
        }
        case 'fetch': {
          const { url, maxChars = 8000 } = args as unknown as WebArgs;
          if (!url) return { content: 'Error: url is required', isError: true };
          return await this.fetch(url, maxChars);
        }
        default:
          return { content: `Unknown action: ${action}`, isError: true };
      }
    } catch (err) {
      return { content: `Web error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }

  // ─── 单引擎搜索 ─────────────────────────────────────

  private async search(query: string, maxResults: number, engine: string): Promise<ToolExecuteResult> {
    // 缓存查找
    const cacheKey = `web:search:${engine}:${query}:${maxResults}`;
    const cached = toolCache.get(cacheKey);
    if (cached) return { content: cached.content, isError: cached.isError };

    const engines = engine === 'auto' ? ['tavily', 'serper', 'duckduckgo'] : [engine];
    let lastError = '';

    for (const eng of engines) {
      try {
        let result: ToolExecuteResult;
        switch (eng) {
          case 'tavily': result = await this.searchTavily(query, maxResults); break;
          case 'serper': result = await this.searchSerper(query, maxResults); break;
          case 'bing': result = await this.searchBing(query, maxResults); break;
          case 'duckduckgo': result = await this.searchDuckDuckGo(query, maxResults); break;
          default: continue;
        }
        if (!result.isError) {
          toolCache.set(cacheKey, result, 600000); // 10 分钟缓存
          return result;
        }
        lastError = result.content;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return { content: `All search engines failed. Last error: ${lastError}`, isError: true };
  }

  // ─── 多引擎并发搜索 ─────────────────────────────────

  private async multiSearch(
    query: string, maxResults: number, engines?: string[]
  ): Promise<ToolExecuteResult> {
    const cacheKey = `web:multi:${engines?.join(',') ?? 'all'}:${query}:${maxResults}`;
    const cached = toolCache.get(cacheKey);
    if (cached) return { content: cached.content, isError: cached.isError };

    const allEngines = engines ?? ['tavily', 'serper', 'duckduckgo'];
    const results = await Promise.allSettled(
      allEngines.map(async (eng) => {
        switch (eng) {
          case 'tavily': return this.searchTavily(query, maxResults);
          case 'serper': return this.searchSerper(query, maxResults);
          case 'bing': return this.searchBing(query, maxResults);
          case 'duckduckgo': return this.searchDuckDuckGo(query, maxResults);
          default: return null;
        }
      })
    );

    const parts: string[] = [`🔍 Multi-search results for: "${query}"\n`];
    let successCount = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const engName = allEngines[i];
      if (r.status === 'fulfilled' && r.value && !r.value.isError) {
        parts.push(`━━━ ${engName.toUpperCase()} ━━━`);
        parts.push(r.value.content);
        parts.push('');
        successCount++;
      } else {
        parts.push(`━━━ ${engName.toUpperCase()} ━━━ [failed]`);
        parts.push('');
      }
    }

    if (successCount === 0) {
      return { content: 'All search engines failed', isError: true };
    }

    const content = parts.join('\n');
    toolCache.set(cacheKey, { content, isError: false }, 600000);
    return { content, isError: false };
  }

  // ─── Tavily 搜索 ────────────────────────────────────

  private async searchTavily(query: string, maxResults: number): Promise<ToolExecuteResult> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error('TAVILY_API_KEY not set');

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.min(maxResults, 10),
        search_depth: 'advanced',
        include_answer: true
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) throw new Error(`Tavily API ${res.status}`);

    const data = await res.json() as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string }>;
    };

    const parts: string[] = [];
    if (data.answer) parts.push(`📋 ${data.answer}\n`);
    if (data.results) {
      data.results.forEach((r, i) => {
        parts.push(`${i + 1}. ${r.title}`);
        parts.push(`   ${r.content.slice(0, 200)}`);
        parts.push(`   🔗 ${r.url}`);
      });
    }

    return { content: parts.join('\n') || 'No results', isError: false };
  }

  // ─── Serper (Google) 搜索 ───────────────────────────

  private async searchSerper(query: string, maxResults: number): Promise<ToolExecuteResult> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) throw new Error('SERPER_API_KEY not set');

    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: Math.min(maxResults, 10) }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) throw new Error(`Serper API ${res.status}`);

    const data = await res.json() as {
      answerBox?: { answer?: string; snippet?: string };
      organic?: Array<{ title: string; link: string; snippet: string }>;
    };

    const parts: string[] = [];
    if (data.answerBox) {
      const a = data.answerBox;
      parts.push(`📋 ${a.answer || a.snippet || ''}\n`);
    }
    if (data.organic) {
      data.organic.forEach((r, i) => {
        parts.push(`${i + 1}. ${r.title}`);
        parts.push(`   ${r.snippet?.slice(0, 200) || ''}`);
        parts.push(`   🔗 ${r.link}`);
      });
    }

    return { content: parts.join('\n') || 'No results', isError: false };
  }

  // ─── Bing 搜索 ──────────────────────────────────────

  private async searchBing(query: string, maxResults: number): Promise<ToolExecuteResult> {
    const apiKey = process.env.BING_SEARCH_API_KEY;
    if (!apiKey) throw new Error('BING_SEARCH_API_KEY not set');

    const res = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${Math.min(maxResults, 10)}`,
      { headers: { 'Ocp-Apim-Subscription-Key': apiKey }, signal: AbortSignal.timeout(15000) }
    );

    if (!res.ok) throw new Error(`Bing API ${res.status}`);

    const data = await res.json() as {
      webPages?: { value?: Array<{ name: string; url: string; snippet: string }> };
    };

    const parts: string[] = [];
    if (data.webPages?.value) {
      data.webPages.value.forEach((r, i) => {
        parts.push(`${i + 1}. ${r.name}`);
        parts.push(`   ${r.snippet?.slice(0, 200) || ''}`);
        parts.push(`   🔗 ${r.url}`);
      });
    }

    return { content: parts.join('\n') || 'No results', isError: false };
  }

  // ─── DuckDuckGo 搜索 ────────────────────────────────

  private async searchDuckDuckGo(query: string, maxResults: number): Promise<ToolExecuteResult> {
    const encoded = encodeURIComponent(query);

    // 方法 1: 官方 Instant Answer API
    try {
      const res = await fetch(
        `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'EvoAgent/0.4.1' }, signal: AbortSignal.timeout(15000) }
      );

      if (res.ok) {
        const data = await res.json() as {
          AbstractText?: string; AbstractURL?: string;
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
          Results?: Array<{ Text?: string; FirstURL?: string }>;
        };

        const parts: string[] = [];
        if (data.AbstractText) {
          parts.push(`📋 ${data.AbstractText}`);
          if (data.AbstractURL) parts.push(`🔗 ${data.AbstractURL}`);
        }
        const topics = data.RelatedTopics ?? data.Results ?? [];
        let count = 0;
        for (const topic of topics) {
          if (count >= maxResults) break;
          if (topic.Text) {
            parts.push(`\n${count + 1}. ${topic.Text}`);
            if (topic.FirstURL) parts.push(`   ${topic.FirstURL}`);
            count++;
          }
        }

        if (parts.length > 0) {
          return { content: parts.join('\n'), isError: false };
        }
      }
    } catch { /* 方法 1 失败，尝试方法 2 */ }

    // 方法 2: HTML 页面解析（降级）
    try {
      const res = await fetch(
        `https://html.duckduckgo.com/html/?q=${encoded}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: AbortSignal.timeout(15000) }
      );
      if (res.ok) {
        const html = await res.text();
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        // 简单正则提取搜索结果
        const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
        const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;
        let match;
        const urls: string[] = [];
        const titles: string[] = [];
        while ((match = resultRegex.exec(html)) !== null) {
          urls.push(match[1]);
          titles.push(match[2].replace(/<[^>]+>/g, ''));
        }
        const snippets: string[] = [];
        while ((match = snippetRegex.exec(html)) !== null) {
          snippets.push(match[1].replace(/<[^>]+>/g, ''));
        }
        for (let i = 0; i < Math.min(maxResults, urls.length); i++) {
          results.push({ title: titles[i] || '', url: urls[i], snippet: snippets[i] || '' });
        }
        if (results.length > 0) {
          const parts = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet.slice(0, 200)}\n   🔗 ${r.url}`);
          return { content: `🔍 DuckDuckGo (HTML fallback) results for: "${query}"\n\n${parts.join('\n\n')}`, isError: false };
        }
      }
    } catch { /* 方法 2 也失败 */ }

    throw new Error('DuckDuckGo search failed: both API and HTML fallback unavailable');
  }

  // ─── 智能网页抓取 ────────────────────────────────────

  private async fetch(url: string, maxChars: number): Promise<ToolExecuteResult> {
    // 缓存查找
    const cacheKey = `web:fetch:${url}:${maxChars}`;
    const cached = toolCache.get(cacheKey);
    if (cached) return { content: cached.content, isError: cached.isError };

    const res = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,text/plain',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(20000)
    });

    if (!res.ok) return { content: `HTTP ${res.status}: ${res.statusText}`, isError: true };

    const html = await res.text();
    const text = this.extractContent(html);
    const trimmed = text.length > maxChars
      ? text.slice(0, maxChars) + `\n... [truncated, ${text.length} total chars]`
      : text;

    const content = `📄 ${url}\n\n${trimmed}`;
    toolCache.set(cacheKey, { content, isError: false }, 300000); // 5 分钟缓存
    return { content, isError: false };
  }

  // ─── 智能内容提取 ────────────────────────────────────

  private extractContent(html: string): string {
    // 移除无用标签
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // 尝试提取 <main> 或 <article> 内容
    const mainMatch = text.match(/<main[\s\S]*?<\/main>/gi) || text.match(/<article[\s\S]*?<\/article>/gi);
    if (mainMatch && mainMatch.join('').length > 500) {
      text = mainMatch.join('\n');
    }

    // 移除 HTML 标签
    text = text.replace(/<[^>]+>/g, '\n');

    // 解码实体
    text = text
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');

    // 清理空白，保留段落结构
    const paragraphs = text.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length > 20);

    return paragraphs.join('\n\n');
  }
}
