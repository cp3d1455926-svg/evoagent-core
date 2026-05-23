/**
 * EvoAgent — Web 工具
 * 
 * 网页搜索和抓取
 */

import type { Tool, ToolExecuteResult } from './tool-executor.js';

interface WebArgs {
  action: 'search' | 'fetch';
  query?: string;
  url?: string;
  maxResults?: number;
}

export class WebTool implements Tool {
  name = 'web';
  description = 'Search the web or fetch web page content. Actions: search, fetch.';
  permissionLevel = 'network' as const;

  parameters = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['search', 'fetch'], description: 'Web operation' },
      query: { type: 'string', description: 'Search query (for search action)' },
      url: { type: 'string', description: 'URL to fetch (for fetch action)' },
      maxResults: { type: 'number', description: 'Max search results (default 5)' }
    },
    required: ['action']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action, query, url, maxResults = 5 } = args as unknown as WebArgs;

    try {
      switch (action) {
        case 'search': {
          if (!query) return { content: 'Error: query is required for search', isError: true };
          // 使用 curl 调用 DuckDuckGo 即时搜索 API
          const encoded = encodeURIComponent(query);
          const result = await this.fetchUrl(`https://duckduckgo.com/?q=${encoded}&format=json`);
          return {
            content: `Search results for "${query}":\n${result}`,
            isError: false
          };
        }

        case 'fetch': {
          if (!url) return { content: 'Error: url is required for fetch', isError: true };
          const content = await this.fetchUrl(url);
          return {
            content: content.slice(0, 10000), // 截断到 10K 字符
            isError: false
          };
        }

        default:
          return { content: `Unknown action: ${action}`, isError: true };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Web error: ${message}`, isError: true };
    }
  }

  private async fetchUrl(url: string): Promise<string> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(`curl -sL --max-time 15 "${url}"`, { maxBuffer: 5 * 1024 * 1024 });
    return stdout;
  }
}
