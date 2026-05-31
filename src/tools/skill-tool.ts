/**
 * EvoAgent — Skill 管理工具 v0.5.0
 *
 * 让 Agent 能在对话中自行安装/卸载/搜索/管理 Skill
 *
 * 新增 v0.5.0:
 * - install-many: 批量安装
 * - validate: 校验已安装 Skill 完整性
 * - 更可操作性的错误提示
 */

import type { Tool, ToolExecuteResult } from './tool-executor.js';
import { SkillLoader } from '../core/skill-loader.js';
import { SkillMarket } from '../core/skill-market.js';
import { join } from 'path';

const SKILLS_DIR = join(process.cwd(), 'skills');

type SkillAction =
  | 'install' | 'install-many' | 'uninstall' | 'list' | 'search'
  | 'info' | 'enable' | 'disable' | 'popular' | 'latest' | 'validate';

interface SkillArgs {
  action: SkillAction;
  slug?: string;
  slugs?: string[];
  query?: string;
}

export class SkillTool implements Tool {
  name = 'skill';
  description = `Manage EvoAgent skills. Actions:
  install      <slug>     — Install a skill from ClawHub marketplace
  install-many <s1,s2..>  — Install multiple skills at once
  uninstall    <slug>     — Uninstall an installed skill
  list                    — List all locally installed skills
  search       <q>        — Search ClawHub marketplace
  info         <slug>     — Show detailed info about a skill
  enable       <name>     — Enable an installed skill
  disable      <name>     — Disable an installed skill
  popular                 — Show popular skills on ClawHub
  latest                  — Show latest skills on ClawHub
  validate                — Validate installed skill integrity`;
  permissionLevel = 'execute' as const;

  private loader: SkillLoader;
  private market: SkillMarket;

  constructor() {
    this.loader = new SkillLoader(SKILLS_DIR);
    this.market = new SkillMarket(SKILLS_DIR);
  }

  parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['install', 'install-many', 'uninstall', 'list', 'search', 'info', 'enable', 'disable', 'popular', 'latest', 'validate'],
        description: 'Skill operation to perform'
      },
      slug: { type: 'string', description: 'Skill slug or name (required for install/uninstall/info/enable/disable)' },
      slugs: { type: 'array', items: { type: 'string' }, description: 'Skill slugs for batch install (install-many action)' },
      query: { type: 'string', description: 'Search query (required for search action)' }
    },
    required: ['action']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action, slug, slugs, query } = args as unknown as SkillArgs;

    try {
      switch (action) {
        case 'list':          return await this.actionList();
        case 'search':        return await this.actionSearch(query);
        case 'install':       return await this.actionInstall(slug);
        case 'install-many':  return await this.actionInstallMany(slugs);
        case 'uninstall':     return await this.actionUninstall(slug);
        case 'info':          return await this.actionInfo(slug);
        case 'enable':        return await this.actionEnable(slug);
        case 'disable':       return await this.actionDisable(slug);
        case 'popular':       return await this.actionPopular();
        case 'latest':        return await this.actionLatest();
        case 'validate':      return await this.actionValidate();
        default:              return { content: `Error: Unknown action "${action}"`, isError: true };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Skill error: ${msg}`, isError: true };
    }
  }

  // ── 列出本地 Skill ──────────────────────────────

  private async actionList(): Promise<ToolExecuteResult> {
    await this.loader.loadAll();
    const skills = this.loader.getAll();

    if (skills.length === 0) {
      return { content: '📦 No skills installed. Use `skill search <query>` or `skill install <slug>` to add some.', isError: false };
    }

    const lines = skills.map(s => {
      const icon = s.enabled ? '✅' : '⏸️';
      return `  ${icon} ${s.name} v${s.version} — ${s.description.slice(0, 60)}`;
    });

    return {
      content: `📦 Installed Skills (${skills.length}, ${this.loader.getEnabledCount()} active)\n\n${lines.join('\n')}`,
      isError: false
    };
  }

  // ── 搜索市场 ────────────────────────────────────

  private async actionSearch(query?: string): Promise<ToolExecuteResult> {
    if (!query) return { content: 'Error: "query" is required for search action', isError: true };

    const results = await this.market.search(query, { limit: 12 });

    if (results.items.length === 0) {
      return { content: `🔍 No results for "${query}" on ClawHub`, isError: false };
    }

    const lines = results.items.map(s => {
      const installed = this.market.isInstalled(s.slug) ? '✅' : '  ';
      const stars = '★'.repeat(Math.min(s.stars, 5));
      return `  ${installed} ${s.displayName} ${stars}\n     ⬇️ ${s.downloads.toLocaleString()} · v${s.version}\n     ${s.summary.slice(0, 80)}`;
    });

    return {
      content: `🔍 ClawHub — "${query}" (${results.total} results)\n\n${lines.join('\n\n')}\n\nInstall: skill install <slug>`,
      isError: false
    };
  }

  // ── 安装 ────────────────────────────────────────

  private async actionInstall(slug?: string): Promise<ToolExecuteResult> {
    if (!slug) return { content: 'Error: "slug" is required for install action', isError: true };

    const result = await this.market.install(slug);
    if (result.success) {
      await this.loader.loadAll();
      return { content: `✅ ${slug} installed successfully!`, isError: false };
    }

    let hint = '';
    if (result.error?.includes('not found')) {
      hint = '\n💡 Try `skill search <keyword>` to find the right slug.';
    } else if (result.error?.includes('fetch') || result.error?.includes('network')) {
      hint = '\n💡 Network issue. Check your internet connection or ClawHub API.';
    }

    return { content: `❌ Install failed: ${result.error}${hint}`, isError: true };
  }

  // ── 批量安装 ────────────────────────────────────

  private async actionInstallMany(slugs?: string[]): Promise<ToolExecuteResult> {
    if (!slugs || slugs.length === 0) {
      return { content: 'Error: "slugs" array is required for install-many action', isError: true };
    }

    const { succeeded, failed } = await this.market.installMany(slugs);
    await this.loader.loadAll();

    const lines: string[] = [];
    if (succeeded.length > 0) {
      lines.push(`✅ Installed (${succeeded.length}): ${succeeded.join(', ')}`);
    }
    for (const f of failed) {
      lines.push(`❌ ${f.slug}: ${f.error}`);
    }

    return { content: lines.join('\n'), isError: failed.length > 0 };
  }

  // ── 卸载 ────────────────────────────────────────

  private async actionUninstall(slug?: string): Promise<ToolExecuteResult> {
    if (!slug) return { content: 'Error: "slug" is required for uninstall action', isError: true };

    const result = await this.market.uninstall(slug);
    if (result.success) {
      await this.loader.loadAll();
      return { content: `🗑️  ${slug} uninstalled.`, isError: false };
    }

    let hint = '';
    if (result.error?.includes('ENOENT') || result.error?.includes('not found')) {
      hint = '\n💡 Skill may not be installed. Use `skill list` to see installed skills.';
    }
    return { content: `❌ Uninstall failed: ${result.error}${hint}`, isError: true };
  }

  // ── 详情 ────────────────────────────────────────

  private async actionInfo(slug?: string): Promise<ToolExecuteResult> {
    if (!slug) return { content: 'Error: "slug" is required for info action', isError: true };

    await this.loader.loadAll();
    const local = this.loader.get(slug) || this.loader.getAll().find(s => s.name.toLowerCase() === slug.toLowerCase());

    if (local) {
      const icon = local.enabled ? '✅' : '⏸️';
      return {
        content: `${icon} ${local.name} v${local.version}
  Slug:   ${local.slug}
  Author: ${local.author || '(unknown)'}
  Status: ${local.enabled ? 'Enabled' : 'Disabled'}
  Tags:   ${local.tags.join(', ') || '(none)'}
  Path:   ${local.path}`,
        isError: false
      };
    }

    const market = await this.market.getSkill(slug);
    if (!market) return { content: `❌ Skill "${slug}" not found locally or on ClawHub`, isError: true };

    const installed = this.market.isInstalled(slug) ? '✅' : '⬇️';
    const stars = '★'.repeat(Math.min(market.stars, 5));

    return {
      content: `${installed} ${market.displayName} ${stars}
  Slug:      ${market.slug}
  Version:   ${market.version}
  Author:    ${market.author} (@${market.authorHandle})
  Downloads: ${market.downloads.toLocaleString()}
  Stars:     ${market.stars}
  Tags:      ${market.tags.join(', ') || '(none)'}
  Updated:   ${new Date(market.updatedAt).toLocaleDateString()}

  ${market.summary}

  Install: skill install ${market.slug}`,
      isError: false
    };
  }

  // ── 启用 ────────────────────────────────────────

  private async actionEnable(name?: string): Promise<ToolExecuteResult> {
    if (!name) return { content: 'Error: "name" is required for enable action', isError: true };

    await this.loader.loadAll();
    const all = this.loader.getAll();
    const skill = all.find(s => s.name.toLowerCase() === name.toLowerCase() || s.slug === name);
    if (!skill) return { content: `❌ Skill "${name}" not found. Use skill list to see installed skills.`, isError: true };

    this.loader.setEnabled(skill.slug, true);
    return { content: `✅ ${skill.name} enabled.`, isError: false };
  }

  // ── 禁用 ────────────────────────────────────────

  private async actionDisable(name?: string): Promise<ToolExecuteResult> {
    if (!name) return { content: 'Error: "name" is required for disable action', isError: true };

    await this.loader.loadAll();
    const all = this.loader.getAll();
    const skill = all.find(s => s.name.toLowerCase() === name.toLowerCase() || s.slug === name);
    if (!skill) return { content: `❌ Skill "${name}" not found.`, isError: true };

    this.loader.setEnabled(skill.slug, false);
    return { content: `⏸️  ${skill.name} disabled.`, isError: false };
  }

  // ── 热门 ────────────────────────────────────────

  private async actionPopular(): Promise<ToolExecuteResult> {
    const skills = await this.market.getPopular(15);

    const lines = skills.map(s => {
      const installed = this.market.isInstalled(s.slug) ? '✅' : '  ';
      const stars = '★'.repeat(Math.min(s.stars, 5));
      return `  ${installed} ${s.displayName} ${stars}
     ⬇️ ${s.downloads.toLocaleString()} · v${s.version}
     ${s.summary.slice(0, 70)}`;
    });

    return {
      content: `🔥 Popular on ClawHub\n\n${lines.join('\n\n')}\n\nInstall: skill install <slug>`,
      isError: false
    };
  }

  // ── 最新 ────────────────────────────────────────

  private async actionLatest(): Promise<ToolExecuteResult> {
    const skills = await this.market.getLatest(15);

    const lines = skills.map(s => {
      const installed = this.market.isInstalled(s.slug) ? '✅' : '  ';
      return `  ${installed} ${s.displayName}
     v${s.version} · ⭐ ${s.stars} · ⬇️ ${s.downloads.toLocaleString()}
     ${s.summary.slice(0, 70)}`;
    });

    return {
      content: `🆕 Latest on ClawHub\n\n${lines.join('\n\n')}\n\nInstall: skill install <slug>`,
      isError: false
    };
  }

  // ── 校验 ────────────────────────────────────────

  private async actionValidate(): Promise<ToolExecuteResult> {
    await this.loader.loadAll();
    const result = this.loader.validate();

    if (result.valid && result.warnings.length === 0) {
      return { content: '✅ All installed skills are valid.', isError: false };
    }

    const lines: string[] = ['📋 Skill Validation Report'];
    if (result.errors.length > 0) {
      lines.push('');
      lines.push('❌ Errors:');
      lines.push(...result.errors.map(e => `  • ${e}`));
    }
    if (result.warnings.length > 0) {
      lines.push('');
      lines.push('⚠️  Warnings:');
      lines.push(...result.warnings.map(w => `  • ${w}`));
    }

    return { content: lines.join('\n'), isError: result.errors.length > 0 };
  }
}
