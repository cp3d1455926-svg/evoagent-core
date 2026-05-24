/* eslint-disable no-console */
/**
 * EvoAgent 配置向导
 *
 * 交互式配置：
 * 1. 大语言模型提供商（模型、API 密钥、接口地址）
 * 2. 飞书渠道（应用 ID、应用密钥、策略）
 * 3. 记忆设置
 * 4. 权限模式
 *
 * 用法：evoagent setup
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createInterface } from 'readline';

const CONFIG_DIR = join(process.env.USERPROFILE || process.env.HOME || '.', '.evoagent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askWithDefault(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question + ' [' + defaultValue + ']: ', answer => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

function askYesNo(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '是/否' : '否/是';
  return askWithDefault(question + ' (' + hint + ')', defaultYes ? '是' : '否').then(a => a === '是' || a.toLowerCase() === 'y' || a.toLowerCase() === 'yes');
}

export async function runSetup(): Promise<void> {
  console.log('');
  console.log('============================================');
  console.log('  EvoAgent 配置向导');
  console.log('============================================');
  console.log('  配置文件将保存至：' + CONFIG_FILE);
  console.log('');

  // ─── 第一步：大语言模型 ────────────────────────────
  console.log('--- 第一步：大语言模型配置 ---');
  console.log('  支持的提供商：openai、anthropic、longcat');
  console.log('');

  const provider = await askWithDefault('提供商', 'openai');
  const model = await askWithDefault('模型', provider === 'anthropic' ? 'claude-sonnet-4-20250514' : provider === 'longcat' ? 'LongCat-2.0-Preview' : 'gpt-4o');
  const apiKey = await ask('API 密钥' + (process.env.OPENAI_API_KEY ? '（留空则使用环境变量）' : '') + '：');
  const baseURL = await askWithDefault('接口地址（留空使用默认）', provider === 'longcat' ? 'https://api.longcat.chat/openai' : '');

  // ─── 第二步：飞书渠道 ──────────────────────────────
  console.log('');
  console.log('--- 第二步：飞书渠道 ---');

  const enableFeishu = await askYesNo('是否启用飞书渠道？');

  let feishuConfig: {
    appId: string;
    appSecret: string;
    domain: string;
    dmPolicy: string;
    groupPolicy: string;
    requireMention: boolean;
  } | null = null;

  if (enableFeishu) {
    console.log('');
    console.log('  获取凭证：https://open.feishu.cn/app');
    console.log('');

    const appId = await ask('飞书应用 ID：');
    const appSecret = await ask('飞书应用密钥：');
    const domain = await askWithDefault('域名（国内飞书/海外 Lark）', 'feishu');
    const dmPolicy = await askWithDefault('私聊策略（开放/配对/白名单/禁用）', '配对');
    const groupPolicy = await askWithDefault('群聊策略（开放/白名单/禁用）', '开放');
    const requireMention = await askYesNo('群聊中是否需要 @机器人 才回复？', true);

    feishuConfig = { appId, appSecret, domain, dmPolicy, groupPolicy, requireMention: requireMention ?? true };
  }

  // ─── 第三步：记忆设置 ──────────────────────────────
  console.log('');
  console.log('--- 第三步：记忆设置 ---');

  const memoryProvider = await askWithDefault('长期记忆存储（内存/ChromaDB）', '内存');
  const chromadbUrl = memoryProvider === 'ChromaDB' ? await askWithDefault('ChromaDB 地址', 'http://localhost:8000') : '';
  const episodicProvider = await askWithDefault('事件记忆存储（SQLite/内存）', 'SQLite');
  const autoEvolve = await askYesNo('是否从对话中自动学习技能？', true);

  // ─── 第四步：权限模式 ──────────────────────────────
  console.log('');
  console.log('--- 第四步：权限模式 ---');
  console.log('  默认模式   - 写入操作需要确认');
  console.log('  全部放行   - 自动批准所有操作（适合 CI/CD）');
  console.log('  只读模式   - 禁止写入和执行');
  console.log('  自动模式   - 基于风险评分自动决策');
  console.log('');

  const permissionMode = await askWithDefault('权限模式', '默认模式');

  // ─── 第五步：高级选项 ──────────────────────────────
  console.log('');
  console.log('--- 第五步：高级选项 ---');

  const maxIterations = await askWithDefault('最大迭代次数', '50');
  const thinkingMode = await askYesNo('是否启用思考模式？', false);
  const logLevel = await askWithDefault('日志级别（调试/信息/警告/错误）', '信息');

  // ─── 生成配置文件 ─────────────────────────────────
  const config = {
    代理: {
      模型: model,
      最大迭代次数: parseInt(maxIterations),
      思考模式: thinkingMode,
      日志级别: logLevel
    },
    大语言模型: {
      提供商: provider,
      API密钥: apiKey || '${OPENAI_API_KEY}',
      接口地址: baseURL || undefined,
      模型: model
    },
    渠道: {
      命令行: { 启用: true },
      飞书: enableFeishu && feishuConfig ? {
        启用: true,
        应用ID: feishuConfig.appId,
        应用密钥: feishuConfig.appSecret,
        域名: feishuConfig.domain,
        私聊策略: feishuConfig.dmPolicy,
        群聊策略: feishuConfig.groupPolicy,
        需要提及: feishuConfig.requireMention
      } : { 启用: false },
      MCP: { 启用: false },
      网页: { 启用: false, 端口: 3000 }
    },
    记忆: {
      长期记忆: {
        存储: memoryProvider,
        ...(memoryProvider === 'ChromaDB' && { 地址: chromadbUrl })
      },
      事件记忆: { 存储: episodicProvider },
      技能记忆: { 自动学习: autoEvolve }
    },
    权限: {
      默认模式: permissionMode
    }
  };

  const yaml = toYAML(config, 0);

  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, yaml, 'utf-8');

  console.log('');
  console.log('============================================');
  console.log('  配置已保存至：');
  console.log('  ' + CONFIG_FILE);
  console.log('============================================');
  console.log('');
  console.log('  启动方式：');
  console.log('    evoagent                   交互式会话');
  console.log('    evoagent gateway           启动网关');
  console.log('    evoagent -p "你的任务"     单次任务');
  console.log('');
}

/**
 * 简易 YAML 序列化
 */
function toYAML(obj: any, indent: number): string {
  const pad = '  '.repeat(indent);
  let result = '';

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      result += pad + key + ': null\n';
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      result += pad + key + ':\n';
      result += toYAML(value, indent + 1);
    } else if (typeof value === 'boolean') {
      result += pad + key + ': ' + (value ? 'true' : 'false') + '\n';
    } else if (typeof value === 'number') {
      result += pad + key + ': ' + value + '\n';
    } else {
      const str = String(value);
      const needsQuote = /[:#[\]{}>&*!|@`%]/.test(str) || str.includes('\n');
      if (needsQuote) {
        result += pad + key + ': "' + str.replace(/"/g, '\\"') + '"\n';
      } else {
        result += pad + key + ': ' + str + '\n';
      }
    }
  }

  return result;
}
