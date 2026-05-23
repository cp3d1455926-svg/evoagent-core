/* eslint-disable no-console */
/**
 * EvoAgent — 交互式 CLI
 * 
 * 终端交互式会话，支持多行输入、历史记录
 */

import type { AgentLoop } from '../core/agent-loop.js';
import type { ToolDefinition } from '../core/types.js';

export interface InteractiveCLIOptions {
  model?: string;
  thinking?: boolean;
  channel?: string;
}

export class InteractiveCLI {
  private options: InteractiveCLIOptions;
  private history: string[] = [];

  constructor(options: InteractiveCLIOptions = {}) {
    this.options = options;
  }

  async start(): Promise<void> {
    console.log('🧬 EvoAgent Interactive CLI v0.1.0');
    console.log('Type your message, or "exit" to quit.\n');

    // 简化版：使用 readline
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '🧬 > '
    });

    rl.prompt();

    rl.on('line', (line) => {
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

      this.history.push(input);
      console.log(`\n📝 You: ${input}`);
      console.log('🤖 EvoAgent: (Agent Loop not connected yet — coming soon)\n');
      rl.prompt();
    });

    rl.on('close', () => {
      process.exit(0);
    });
  }
}
