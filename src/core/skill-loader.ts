/**
 * EvoAgent — Skill 运行时
 *
 * 从 skills/ 目录加载 SKILL.md，注册、搜索、调用 Skill
 */

export interface SkillDefinition {
  name: string;
  slug: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  path: string;           // skill 目录路径
  markdown: string;       // SKILL.md 全文
  installedAt: number;
  enabled: boolean;
}

export interface SkillSearchResult {
  skill: SkillDefinition;
  score: number;
  matchedFields: string[];
}

export class SkillLoader {
  private skills: Map<string, SkillDefinition> = new Map();
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  /**
   * 扫描 skills 目录，加载所有 Skill
   */
  async loadAll(): Promise<SkillDefinition[]> {
    const fs = await import('fs/promises');
    const path = await import('path');

    this.skills.clear();

    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(this.skillsDir, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');

        try {
          const content = await fs.readFile(skillMdPath, 'utf-8');
          const skill = this.parseSkillMd(content, skillDir, entry.name);
          if (skill) {
            this.skills.set(skill.slug, skill);
          }
        } catch {
          // 没有 SKILL.md 的目录跳过
        }
      }
    } catch {
      // skills 目录不存在
    }

    return Array.from(this.skills.values());
  }

  /**
   * 解析 SKILL.md 文件
   */
  private parseSkillMd(content: string, dirPath: string, dirName: string): SkillDefinition | null {
    // 解析 frontmatter
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    let name = dirName;
    let description = '';
    let version = '1.0.0';
    let author = '';
    let tags: string[] = [];

    if (fmMatch) {
      const fm = fmMatch[1];
      const nameMatch = fm.match(/^name:\s*(.+)/m);
      if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
      const descMatch = fm.match(/^description:\s*(.+)/m);
      if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '');
      const verMatch = fm.match(/^version:\s*(.+)/m);
      if (verMatch) version = verMatch[1].trim();
      const authorMatch = fm.match(/^author:\s*(.+)/m);
      if (authorMatch) author = authorMatch[1].trim();
      const tagsMatch = fm.match(/^tags:\s*\[(.+?)\]/m);
      if (tagsMatch) {
        tags = tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
      }
    }

    // 如果没有 frontmatter，从内容提取描述
    if (!description) {
      const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      if (lines.length > 0) {
        description = lines[0].slice(0, 120);
      }
    }

    const slug = dirName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    return {
      name,
      slug,
      description,
      version,
      author,
      tags,
      path: dirPath,
      markdown: content,
      installedAt: Date.now(),
      enabled: true
    };
  }

  /**
   * 获取所有已加载的 Skill
   */
  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * 按 slug 获取 Skill
   */
  get(slug: string): SkillDefinition | undefined {
    return this.skills.get(slug);
  }

  /**
   * 搜索 Skill（名称、描述、标签）
   */
  search(query: string, limit: number = 10): SkillSearchResult[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getAll().map(s => ({ skill: s, score: 1, matchedFields: [] }));

    const results: SkillSearchResult[] = [];

    for (const skill of this.skills.values()) {
      let score = 0;
      const matchedFields: string[] = [];

      // 名称匹配（权重最高）
      if (skill.name.toLowerCase().includes(q)) {
        score += 10;
        matchedFields.push('name');
      }
      // slug 匹配
      if (skill.slug.includes(q)) {
        score += 8;
        matchedFields.push('slug');
      }
      // 描述匹配
      if (skill.description.toLowerCase().includes(q)) {
        score += 5;
        matchedFields.push('description');
      }
      // 标签匹配
      for (const tag of skill.tags) {
        if (tag.toLowerCase().includes(q)) {
          score += 6;
          matchedFields.push('tags');
          break;
        }
      }
      // 内容匹配
      if (skill.markdown.toLowerCase().includes(q)) {
        score += 2;
        matchedFields.push('content');
      }

      if (score > 0) {
        results.push({ skill, score, matchedFields });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 按标签过滤
   */
  filterByTag(tag: string): SkillDefinition[] {
    return this.getAll().filter(s =>
      s.tags.some(t => t.toLowerCase() === tag.toLowerCase())
    );
  }

  /**
   * 启用/禁用 Skill
   */
  setEnabled(slug: string, enabled: boolean): boolean {
    const skill = this.skills.get(slug);
    if (skill) {
      skill.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * 获取启用的 Skill 数量
   */
  getEnabledCount(): number {
    return this.getAll().filter(s => s.enabled).length;
  }

  /**
   * 获取 Skill 的 SKILL.md 内容（用于注入到 system prompt）
   */
  getSkillPrompt(slug: string): string | null {
    const skill = this.skills.get(slug);
    if (!skill || !skill.enabled) return null;
    return `# Skill: ${skill.name}\n\n${skill.markdown}`;
  }

  /**
   * 获取所有启用 Skill 的 prompt 汇总
   */
  getAllSkillPrompts(): string {
    const enabled = this.getAll().filter(s => s.enabled);
    if (enabled.length === 0) return '';
    return enabled.map(s => `# Skill: ${s.name}\n\n${s.markdown}`).join('\n\n---\n\n');
  }
}
