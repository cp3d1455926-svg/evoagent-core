/**
 * EvoAgent — 工作区管理
 *
 * 项目文件浏览、读写、搜索
 */

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
  size?: number;
  modified?: number;
}

export interface WorkspaceConfig {
  root: string;
  excludePatterns: string[];
}

export class Workspace {
  private config: WorkspaceConfig;

  constructor(config: Partial<WorkspaceConfig> = {}) {
    this.config = {
      root: config.root ?? process.cwd(),
      excludePatterns: config.excludePatterns ?? [
        'node_modules', '.git', '.codegraph', 'dist', '.next', '__pycache__', '.cache'
      ]
    };
  }

  get root(): string { return this.config.root; }

  /**
   * 读取文件内容
   */
  async readFile(filePath: string): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const fullPath = path.resolve(this.config.root, filePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  /**
   * 写入文件内容
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const fullPath = path.resolve(this.config.root, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * 删除文件或目录
   */
  async delete(filePath: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const fullPath = path.resolve(this.config.root, filePath);
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.unlink(fullPath);
    }
  }

  /**
   * 重命名/移动文件
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = path.resolve(this.config.root, oldPath);
    const dst = path.resolve(this.config.root, newPath);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.rename(src, dst);
  }

  /**
   * 检查文件/目录是否存在
   */
  async exists(filePath: string): Promise<boolean> {
    const fs = await import('fs/promises');
    const path = await import('path');
    try {
      await fs.access(path.resolve(this.config.root, filePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出目录内容
   */
  async listDir(dirPath: string = '.'): Promise<FileEntry[]> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const fullPath = path.resolve(this.config.root, dirPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const results: FileEntry[] = [];
    for (const entry of entries) {
      if (this.config.excludePatterns.some(p => entry.name === p || entry.name.startsWith('.'))) {
        continue;
      }
      const entryPath = dirPath === '.' ? entry.name : `${dirPath}/${entry.name}`;
      const stat = await fs.stat(path.resolve(fullPath, entry.name)) as import('fs').Stats;
      results.push({
        name: entry.name,
        path: entryPath,
        isDir: entry.isDirectory(),
        size: stat.size,
        modified: stat.mtimeMs
      });
    }

    // 目录在前，文件在后，按名称排序
    results.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  /**
   * 递归获取目录树（限制深度）
   */
  async getTree(dirPath: string = '.', maxDepth: number = 3): Promise<FileEntry[]> {
    if (maxDepth <= 0) return [];
    const entries = await this.listDir(dirPath);
    for (const entry of entries) {
      if (entry.isDir) {
        entry.children = await this.getTree(entry.path, maxDepth - 1);
      }
    }
    return entries;
  }

  /**
   * 跨文件搜索（grep）
   */
  async search(query: string, options: {
    pattern?: string;
    caseSensitive?: boolean;
    regex?: boolean;
    filePattern?: string;
    maxResults?: number;
  } = {}): Promise<Array<{ file: string; line: number; text: string; matchStart: number; matchEnd: number }>> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { caseSensitive = false, regex = false, filePattern = '*', maxResults = 100 } = options;

    let re: RegExp;
    if (regex) {
      re = new RegExp(query, caseSensitive ? 'g' : 'gi');
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      re = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
    }

    const results: Array<{ file: string; line: number; text: string; matchStart: number; matchEnd: number }> = [];
    const fileRegex = filePattern !== '*' ? new RegExp('^' + filePattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$') : null;

    const walk = async (dir: string, depth: number) => {
      if (results.length >= maxResults) return;
      try {
        const entries = await fs.readdir(path.resolve(this.config.root, dir), { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= maxResults) break;
          if (this.config.excludePatterns.some(p => entry.name === p)) continue;
          if (entry.name.startsWith('.')) continue;

          const entryPath = dir === '.' ? entry.name : `${dir}/${entry.name}`;
          const fullPath = path.resolve(this.config.root, entryPath);

          if (entry.isDirectory()) {
            if (depth < 5) await walk(entryPath, depth + 1);
          } else {
            if (fileRegex && !fileRegex.test(entry.name)) continue;
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              const lines = content.split('\n');
              for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                re.lastIndex = 0;
                const match = re.exec(lines[i]);
                if (match) {
                  results.push({
                    file: entryPath,
                    line: i + 1,
                    text: lines[i],
                    matchStart: match.index,
                    matchEnd: match.index + match[0].length
                  });
                }
              }
            } catch {
              // 二进制文件跳过
            }
          }
        }
      } catch {
        // 目录不可读
      }
    };

    await walk('.', 0);
    return results;
  }

  /**
   * 获取文件信息
   */
  async stat(filePath: string): Promise<{ size: number; modified: number; isDir: boolean } | null> {
    const fs = await import('fs/promises');
    const path = await import('path');
    try {
      const stat = await fs.stat(path.resolve(this.config.root, filePath)) as import('fs').Stats;
      return { size: stat.size, modified: stat.mtimeMs, isDir: stat.isDirectory() };
    } catch {
      return null;
    }
  }

  /**
   * 创建目录
   */
  async mkdir(dirPath: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    await fs.mkdir(path.resolve(this.config.root, dirPath), { recursive: true });
  }
}
