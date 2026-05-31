/* eslint-disable no-console */
/**
 * EvoAgent — 交互式 CLI
 * 
 * 终端交互式会话，支持多行输入、历史记录
 */

import { createAgent } from './create-agent.js';
import { defaultConfig } from '../config/default-config.js';
import type { ToolDefinition } from '../core/types.js';
import { registerSkillCommands } from './skill-market.js';
import { join } from 'path';

export interface InteractiveCLIOptions {
  model?: string;
  thinking?: boolean;
  channel?: string;
}

export class InteractiveCLI {
  private options: InteractiveCLIOptions;
  private history: string[] = [];
  private agent: ReturnType<typeof createAgent> | null = null;

  constructor(options: InteractiveCLIOptions = {}) {
    this.options = options;
  }

  async start(): Promise<void> {
    console.log('🧬 EvoAgent Interactive CLI v0.1.0');
    console.log('Type your message, or "exit" to quit.\n');
    console.log('💡 Built-in: /skills /skills-search /skills-install /skills-list /skills-browse');
    console.log('');

    // 初始化 Agent
    try {
      this.agent = createAgent({
        model: this.options.model,
        thinking: this.options.thinking
      });
      console.log(`⚙️  Model: ${this.options.model || defaultConfig.agent.model}\n`);
    } catch (err) {
      console.error(`❌ Failed to initialize agent: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    // 预加载本地 Skill
    try {
      const { SkillLoader } = await import('../core/skill-loader.js');
      const { SkillMarket } = await import('../core/skill-market.js');
      const loader = new SkillLoader(join(process.cwd(), 'skills'));
      const skills = await loader.loadAll();
      const market = new SkillMarket(join(process.cwd(), 'skills'));
      (this as any)._skillLoader = loader;
      (this as any)._skillMarket = market;
      if (skills.length > 0) console.log(`📦 Loaded ${skills.length} local skill(s)\n`);
    } catch { }

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '🧬 > '
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      if (input === 'exit' || input === 'quit') {
        console.log('👋 Goodbye!');
        rl.close();
        return;
      }

      // ─── Skill 命令 ─────────────────────────────────
      if (input === '/skills' || input === '/skills-list') {
        const loader = (this as any)._skillLoader as any;
        if (!loader) { console.log('No skill loader available.'); rl.prompt(); return; }
        const all = loader.getAll();
        console.log(`📦 Local Skills (${all.length})\n`);
        for (const s of all) {
          const icon = s.enabled ? '✅' : '⏸️';
          console.log(`  ${icon} ${s.name} v${s.version}`);
          console.log(`     ${s.description}`);
          if (s.tags.length) console.log(`     🏷️ ${s.tags.join(', ')}`);
          console.log('');
        }
        rl.prompt();
        return;
      }

      if (input === '/skills-search' || input.startsWith('/skills-search ')) {
        const q = input.replace(/^\/skills-search\s*/, '');
        if (!q) { console.log('Usage: /skills-search <query>'); rl.prompt(); return; }
        const loader = (this as any)._skillLoader as any;
        const results = loader.search(q);
        console.log(`🔍 "${q}" → ${results.length} result(s)\n`);
        for (const r of results) {
          console.log(`  ${r.score > 0 ? '✅' : '  '} [${r.matchedFields.join(',')}] ${r.skill.name} (${r.score})`);
          console.log(`     ${r.skill.description}\n`);
        }
        rl.prompt();
        return;
      }

      if (input === '/skills-browse') {
        try {
          const market = (this as any)._skillMarket as any;
          const popular = await market.getPopular(10);
          console.log('🔥 Popular on ClawHub\n');
          for (const s of popular) {
            const icon = market.isInstalled(s.slug) ? '✅' : '  ';
            console.log(`  ${icon} ${s.displayName}`);
            console.log(`     ⬇️ ${s.downloads?.toLocaleString() ?? 0} downloads · ⭐ ${s.stars}`);
            console.log(`     ${s.summary}\n`);
          }
        } catch (err) { console.error('Browse failed:', err); }
        rl.prompt();
        return;
      }

      if (input.startsWith('/skills-install ')) {
        const slug = input.replace(/^\/skills-install\s*/, '').trim();
        if (!slug) { console.log('Usage: /skills-install <slug>'); rl.prompt(); return; }
        try {
          const market = (this as any)._skillMarket as any;
          const loader = (this as any)._skillLoader as any;
          console.log(`⬇️  Installing ${slug}...`);
          const result = await market.install(slug);
          if (result.success) {
            console.log(`✅ ${slug} installed!`);
            await loader.loadAll();
          } else {
            console.error(`❌ ${result.error}`);
          }
        } catch (err) { console.error('Install failed:', err); }
        rl.prompt();
        return;
      }

      if (input === '/skills-market') {
        try {
          const market = (this as any)._skillMarket as any;
          const skills = await market.search('', { limit: 30 });
          console.log(`📦 ClawHub Market — ${skills.total} skills\n`);
          for (const s of skills.items) {
            const icon = market.isInstalled(s.slug) ? '✅' : '  ';
            console.log(`  ${icon} ${s.displayName}`);
            console.log(`     ⬇️ ${s.downloads?.toLocaleString() ?? 0} downloads · ⭐ ${s.stars}`);
            console.log(`     ${s.summary}\n`);
          }
        } catch (err) { console.error('Market browse failed:', err); }
        rl.prompt();
        return;
      }

      // ─── 内置命令 ───────────────────────────────────
      if (input === 'history') {
        console.log('📜 History:');
        this.history.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
        rl.prompt();
        return;
      }

      if (input === 'status') {
        console.log(`⚙️  Iterations: ${this.agent?.getIterationCount() ?? 0}`);
        rl.prompt();
        return;
      }

      this.history.push(input);
      console.log('');

      try {
        const systemPrompt = `You are EvoAgent, a helpful AI assistant. Be concise and accurate.`;
        const tools: ToolDefinition[] = [];
        const result = await this.agent!.run(
          input,
          tools,
          systemPrompt,
          (chunk) => process.stdout.write(chunk)
        );
        console.log(`\n\n✅ Done (${this.agent!.getIterationCount()} iterations)\n`);
      } catch (err) {
        console.error(`\n❌ Error: ${err instanceof Error ? err.message : String(err)}\n`);
      }

      rl.prompt();
    });

    rl.on('close', () => {
      process.exit(0);
    });
  }
}
