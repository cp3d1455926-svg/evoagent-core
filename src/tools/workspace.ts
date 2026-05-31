/**
 * EvoAgent — 工作区工具 v0.5.0
 *
 * 将 Workspace 类的能力暴露给 Agent 调用：
 *   探索目录树 → 读/写/搜索文件 → 管理项目结构
 */

import type { Tool, ToolExecuteResult } from './tool-executor.js';
import { Workspace } from '../core/workspace.js';

type WorkspaceAction =
  | 'tree' | 'list' | 'read' | 'write'
  | 'search' | 'delete' | 'rename' | 'mkdir';

interface WorkspaceArgs {
  action: WorkspaceAction;
  path?: string;
  content?: string;
  query?: string;
  newPath?: string;
  depth?: number;
  options?: {
    pattern?: string;
    caseSensitive?: boolean;
    regex?: boolean;
    filePattern?: string;
    maxResults?: number;
  };
}

export class WorkspaceTool implements Tool {
  name = 'workspace';
  description = `Manage the project workspace. Actions:
  tree    — Show directory tree (default: project root, depth-3)
  list    — List files in a directory
  read    — Read a file's content
  write   — Write or overwrite a file (creates parent dirs)
  search  — Grep across files for matching text
  delete  — Delete a file or directory
  rename  — Rename or move a file/directory
  mkdir   — Create a directory (recursive)`;
  permissionLevel = 'write' as const;

  private ws: Workspace;

  constructor(workspace?: Workspace) {
    this.ws = workspace ?? new Workspace();
  }

  parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['tree', 'list', 'read', 'write', 'search', 'delete', 'rename', 'mkdir'],
        description: 'Operation to perform'
      },
      path: { type: 'string', description: 'File or directory path (relative to workspace root)' },
      content: { type: 'string', description: 'File content (for write action)' },
      query: { type: 'string', description: 'Search query (for search action)' },
      newPath: { type: 'string', description: 'Target path (for rename action)' },
      depth: { type: 'number', description: 'Tree depth (for tree action, default 3)' },
      options: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search file pattern (for search)' },
          caseSensitive: { type: 'boolean' },
          regex: { type: 'boolean' },
          filePattern: { type: 'string', description: 'Glob pattern to filter files (for search)' },
          maxResults: { type: 'number', description: 'Max search results (default 100)' }
        }
      }
    },
    required: ['action']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action, path, content, query, newPath, depth, options } = args as unknown as WorkspaceArgs;

    try {
      switch (action) {
        // ── 目录树 ───────────────────────────────────
        case 'tree': {
          const tree = await this.ws.getTree(path ?? '.', depth ?? 3);
          const formatted = this.formatTree(tree, '');
          const root = this.ws.root;
          return {
            content: `📂 Workspace: ${root}\n\n${formatted || '(empty)'}`,
            isError: false
          };
        }

        // ── 列目录 ───────────────────────────────────
        case 'list': {
          const entries = await this.ws.listDir(path ?? '.');
          if (entries.length === 0) return { content: '(empty directory)', isError: false };

          const lines = entries.map(e => {
            const icon = e.isDir ? '📁' : '📄';
            const size = e.size != null ? ` (${this.formatSize(e.size)})` : '';
            return `  ${icon} ${e.name}${size}`;
          });
          return { content: lines.join('\n'), isError: false };
        }

        // ── 读文件 ───────────────────────────────────
        case 'read': {
          if (!path) return { content: 'Error: "path" is required for read action', isError: true };
          const data = await this.ws.readFile(path);
          return { content: data, isError: false };
        }

        // ── 写文件 ───────────────────────────────────
        case 'write': {
          if (!path) return { content: 'Error: "path" is required for write action', isError: true };
          if (content === undefined) return { content: 'Error: "content" is required for write action', isError: true };
          await this.ws.writeFile(path, content);
          return { content: `✅ ${path} written (${this.formatSize(Buffer.byteLength(content, 'utf-8'))})`, isError: false };
        }

        // ── 搜索 ─────────────────────────────────────
        case 'search': {
          if (!query) return { content: 'Error: "query" is required for search action', isError: true };
          const results = await this.ws.search(query, {
            pattern: options?.pattern,
            caseSensitive: options?.caseSensitive,
            regex: options?.regex,
            filePattern: options?.filePattern,
            maxResults: options?.maxResults
          });

          if (results.length === 0) return { content: `🔍 No results for "${query}"`, isError: false };

          const lines = results.map(r =>
            `  ${r.file}:${r.line}  ${r.text.trim()}`
          );
          return {
            content: `🔍 "${query}" → ${results.length} matches\n\n${lines.join('\n')}`,
            isError: false
          };
        }

        // ── 删除 ─────────────────────────────────────
        case 'delete': {
          if (!path) return { content: 'Error: "path" is required for delete action', isError: true };
          await this.ws.delete(path);
          return { content: `🗑️  Deleted: ${path}`, isError: false };
        }

        // ── 重命名 ───────────────────────────────────
        case 'rename': {
          if (!path) return { content: 'Error: "path" is required for rename action', isError: true };
          if (!newPath) return { content: 'Error: "newPath" is required for rename action', isError: true };
          await this.ws.rename(path, newPath);
          return { content: `📎 Renamed: ${path} → ${newPath}`, isError: false };
        }

        // ── 创建目录 ─────────────────────────────────
        case 'mkdir': {
          if (!path) return { content: 'Error: "path" is required for mkdir action', isError: true };
          await this.ws.mkdir(path);
          return { content: `📁 Directory created: ${path}/`, isError: false };
        }

        default:
          return { content: `Error: Unknown workspace action "${action}"`, isError: true };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Workspace error: ${msg}`, isError: true };
    }
  }

  // ── 辅助方法 ────────────────────────────────────────

  private formatTree(entries: import('../core/workspace.js').FileEntry[], prefix: string): string {
    const lines: string[] = [];
    for (const entry of entries) {
      const icon = entry.isDir ? '📁' : '📄';
      const size = entry.size != null ? ` (${this.formatSize(entry.size)})` : '';
      lines.push(`${prefix}  ${icon} ${entry.name}${size}`);
      if (entry.children && entry.children.length > 0) {
        lines.push(this.formatTree(entry.children, prefix + '  '));
      }
    }
    return lines.join('\n');
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
