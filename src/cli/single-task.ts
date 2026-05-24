/* eslint-disable no-console */
/**
 * EvoAgent — 单次任务模式
 * 
 * 执行单个任务并退出
 */

import { createAgent } from './create-agent.js';
import { defaultConfig } from '../config/default-config.js';
import type { ToolDefinition } from '../core/types.js';

export interface TaskOptions {
  model?: string;
  thinking?: boolean;
  channel?: string;
}

export async function runTask(prompt: string, options: TaskOptions = {}): Promise<void> {
  console.log(`🧬 EvoAgent — Single Task Mode`);
  console.log(`📝 Task: ${prompt}`);
  console.log(`⚙️  Model: ${options.model || defaultConfig.agent.model}`);
  console.log(`💭 Thinking: ${options.thinking ? 'on' : 'off'}\n`);

  const agent = createAgent({
    model: options.model,
    thinking: options.thinking
  });

  const systemPrompt = `You are EvoAgent, a helpful AI assistant. Be concise and accurate.`;
  const tools: ToolDefinition[] = [];

  try {
    const result = await agent.run(
      prompt,
      tools,
      systemPrompt,
      (chunk) => process.stdout.write(chunk)
    );
    console.log(`\n\n✅ Completed in ${agent.getIterationCount()} iterations`);
  } catch (err) {
    console.error(`\n❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
