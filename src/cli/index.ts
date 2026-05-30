#!/usr/bin/env node
/**
 * EvoAgent CLI 入口
 * 
 * 用法:
 *   evoagent                   启动交互式会话
 *   evoagent -p "任务描述"      单次任务模式
 *   evoagent gateway           启动网关 + Web 仪表台
 *   evoagent status            查看状态
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { InteractiveCLI } from './interactive.js';
import { runTask } from './single-task.js';
import { startGateway } from '../gateway/server.js';
import { showStatus } from './status.js';
import { runSetup } from './setup.js';
import { createAgent } from './create-agent.js';

/** 配置文件路径 */
const CONFIG_DIR = join(process.env.USERPROFILE || process.env.HOME || '.', '.evoagent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');

/** 检测是否为首次运行（无配置文件） */
function isFirstRun(): boolean {
  return !existsSync(CONFIG_FILE);
}

const program = new Command();

program
  .name('evoagent')
  .description('EvoAgent — 融合 OpenClaw + Hermes + Claude Code 的 AI Agent')
  .version('0.4.0');

program
  .option('-p, --prompt <task>', '单次任务模式')
  .option('-c, --channel <channel>', '指定渠道 (cli/feishu/mcp/web)', 'cli')
  .option('--thinking', '启用思考模式')
  .option('--model <model>', '指定模型', 'LongCat-2.0-Preview');

program
  .command('gateway')
  .description('启动网关 + Web 仪表台')
  .option('--port <port>', '端口号', '3000')
  .action(async (options) => {
    const agent = createAgent({
      model: program.opts().model,
      thinking: program.opts().thinking
    });
    await startGateway({
      agentLoop: agent,
      systemPrompt: 'You are EvoAgent, a helpful AI assistant. Be concise and accurate.',
      tools: []
    }, parseInt(options.port));
  });

program
  .command('setup')
  .description('Interactive setup wizard')
  .action(async () => { await runSetup(); process.exit(0); });

program
  .command('status')
  .description('查看 EvoAgent 状态')
  .action(showStatus);

program
  .command('plugins')
  .description('管理插件')
  .action(() => {
    console.log('🔌 Plugin management - coming soon');
  });

// 解析参数
const opts = program.opts();
const hasSubcommand = process.argv.slice(2).some(a => ['gateway', 'setup', 'status', 'plugins'].includes(a));

if (!hasSubcommand) {
  // 首次运行检测：无配置文件时自动进入配置向导
  if (isFirstRun()) {
    console.log('');
    console.log('🧬 欢迎使用 EvoAgent！');
    console.log('');
    console.log('  检测到这是你第一次运行，需要先进行初始配置。');
    console.log('  你也可以随时运行 evoagent setup 重新配置。');
    console.log('');
    await runSetup();
    console.log('');
    console.log('✅ 配置完成！现在可以开始使用 EvoAgent 了。');
    console.log('  输入消息开始对话，或输入 exit 退出。');
    console.log('');
  }

  if (opts.prompt) {
    await runTask(opts.prompt, opts);
  } else {
    const cli = new InteractiveCLI(opts);
    await cli.start();
  }
} else {
  program.parseAsync(process.argv).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
