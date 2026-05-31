/* eslint-disable no-console */
/**
 * EvoAgent — 交互式 CLI v0.5.0
 *
 * 工作区感知 + Skill 注入 + 内置市场 + 桌面快捷指令
 *
 * 内置命令:
 *   /skills              列出本地 Skill
 *   /skills enable <n>   启用 Skill
 *   /skills disable <n>  禁用 Skill
 *   /skills info <n>     显示 Skill 详情
 *   /skills search <q>   搜索本地 Skill
 *   /market search <q>   搜索 ClawHub 市场
 *   /market install <s>  安装 Skill
 *   /market uninstall <s> 卸载 Skill
 *   /market popular      热门 Skill
 *   /market latest       最新 Skill
 *   /market info <s>     市场 Skill 详情
 *   /workspace           查看工作区文件树
 *   /status              Agent 状态
 *   /help                帮助
 *   exit                 退出
 *
 * 快捷指令（直接执行，不走 LLM）:
 *   截屏 / 截图          立即截屏
 *   打开 <app/url>       打开应用或网址
 *   通知 <消息>          发送系统通知
 */

import { createAgent } from './create-agent.js';
import { defaultConfig } from '../config/default-config.js';
import type { ToolDefinition } from '../core/types.js';
import type { ChannelMessage } from '../core/types.js';
import { Workspace } from '../core/workspace.js';
import { DesktopTool } from '../tools/desktop.js';
import { join } from 'path';

const SKILLS_DIR = join(process.cwd(), 'skills');

export interface InteractiveCLIOptions {
  model?: string;
  thinking?: boolean;
  channel?: string;
}

export class InteractiveCLI {
  private options: InteractiveCLIOptions;
  private history: string[] = [];
  private agent: ReturnType<typeof createAgent> | null = null;
  private skillLoader: import('../core/skill-loader.js').SkillLoader | null = null;
  private skillMarket: import('../core/skill-market.js').SkillMarket | null = null;
  private workspace: Workspace = new Workspace();
  private toolDefs: ToolDefinition[] = [];
  private desktopTool: DesktopTool = new DesktopTool();

  constructor(options: InteractiveCLIOptions = {}) {
    this.options = options;
  }

