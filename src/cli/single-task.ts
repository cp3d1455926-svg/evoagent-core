/* eslint-disable no-console */
/**
 * EvoAgent — 单次任务模式
 * 
 * 执行单个任务并退出
 */

export interface TaskOptions {
  model?: string;
  thinking?: boolean;
  channel?: string;
}

export async function runTask(prompt: string, options: TaskOptions = {}): Promise<void> {
  console.log(`🧬 EvoAgent — Single Task Mode`);
  console.log(`📝 Task: ${prompt}`);
  console.log(`⚙️  Model: ${options.model || 'default'}`);
  console.log(`💭 Thinking: ${options.thinking ? 'on' : 'off'}\n`);

  // TODO: 接入 Agent Loop
  console.log('🤖 EvoAgent: (Agent Loop not connected yet — coming soon)');
  console.log('\n✅ Task queued. Full Agent Loop integration coming in next phase.');
}
