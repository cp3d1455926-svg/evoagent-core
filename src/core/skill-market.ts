/**
 * EvoAgent — Skill 市场
 *
 * 浏览、搜索、安装 ClawHub 社区 Skill
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

const CLAWHUB_API = 'https://clawhub.ai/api/v1';

export class SkillMarket {
  private skillsDir: string;
  private installedSlugs: Set<string> = new Set();

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
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

    const url = `${CLAWHUB_API}/skills?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ClawHub API error: ${res.status}`);

    const data = await res.json();
    const items: MarketSkill[] = (data.items || []).map(this.mapApiSkill);

    return {
      items,
      total: data.total ?? items.length,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit
    };
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
    const res = await fetch(`${CLAWHUB_API}/skills/${slug}`);
    if (!res.ok) return null;
    const data = await res.json();
    return this.mapApiSkill(data.skill ?? data);
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
