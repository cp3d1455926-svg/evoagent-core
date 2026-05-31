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
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { InteractiveCLI } from './interactive.js';
import { runTask } from './single-task.js';
import { startGateway } from '../gateway/server.js';
import { showStatus } from './status.js';
import { runSetup } from './setup.js';
import { createAgent } from './create-agent.js';
import { registerSkillCommands } from './skill-market.js';
import type { ToolDefinition } from '../core/types.js';
import type { ChannelMessage } from '../core/types.js';

/**
 * 从配置文件读取渠道配置
 */
function getConfigFromFile(yamlKey: string): Record<string, string> | null {
  const configDir = join(process.env.USERPROFILE || process.env.HOME || '.', '.evoagent');
  const configFile = join(configDir, 'config.yaml');
  
  if (!existsSync(configFile)) return null;
  
  try {
    const content = readFileSync(configFile, 'utf-8');
    const sectionMatch = content.match(new RegExp(`${yamlKey}:\\s*\\n((?:\\s+.*\\n)*)`));
    if (!sectionMatch) return null;
    
    const block = sectionMatch[1];
    const enabledMatch = block.match(/^\s+enabled\s*:\s*(.+)/m);
    if (enabledMatch && enabledMatch[1].trim() === 'false') return null;
    
    const result: Record<string, string> = {};
    for (const line of block.split('\n')) {
      const match = line.match(/^\s+(\w+)\s*:\s*(.+)/);
      if (match) {
        result[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    }
    
    return result;
  } catch {
    return null;
  }
}

/**
 * 从配置文件读取飞书凭证
 */
function getFeishuConfigFromFile(): { appId: string; appSecret: string; domain: string } | null {
  const config = getConfigFromFile('feishu');
  if (!config) return null;
  return {
    appId: config.appId || config.app_id || '',
    appSecret: config.appSecret || config.app_secret || '',
    domain: config.domain || 'feishu',
  };
}

/**
 * 从配置文件读取 QQ 凭证
 */
function getQQConfigFromFile(): { appId: string; appSecret: string; token: string; sandbox: boolean } | null {
  const config = getConfigFromFile('qq');
  if (!config) return null;
  return {
    appId: config.appId || config.app_id || '',
    appSecret: config.appSecret || config.app_secret || '',
    token: config.token || '',
    sandbox: config.sandbox === 'true',
  };
}

/**
 * 启动飞书渠道（WebSocket 长连接）
 */
async function startFeishuChannel(agent: import('../core/agent-loop.js').AgentLoop, tools: ToolDefinition[]): Promise<void> {
  // 优先环境变量，其次配置文件
  let appId = process.env.FEISHU_APP_ID || process.env.LARK_APP_ID || '';
  let appSecret = process.env.FEISHU_APP_SECRET || process.env.LARK_APP_SECRET || '';
  let domain = 'feishu';
  
  if (!appId || !appSecret) {
    const fileConfig = getFeishuConfigFromFile();
    if (fileConfig) {
      appId = fileConfig.appId;
      appSecret = fileConfig.appSecret;
      domain = fileConfig.domain;
    }
  }

  if (!appId || !appSecret) {
    console.log('\x1b[33m⚠️  Feishu channel skipped: set FEISHU_APP_ID and FEISHU_APP_SECRET to enable\x1b[0m');
    return;
  }

  try {
    const { FeishuChannel } = await import('../channels/feishu.js');
    const channel = new FeishuChannel({ appId, appSecret, domain: domain as 'feishu' | 'lark' });

    await channel.start(async (msg: ChannelMessage) => {
      console.log(`\n\x1b[36m📩 Feishu [${msg.userId}]: ${msg.content}\x1b[0m`);

      try {
        const result = await agent.run(
          msg.content,
          tools,
          'You are EvoAgent, a helpful AI assistant. Be concise and accurate.',
          (chunk) => process.stdout.write(chunk)
        );

        await channel.send({ ...msg, content: result });
        console.log(`\x1b[36m📨 Feishu reply sent\x1b[0m`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`\x1b[31m❌ Feishu error: ${errMsg}\x1b[0m`);
      }
    });

    console.log('\x1b[36m🐦 Feishu channel connected (WebSocket)\x1b[0m');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31m❌ Feishu channel failed: ${msg}\x1b[0m`);
    console.log('💡 Install @larksuiteoapi/node-sdk: npm install @larksuiteoapi/node-sdk');
  }
}

/**
 * 启动 QQ 渠道（WebSocket 长连接）
 */
async function startQQChannel(agent: import('../core/agent-loop.js').AgentLoop, tools: ToolDefinition[]): Promise<void> {
  // 优先环境变量，其次配置文件
  let appId = process.env.QQ_APP_ID || '';
  let appSecret = process.env.QQ_APP_SECRET || '';
  let token = process.env.QQ_BOT_TOKEN || '';
  let sandbox = false;

  if (!appId || !token) {
    const fileConfig = getQQConfigFromFile();
    if (fileConfig) {
      appId = fileConfig.appId;
      appSecret = fileConfig.appSecret;
      token = fileConfig.token;
      sandbox = fileConfig.sandbox;
    }
  }

  if (!appId || !token) {
    const hint = process.env.QQ_APP_ID ? 'Set QQ_BOT_TOKEN' : 'Set QQ_APP_ID and QQ_BOT_TOKEN';
    console.log(`\x1b[33m⚠️  QQ channel skipped: ${hint} to enable\x1b[0m`);
    return;
  }

  try {
    const { QQChannel } = await import('../channels/qq.js');
    const channel = new QQChannel({ appId, appSecret, token, sandbox });

    await channel.start(async (msg) => {
      console.log(`\n\x1b[35m📩 QQ [${msg.userId}]: ${msg.content}\x1b[0m`);

      try {
        const result = await agent.run(
          msg.content,
          tools,
          'You are EvoAgent, a helpful AI assistant. Be concise and accurate.',
          (chunk) => process.stdout.write(chunk)
        );

        await channel.send({ ...msg, content: result });
        console.log(`\x1b[35m📨 QQ reply sent\x1b[0m`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`\x1b[31m❌ QQ error: ${errMsg}\x1b[0m`);
      }
    });

    console.log('\x1b[35m🐧 QQ channel connected\x1b[0m');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31m❌ QQ channel failed: ${msg}\x1b[0m`);
    console.log('💡 Make sure ws module is installed.');
  }
}

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
  .version('0.5.0');

program
  .option('-p, --prompt <task>', '单次任务模式')
  .option('-c, --channel <channel>', '指定渠道 (cli/feishu/mcp/web)', 'cli')
  .option('--thinking', '启用思考模式')
  .option('--model <model>', '指定模型', 'LongCat-2.0-Preview');

program
  .command('gateway')
  .description('启动网关 + Web 仪表台 + 飞书渠道')
  .option('--port <port>', '端口号', '3000')
  .option('--no-feishu', '不启动飞书渠道')
  .action(async (options) => {
    const agent = createAgent({
      model: program.opts().model,
      thinking: program.opts().thinking
    });

    // 启动 Web 网关
    const gatewayPromise = startGateway({
      agentLoop: agent,
      systemPrompt: 'You are EvoAgent, a helpful AI assistant. Be concise and accurate.',
      tools: []
    }, parseInt(options.port));

    // 同时启动飞书和 QQ 渠道
    if (options.feishu !== false) {
      await startFeishuChannel(agent, []);
    }
    await startQQChannel(agent, []);

    await gatewayPromise;
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

// 注册 Skill 市场命令
registerSkillCommands(program);

// 解析参数
const opts = program.opts();
const hasSubcommand = process.argv.slice(2).some(a => ['gateway', 'setup', 'status', 'plugins', 'skills'].includes(a));

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