  async start(): Promise<void> {
    console.log('\x1b[1m🧬 EvoAgent v0.5.0 — Interactive CLI\x1b[0m');
    console.log('   "workspace-aware agent with extendable skills"\n');

    // 初始化 Agent
    try {
      this.agent = createAgent({
        model: this.options.model,
        thinking: this.options.thinking
      });
      this.toolDefs = this.agent.getToolDefinitions();
      console.log(`\x1b[36m⚙️\x1b[0m  Model: ${this.options.model || defaultConfig.agent.model}`);
      console.log(`\x1b[36m🔧\x1b[0m Tools: ${this.toolDefs.length} registered`);
    } catch (err) {
      console.error(`\x1b[31m❌\x1b[0m Failed to initialize agent: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    // 加载本地 Skill
    try {
      const { SkillLoader } = await import('../core/skill-loader.js');
      const { SkillMarket } = await import('../core/skill-market.js');
      this.skillLoader = new SkillLoader(SKILLS_DIR);
      this.skillMarket = new SkillMarket(SKILLS_DIR);
      const skills = await this.skillLoader.loadAll();
      const activeSkills = skills.filter(s => s.enabled).length;
      if (skills.length > 0) {
        console.log(`\x1b[36m📦\x1b[0m Skills: ${skills.length} installed (${activeSkills} active)`);
      }
    } catch { }

    // 获取工作区结构
    try {
      const tree = await this.workspace.getTree('.', 2);
      const fileCount = this.countFiles(tree);
      console.log(`\x1b[36m📂\x1b[0m Workspace: ${this.workspace.root} (${fileCount} files)`);
    } catch { }

    // ── 如果指定了 Feishu 渠道，后台启动 ──────────
    if (this.options.channel === 'feishu') {
      await this.startFeishuChannel();
    }

    console.log('');
    this.printHelp();
    console.log('');

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[32m🧬 >\x1b[0m '
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) { rl.prompt(); return; }

      if (input === 'exit' || input === 'quit') {
        console.log('👋 Bye!');
        rl.close();
        return;
      }

      // ── 先试快捷指令（直接执行，不走 LLM） ──────
      if (await this.tryQuickCommand(input)) { rl.prompt(); return; }

      // ── 再试内置命令 ────────────────────────────
      if (await this.handleCommand(input)) { rl.prompt(); return; }

      // ── Agent 对话 ──────────────────────────────
      this.history.push(input);
      console.log('');

      const systemPrompt = await this.buildSystemPrompt();

      console.log('\x1b[33m🧠 Thinking...\x1b[0m');
      try {
        const result = await this.agent!.run(
          input,
          this.toolDefs,
          systemPrompt,
          (chunk) => process.stdout.write(chunk)
        );
        const tokenUsage = this.agent!.getTokenUsage();
        console.log(`\n\n\x1b[32m✅\x1b[0m Done (${this.agent!.getIterationCount()} iters, ${tokenUsage.total.toLocaleString()} tokens)\n`);
      } catch (err) {
        console.error(`\n\x1b[31m❌\x1b[0m Error: ${err instanceof Error ? err.message : String(err)}\n`);
      }

      rl.prompt();
    });

    rl.on('close', () => process.exit(0));
  }

  /**
   * 启动飞书渠道（WebSocket 长连接）
   */
  private async startFeishuChannel(): Promise<void> {
    const appId = process.env.FEISHU_APP_ID || process.env.LARK_APP_ID || '';
    const appSecret = process.env.FEISHU_APP_SECRET || process.env.LARK_APP_SECRET || '';

    if (!appId || !appSecret) {
      console.error('\x1b[31m❌ Feishu channel: FEISHU_APP_ID and FEISHU_APP_SECRET env vars required\x1b[0m');
      return;
    }

    try {
      const { FeishuChannel } = await import('../channels/feishu.js');
      const feishuChannel = new FeishuChannel({ appId, appSecret });

      feishuChannel.start(async (msg: ChannelMessage) => {
        console.log(`\n\x1b[36m📩 Feishu message from ${msg.userId}: ${msg.content}\x1b[0m\n`);

        try {
          const systemPrompt = await this.buildSystemPrompt();
          const result = await this.agent!.run(
            msg.content,
            this.toolDefs,
            systemPrompt,
            (chunk) => process.stdout.write(chunk)
          );

          await feishuChannel.send({
            ...msg,
            content: result
          });

          console.log(`\x1b[36m📨 Reply sent via Feishu\x1b[0m\n`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`\x1b[31m❌ Feishu reply error: ${errMsg}\x1b[0m`);
        }
      });

      console.log(`\x1b[36m🐦 Feishu channel started (WebSocket mode)\x1b[0m`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\x1b[31m❌ Feishu channel failed to start: ${msg}\x1b[0m`);
      console.log('💡 Make sure @larksuiteoapi/node-sdk is installed.');
    }
  }

  // ═══════════════════════════════════════════════════════
  //  快捷指令（直接执行，不经过 LLM）
  // ═══════════════════════════════════════════════════════

  private async tryQuickCommand(input: string): Promise<boolean> {
    // 截屏
    if (/^(截屏|截图|screenshot|take screenshot)$/i.test(input)) {
      console.log('📸 Taking screenshot...');
      const result = await this.desktopTool.execute({ action: 'screenshot' });
      console.log(result.content);
      return true;
    }

    // 系统信息
    if (/^(系统信息|system info|sysinfo)$/i.test(input)) {
      const result = await this.desktopTool.execute({ action: 'system_info' });
      console.log(result.content);
      return true;
    }

    // 打开应用/网址
    const openMatch = input.match(/^(打开|open|launch|start)\s+(.+)/i);
    if (openMatch) {
      const target = openMatch[2].trim();
      console.log(`🚀 Opening: ${target}...`);
      const result = await this.desktopTool.execute({ action: 'open', target });
      console.log(result.content);
      return true;
    }

    // 通知
    const notifyMatch = input.match(/^(通知|notify|notification)\s+(.+)/i);
    if (notifyMatch) {
      const text = notifyMatch[2].trim();
      console.log(`🔔 Sending notification...`);
      const result = await this.desktopTool.execute({ action: 'notify', text });
      console.log(result.content);
      return true;
    }

    // 剪贴板读
    if (/^(剪贴板|clipboard|粘贴)$/i.test(input)) {
      const result = await this.desktopTool.execute({ action: 'clipboard_read' });
      console.log(`📋 Clipboard:\n${result.content}`);
      return true;
    }

    // 复制到剪贴板
    const copyMatch = input.match(/^(复制|copy|clipboard write)\s+(.+)/i);
    if (copyMatch) {
      const text = copyMatch[2].trim();
      const result = await this.desktopTool.execute({ action: 'clipboard_write', text });
      console.log(result.content);
      return true;
    }

    // 窗口列表
    if (/^(窗口|windows|window list)$/i.test(input)) {
      const result = await this.desktopTool.execute({ action: 'window_list' });
      console.log(result.content);
      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════
  //  内置命令
  // ═══════════════════════════════════════════════════════

  private async handleCommand(input: string): Promise<boolean> {
    if (input === '/help' || input === 'help') {
      this.printHelp();
      return true;
    }

    if (input === '/skills' || input === '/skills-list') {
      await this.cmdSkillsList();
      return true;
    }

    if (input.startsWith('/skills enable ')) {
      const name = input.replace(/^\/skills enable\s*/, '').trim();
      await this.cmdSkillEnable(name);
      return true;
    }

    if (input.startsWith('/skills disable ')) {
      const name = input.replace(/^\/skills disable\s*/, '').trim();
      await this.cmdSkillDisable(name);
      return true;
    }

    if (input.startsWith('/skills info ')) {
      const name = input.replace(/^\/skills info\s*/, '').trim();
      await this.cmdSkillInfo(name);
      return true;
    }

    if (input.startsWith('/skills search ')) {
      const q = input.replace(/^\/skills search\s*/, '').trim();
      await this.cmdSkillSearch(q);
      return true;
    }

    if (input.startsWith('/market search ')) {
      const q = input.replace(/^\/market search\s*/, '').trim();
      await this.cmdMarketSearch(q);
      return true;
    }

    if (input.startsWith('/market install ')) {
      const slug = input.replace(/^\/market install\s*/, '').trim();
      await this.cmdMarketInstall(slug);
      return true;
    }

    if (input.startsWith('/market uninstall ')) {
      const slug = input.replace(/^\/market uninstall\s*/, '').trim();
      await this.cmdMarketUninstall(slug);
      return true;
    }

    if (input === '/market popular' || input === '/market') {
      await this.cmdMarketPopular();
      return true;
    }

    if (input === '/market latest') {
      await this.cmdMarketLatest();
      return true;
    }

    if (input.startsWith('/market info ')) {
      const slug = input.replace(/^\/market info\s*/, '').trim();
      await this.cmdMarketInfo(slug);
      return true;
    }

    if (input === '/workspace') {
      await this.cmdWorkspace();
      return true;
    }

    if (input === '/status' || input === 'status') {
      await this.cmdStatus();
      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════
  //  命令实现
  // ═══════════════════════════════════════════════════════

  private async cmdSkillsList() {
    if (!this.skillLoader) { console.log('No skill loader.'); return; }
    const all = this.skillLoader.getAll();
    console.log(`📦 Local Skills (${all.length})\n`);
    for (const s of all) {
      const icon = s.enabled ? '✅' : '⏸️';
      console.log(`  ${icon} <b>${s.name}</b> v${s.version}`);
      console.log(`     ${s.description}`);
      if (s.tags.length) console.log(`     🏷️ ${s.tags.join(', ')}`);
      console.log('');
    }
  }

  private async cmdSkillEnable(name: string) {
    if (!this.skillLoader) { console.log('No skill loader.'); return; }
    if (!name) { console.log('Usage: /skills enable <name>'); return; }
    const all = this.skillLoader.getAll();
    const skill = all.find(s => s.name.toLowerCase() === name.toLowerCase() || s.slug === name);
    if (!skill) { console.log(`❌ Skill "${name}" not found.`); return; }
    this.skillLoader.setEnabled(skill.slug, true);
    console.log(`✅ ${skill.name} enabled`);
  }

  private async cmdSkillDisable(name: string) {
    if (!this.skillLoader) { console.log('No skill loader.'); return; }
    if (!name) { console.log('Usage: /skills disable <name>'); return; }
    const all = this.skillLoader.getAll();
    const skill = all.find(s => s.name.toLowerCase() === name.toLowerCase() || s.slug === name);
    if (!skill) { console.log(`❌ Skill "${name}" not found.`); return; }
    this.skillLoader.setEnabled(skill.slug, false);
    console.log(`⏸️  ${skill.name} disabled`);
  }

  private async cmdSkillInfo(name: string) {
    if (!this.skillLoader) { console.log('No skill loader.'); return; }
    if (!name) { console.log('Usage: /skills info <name>'); return; }
    const all = this.skillLoader.getAll();
    const skill = all.find(s => s.name.toLowerCase() === name.toLowerCase() || s.slug === name);
    if (!skill) { console.log(`❌ Skill "${name}" not found.`); return; }
    const icon = skill.enabled ? '✅' : '⏸️';
    console.log(`\n${icon} ${skill.name} v${skill.version}\n`);
    console.log(`  Slug:     ${skill.slug}`);
    console.log(`  Author:   ${skill.author || '(unknown)'}`);
    console.log(`  Status:   ${skill.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  Installed: ${new Date(skill.installedAt).toLocaleString()}`);
    console.log(`  Tags:     ${skill.tags.join(', ') || '(none)'}`);
    console.log(`  Path:     ${skill.path}`);
    console.log('');
  }

  private async cmdSkillSearch(query: string) {
    if (!this.skillLoader) { console.log('No skill loader.'); return; }
    if (!query) { console.log('Usage: /skills search <query>'); return; }
    const results = this.skillLoader.search(query);
    console.log(`🔍 "${query}" → ${results.length} local result(s)\n`);
    for (const r of results) {
      const icon = r.skill.enabled ? '✅' : '⏸️';
      console.log(`  ${icon} ${r.skill.name} [${r.matchedFields.join(', ')}] (${r.score})`);
      console.log(`     ${r.skill.description}\n`);
    }
  }

  private async cmdMarketSearch(query: string) {
    if (!this.skillMarket) { console.log('Market not available.'); return; }
    if (!query) { console.log('Usage: /market search <query>'); return; }
    try {
      console.log(`🔍 Searching ClawHub for "${query}"...`);
      const results = await this.skillMarket.search(query, { limit: 15 });
      console.log(`\n📦 ClawHub — ${results.total} result(s)\n`);
      for (const s of results.items) {
        const installed = this.skillMarket.isInstalled(s.slug) ? '✅' : '  ';
        const stars = '★'.repeat(Math.min(s.stars, 5));
        console.log(`  ${installed} ${s.displayName} ${stars}`);
        console.log(`     ⬇️ ${s.downloads.toLocaleString()} · v${s.version}`);
        console.log(`     ${s.summary}`);
        console.log(`     /market info ${s.slug}\n`);
      }
    } catch (err: any) {
      console.error(`❌ ${err.message || err}`);
    }
  }

  private async cmdMarketInstall(slug: string) {
    if (!this.skillMarket || !this.skillLoader) { console.log('Market not available.'); return; }
    if (!slug) { console.log('Usage: /market install <slug>'); return; }
    console.log(`⬇️  Installing ${slug}...`);
    const result = await this.skillMarket.install(slug);
    if (result.success) {
      console.log(`✅ ${slug} installed! Refreshing skills...`);
      await this.skillLoader.loadAll();
    } else {
      console.error(`❌ ${result.error}`);
    }
  }

  private async cmdMarketUninstall(slug: string) {
    if (!this.skillMarket || !this.skillLoader) { console.log('Market not available.'); return; }
    if (!slug) { console.log('Usage: /market uninstall <slug>'); return; }
    console.log(`🗑️  Uninstalling ${slug}...`);
    const result = await this.skillMarket.uninstall(slug);
    if (result.success) {
      console.log(`✅ ${slug} uninstalled. Refreshing skills...`);
      await this.skillLoader.loadAll();
    } else {
      console.error(`❌ ${result.error}`);
    }
  }

  private async cmdMarketPopular() {
    if (!this.skillMarket) { console.log('Market not available.'); return; }
    try {
      const skills = await this.skillMarket.getPopular(15);
      console.log('🔥 Popular on ClawHub\n');
      for (const s of skills) {
        const installed = this.skillMarket.isInstalled(s.slug) ? '✅' : '  ';
        const stars = '★'.repeat(Math.min(s.stars, 5));
        console.log(`  ${installed} ${s.displayName} ${stars}`);
        console.log(`     ⬇️ ${s.downloads.toLocaleString()} · ⭐ ${s.stars}`);
        console.log(`     ${s.summary}`);
        console.log(`     /market install ${s.slug}\n`);
      }
    } catch (err: any) {
      console.error(`❌ ${err.message || err}`);
    }
  }

  private async cmdMarketLatest() {
    if (!this.skillMarket) { console.log('Market not available.'); return; }
    try {
      const skills = await this.skillMarket.getLatest(15);
      console.log('🆕 Latest on ClawHub\n');
      for (const s of skills) {
        const installed = this.skillMarket.isInstalled(s.slug) ? '✅' : '  ';
        console.log(`  ${installed} ${s.displayName}`);
        console.log(`     v${s.version} · ⭐ ${s.stars} · ⬇️ ${s.downloads.toLocaleString()}`);
        console.log(`     ${s.summary}`);
        console.log(`     /market install ${s.slug}\n`);
      }
    } catch (err: any) {
      console.error(`❌ ${err.message || err}`);
    }
  }

  private async cmdMarketInfo(slug: string) {
    if (!this.skillMarket) { console.log('Market not available.'); return; }
    if (!slug) { console.log('Usage: /market info <slug>'); return; }
    try {
      const s = await this.skillMarket.getSkill(slug);
      if (!s) { console.log(`❌ Skill "${slug}" not found`); return; }
      const installed = this.skillMarket.isInstalled(slug) ? '✅' : '⬇️';
      const stars = '★'.repeat(Math.min(s.stars, 5));
      console.log(`\n${installed} ${s.displayName} ${stars}\n`);
      console.log(`  Slug:      ${s.slug}`);
      console.log(`  Version:   ${s.version}`);
      console.log(`  Author:    ${s.author} (@${s.authorHandle})`);
      console.log(`  Downloads: ${s.downloads.toLocaleString()}`);
      console.log(`  Stars:     ${s.stars}`);
      console.log(`  Tags:      ${s.tags.join(', ') || '(none)'}`);
      console.log(`  Updated:   ${new Date(s.updatedAt).toLocaleDateString()}`);
      console.log(`\n  ${s.summary}\n`);
      if (!installed.includes('✅')) {
        console.log(`  /market install ${s.slug}\n`);
      }
    } catch (err: any) {
      console.error(`❌ ${err.message || err}`);
    }
  }

  private async cmdWorkspace() {
    try {
      const tree = await this.workspace.getTree('.', 3);
      const formatted = this.formatTree(tree, '');
      console.log(`📂 ${this.workspace.root}\n`);
      console.log(formatted || '(empty workspace)');
      console.log('');
    } catch (err: any) {
      console.error(`❌ ${err.message || err}`);
    }
  }

  private async cmdStatus() {
    const t = this.agent?.getTokenUsage();
    const iters = this.agent?.getIterationCount() ?? 0;
    const skills = this.skillLoader?.getAll() ?? [];
    const activeSkills = skills.filter(s => s.enabled).length;
    const toolNames = this.toolDefs.map(t => t.name);

    console.log('');
    console.log(`🧬 EvoAgent Status`);
    console.log(`  Model:     ${this.options.model || defaultConfig.agent.model}`);
    console.log(`  Tools:     ${this.toolDefs.length} (${toolNames.join(', ')})`);
    console.log(`  Skills:    ${skills.length} installed, ${activeSkills} active`);
    console.log(`  Iterations: ${iters} this session`);
    console.log(`  Tokens:    ${t ? `${t.total.toLocaleString()} (${t.input.toLocaleString()} in / ${t.output.toLocaleString()} out)` : '—'}`);
    console.log(`  Workspace: ${this.workspace.root}`);
    console.log('');
  }

  // ═══════════════════════════════════════════════════════
  //  System Prompt
  // ═══════════════════════════════════════════════════════

  private async buildSystemPrompt(): Promise<string> {
    const parts: string[] = [];

    parts.push(`You are EvoAgent, a workspace-aware AI assistant.

IMPORTANT: You have tools available. Use them when appropriate — do NOT just describe what you would do. Actually call the tool.`);

    try {
      const tree = await this.workspace.getTree('.', 2);
      const formatted = this.formatTree(tree, '');
      if (formatted) {
        parts.push(`\n## Current Workspace\n\`\`\`\n${this.workspace.root}\n${formatted}\n\`\`\``);
      }
    } catch { }

    if (this.skillLoader) {
      const enabled = this.skillLoader.getAll().filter(s => s.enabled);
      if (enabled.length > 0) {
        const skillBlocks = enabled.map(s => {
          const body = s.markdown.replace(/^---[\s\S]*?\n---\n*/, '').trim();
          return `### Skill: ${s.name}\n\n${body}`;
        });
        parts.push(`\n## Active Skills\n\n${skillBlocks.join('\n\n---\n\n')}`);
      }
    }

    parts.push(`\n## Guidelines\n
- When asked about files, use the workspace tool
- When asked to write code, explore the workspace structure first
- If a task matches an active skill, follow that skill's instructions
- Be concise and accurate`);

    return parts.join('\n');
  }

  // ═══════════════════════════════════════════════════════
  //  辅助方法
  // ═══════════════════════════════════════════════════════

  private printHelp() {
    console.log('Commands:');
    console.log('  <message>             Chat with EvoAgent');
    console.log('  截屏/截图              Instant screenshot');
    console.log('  打开 <app/url>         Open app or URL');
    console.log('  通知 <text>            Send notification');
    console.log('  复制 <text>            Copy to clipboard');
    console.log('  剪贴板                 Read clipboard');
    console.log('  窗口                   List open windows');
    console.log('  /skills               List installed skills');
    console.log('  /skills enable <n>    Enable a skill');
    console.log('  /skills disable <n>   Disable a skill');
    console.log('  /market               Browse ClawHub');
    console.log('  /market search <q>    Search market');
    console.log('  /market install <s>   Install skill');
    console.log('  /workspace            Show file tree');
    console.log('  /status               Show status');
    console.log('  exit                  Exit');
  }

  private formatTree(entries: import('../core/workspace.js').FileEntry[], prefix: string): string {
    const lines: string[] = [];
    for (const entry of entries) {
      const icon = entry.isDir ? '📁' : '📄';
      const size = entry.size != null && !entry.isDir ? ` (${this.formatSize(entry.size)})` : '';
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

  private countFiles(entries: import('../core/workspace.js').FileEntry[]): number {
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDir) count++;
      if (entry.children) count += this.countFiles(entry.children);
    }
    return count;
  }
}
