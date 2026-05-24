/**
 * EvoAgent — Web 工具
 * 
 * 网页搜索和抓取
 * 支持 DuckDuckGo 搜索和网页内容提取
 */

import type { Tool, ToolExecuteResult } from './tool-executor.js';

interface WebArgs {
  action: 'search' | 'fetch';
  query?: string;
  url?: string;
  maxResults?: number;
  maxChars?: number;
}

export class WebTool implements Tool {
  name = 'web';
  description = 'Search the web (DuckDuckGo) or fetch web page content. Actions: search, fetch.';
  permissionLevel = 'network' as const;

  parameters = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['search', 'fetch'], description: 'Web operation' },
      query: { type: 'string', description: 'Search query (for search action)' },
      url: { type: 'string', description: 'URL to fetch (for fetch action)' },
      maxResults: { type: 'number', description: 'Max search results (default 5)' },
      maxChars: { type: 'number', description: 'Max chars to return (default 10000)' }
    },
    required: ['action']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action, query, url, maxResults = 5, maxChars = 10000 } = args as unknown as WebArgs;

    try {
      switch (action) {
        case 'search': {
          if (!query) return { content: 'Error: query is required for search', isError: true };
          return await this.search(query, maxResults);
        }

        case 'fetch': {
          if (!url) return { content: 'Error: url is required for fetch', isError: true };
          return await this.fetch(url, maxChars);
        }

        default:
          return { content: `Unknown action: ${action}`, isError: true };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Web error: ${message}`, isError: true };
    }
  }

  /**
   * DuckDuckGo 即时搜索
   */
  private async search(query: string, maxResults: number): Promise<ToolExecuteResult> {
    try {
      // 使用 DuckDuckGo 即时搜索 API
      const encoded = encodeURIComponent(query);
      const apiUrl = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;

      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo API returned ${response.status}`);
      }

      const data = await response.json() as {
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
        Results?: Array<{ Text?: string; FirstURL?: string }>;
      };

      const parts: string[] = [];

      if (data.AbstractText) {
        parts.push(`📋 Summary: ${data.AbstractText}`);
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

      if (parts.length === 0) {
        return { content: `No results found for "${query}"`, isError: false };
      }

      return { content: parts.join('\n'), isError: false };
    } catch (err) {
      // 降级：返回搜索链接
      const encoded = encodeURIComponent(query);
      return {
        content: `Search unavailable. Try: https://duckduckgo.com/?q=${encoded}`,
        isError: false
      };
    }
  }

  /**
   * 抓取网页内容
   */
  private async fetch(url: string, maxChars: number): Promise<ToolExecuteResult> {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,text/plain',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();

    // 简单 HTML → 文本提取
    const extracted = this.extractText(text);
    const trimmed = extracted.length > maxChars
      ? extracted.slice(0, maxChars) + `\n... [truncated, ${extracted.length} total chars]`
      : extracted;

    return {
      content: `📄 ${url}\n\n${trimmed}`,
      isError: false
    };
  }

  /**
   * 从 HTML 中提取纯文本
   */
  private extractText(html: string): string {
    // 移除 script 和 style 标签
    let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    // 移除 HTML 标签
    text = text.replace(/<[^>]+>/g, ' ');
    // 解码常见 HTML 实体
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
    // 压缩空白
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }
}
