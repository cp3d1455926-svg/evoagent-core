/**
 * EvoAgent — Skill 市场 v0.5.0
 *
 * 浏览、搜索、安装 ClawHub 社区 Skill
 *
 * 优化：
 * - 响应缓存（避免重复请求 ClawHub API）
 * - 网络重试（指数退避）
 * - 完整 Skill 下载（不仅仅是 SKILL.md）
 * - 可配置 API URL
 */

export interface MarketSkill {
  slug: string;
  displayName: string;
  summary: string;
  version: string;
  tags: string[];
  downloads: number;
  stars: number;
  installsAllTime: number;
  installsCurrent: number;
  author: string;
  authorHandle: string;
  authorImage?: string;
  /** 该 Skill 的文件列表（URL → 目标路径） */
  files?: Array<{ url: string; path: string; content?: string }>;
  createdAt: number;
  updatedAt: number;
  changelog: string;
}

export interface MarketSearchResult {
  items: MarketSkill[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MarketConfig {
  /** ClawHub API 基础 URL */
  apiUrl: string;
  /** 是否启用响应缓存 */
  cacheEnabled: boolean;
  /** 搜索缓存 TTL（毫秒） */
  searchCacheTTLMs: number;
  /** 详情缓存 TTL（毫秒） */
  detailCacheTTLMs: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 下载超时（毫秒） */
  downloadTimeoutMs: number;
}

const DEFAULT_CONFIG: MarketConfig = {
  apiUrl: 'https://clawhub.ai/api/v1',
  cacheEnabled: true,
  searchCacheTTLMs: 5 * 60 * 1000,  // 5 分钟
  detailCacheTTLMs: 30 * 60 * 1000, // 30 分钟
  maxRetries: 3,
  downloadTimeoutMs: 30000
};

export class SkillMarket {
  private skillsDir: string;
  private installedSlugs: Set<string> = new Set();
  private config: MarketConfig;
  /** 简单的内存缓存（避免依赖 toolCache 的类型约束） */
  private cache: Map<string, { value: unknown; expiresAt: number }> = new Map();

  constructor(skillsDir: string, config?: Partial<MarketConfig>) {
    this.skillsDir = skillsDir;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 获取当前配置（只读副本） */
  getConfig(): MarketConfig {
    return { ...this.config };
  }

  /** 更新配置 */
  updateConfig(partial: Partial<MarketConfig>): void {
    Object.assign(this.config, partial);
  }

  /**
   * 标记已安装的 Skill
   */
  markInstalled(slug: string): void {
    this.installedSlugs.add(slug);
  }

  /**
   * 取消已安装标记
   */
  markUninstalled(slug: string): void {
    this.installedSlugs.delete(slug);
  }

  /**
   * 检查是否已安装
   */
  isInstalled(slug: string): boolean {
    return this.installedSlugs.has(slug);
  }

  /**
   * 获取已安装列表
   */
  getInstalledSlugs(): string[] {
    return Array.from(this.installedSlugs);
  }

  // ── 带缓存的 API 调用 ──────────────────────────────

  /**
   * 带重试和缓存的 fetch
   */
  private async apiFetch<T>(
    path: string,
    options: {
      cacheKey?: string;
      cacheTTLMs?: number;
      transform?: (data: any) => T;
    } = {}
  ): Promise<T> {
    const { cacheKey, cacheTTLMs, transform } = options;

    // 缓存命中
    if (this.config.cacheEnabled && cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.value as T;
      }
    }

    const url = `${this.config.apiUrl}${path}`;
    const maxRetries = this.config.maxRetries;
    const baseDelay = 1000;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.downloadTimeoutMs);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
          if (res.status === 404) {
            // 404 不重试
            const empty = (transform ? transform({}) : {}) as T;
            return empty;
          }
          throw new Error(`ClawHub API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        const result = transform ? transform(data) : (data as T);

        // 写入缓存
        if (this.config.cacheEnabled && cacheKey) {
          this.cache.set(cacheKey, {
            value: result,
            expiresAt: Date.now() + (cacheTTLMs ?? this.config.detailCacheTTLMs)
          });
        }

        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries && !(lastError.message.includes('404'))) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error(`Request failed: ${url}`);
  }

  /**
   * 搜索 ClawHub 市场
   */
  async search(query: string, options: {
    limit?: number;
    offset?: number;
    sort?: 'relevance' | 'downloads' | 'stars' | 'updated';
  } = {}): Promise<MarketSearchResult> {
    const { limit = 20, offset = 0, sort = 'relevance' } = options;

    const params = new URLSearchParams();
    if (query) params.set('search', query);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (sort !== 'relevance') params.set('sort', sort);

    const cacheKey = `market:search:${params.toString()}`;

    return this.apiFetch<MarketSearchResult>(`/skills?${params}`, {
      cacheKey,
      cacheTTLMs: this.config.searchCacheTTLMs,
      transform: (data: any) => {
        const items: MarketSkill[] = (data.items || []).map(this.mapApiSkill);
        return {
          items,
          total: data.total ?? items.length,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit
        };
      }
    });
  }

  /**
   * 获取热门 Skill
   */
  async getPopular(limit: number = 10): Promise<MarketSkill[]> {
    return this.search('', { limit, sort: 'downloads' }).then(r => r.items);
  }

  /**
   * 获取最新 Skill
   */
  async getLatest(limit: number = 10): Promise<MarketSkill[]> {
    return this.search('', { limit, sort: 'updated' }).then(r => r.items);
  }

  /**
   * 获取高星 Skill
   */
  async getTopRated(limit: number = 10): Promise<MarketSkill[]> {
    return this.search('', { limit, sort: 'stars' }).then(r => r.items);
  }

  /**
   * 获取单个 Skill 详情
   */
  async getSkill(slug: string): Promise<MarketSkill | null> {
    const cacheKey = `market:skill:${slug}`;
    const result = await this.apiFetch<MarketSkill | null>(`/skills/${slug}`, {
      cacheKey,
      cacheTTLMs: this.config.detailCacheTTLMs,
      transform: (data: any) => {
        if (!data || (!data.skill && !data.slug)) return null;
        return this.mapApiSkill(data.skill ?? data);
      }
    });
    return result ?? null;
  }

  /**
   * 批量安装 Skill
   */
  async installMany(slugs: string[]): Promise<{
    succeeded: string[];
    failed: Array<{ slug: string; error: string }>;
  }> {
    const succeeded: string[] = [];
    const failed: Array<{ slug: string; error: string }> = [];

    for (const slug of slugs) {
      const result = await this.install(slug);
      if (result.success) {
        succeeded.push(slug);
      } else {
        failed.push({ slug, error: result.error ?? 'Unknown error' });
      }
    }

    return { succeeded, failed };
  }

  /**
   * 安装 Skill（从 ClawHub 下载）
   */
  async install(slug: string): Promise<{ success: boolean; error?: string }> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // 获取 Skill 详情
      const skill = await this.getSkill(slug);
      if (!skill) {
        return { success: false, error: `Skill "${slug}" not found on ClawHub` };
      }

      // 创建 skill 目录
      const skillDir = path.join(this.skillsDir, slug);
      await fs.mkdir(skillDir, { recursive: true });

      // 生成 SKILL.md
      const skillMd = this.generateSkillMd(skill);
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

      // 下载完整 Skill 文件（如果 ClawHub API 提供）
      if (skill.files && skill.files.length > 0) {
        for (const file of skill.files) {
          const targetPath = path.join(skillDir, file.path);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });

          if (file.content) {
            // 直接写入内容（API 已返回）
            await fs.writeFile(targetPath, file.content, 'utf-8');
          } else if (file.url) {
            // 从 URL 下载
            const res = await fetch(file.url);
            if (res.ok) {
              const content = await res.text();
              await fs.writeFile(targetPath, content, 'utf-8');
            }
          }
        }
      }

      this.installedSlugs.add(slug);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * 卸载 Skill
   */
  async uninstall(slug: string): Promise<{ success: boolean; error?: string }> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const skillDir = path.join(this.skillsDir, slug);
      await fs.rm(skillDir, { recursive: true, force: true });
      this.installedSlugs.delete(slug);
      // 清除缓存
      this.cache.delete(`market:skill:${slug}`);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * 生成 SKILL.md 内容
   */
  private generateSkillMd(skill: MarketSkill): string {
    const lines = [
      '---',
      `name: ${skill.displayName}`,
      `description: ${skill.summary}`,
      `version: ${skill.version}`,
      `author: ${skill.author || skill.authorHandle}`,
    ];

    if (skill.tags.length > 0) {
      lines.push(`tags: [${skill.tags.map(t => `"${t}"`).join(', ')}]`);
    }

    lines.push('---');
    lines.push('');
    lines.push(`# ${skill.displayName}`);
    lines.push('');
    lines.push(skill.summary);
    lines.push('');
    lines.push(`**Author:** ${skill.author || skill.authorHandle}`);
    lines.push(`**Version:** ${skill.version}`);
    lines.push(`**Downloads:** ${skill.downloads.toLocaleString()}`);
    lines.push(`**Stars:** ${skill.stars}`);
    lines.push('');

    if (skill.changelog) {
      lines.push('## Changelog');
      lines.push('');
      lines.push(skill.changelog);
      lines.push('');
    }

    lines.push('---');
    lines.push(`*Installed from [ClawHub](https://clawhub.ai/skills/${skill.slug})*`);

    return lines.join('\n');
  }

  /**
   * 映射 API 响应到 MarketSkill
   */
  private mapApiSkill(item: any): MarketSkill {
    const tags: string[] = [];
    if (item.tags && typeof item.tags === 'object') {
      for (const [k, v] of Object.entries(item.tags)) {
        if (k !== 'latest') tags.push(k);
      }
    }

    return {
      slug: item.slug ?? '',
      displayName: item.displayName ?? item.slug ?? '',
      summary: item.summary ?? '',
      version: item.latestVersion?.version ?? item.tags?.latest ?? '1.0.0',
      tags,
      downloads: item.stats?.downloads ?? 0,
      stars: item.stats?.stars ?? 0,
      installsAllTime: item.stats?.installsAllTime ?? 0,
      installsCurrent: item.stats?.installsCurrent ?? 0,
      author: item.owner?.displayName ?? '',
      authorHandle: item.owner?.handle ?? '',
      authorImage: item.owner?.image,
      createdAt: item.createdAt ?? 0,
      updatedAt: item.updatedAt ?? 0,
      changelog: item.latestVersion?.changelog ?? ''
    };
  }
}
