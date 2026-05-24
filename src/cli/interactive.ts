/* eslint-disable no-console */
/**
 * EvoAgent — 交互式 CLI
 * 
 * 终端交互式会话，支持多行输入、历史记录
 */

import { createAgent } from './create-agent.js';
import { defaultConfig } from '../config/default-config.js';
import type { ToolDefinition } from '../core/types.js';

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
