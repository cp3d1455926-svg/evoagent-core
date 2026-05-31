/* eslint-disable no-console */
/**
 * EvoAgent 配置向导 v0.5.0
 *
 * 双语交互式配置向导，支持方向键选择（自动降级数字选择）
 * v0.5.0: 新增飞书渠道配置
 *
 * 用法：evoagent setup
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import * as readline from 'node:readline';
import { stdin as stdin, stdout as stdout } from 'process';

const CONFIG_DIR = join(process.env.USERPROFILE || process.env.HOME || '.', '.evoagent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');

// ─── 语言支持 ─────────────────────────────────────────

type Lang = 'en' | 'zh';
let lang: Lang = 'en';

const T: Record<string, Record<Lang, string>> = {
  welcome: { en: 'Welcome to EvoAgent setup!', zh: '欢迎使用 EvoAgent 配置向导！' },
  configWillBeSaved: { en: 'Config will be saved to:', zh: '配置文件将保存至：' },
  step: { en: 'Step', zh: '第' },
  llmConfig: { en: 'LLM Configuration', zh: '大语言模型配置' },
  supportedProviders: { en: 'Supported: openai, anthropic, longcat, deepseek, glm, moonshot, qwen, wenxin', zh: '支持：openai、anthropic、longcat、deepseek、glm、moonshot、通义千问、文心一言' },
  provider: { en: 'Provider', zh: '提供商' },
  model: { en: 'Model', zh: '模型' },
  apiKey: { en: 'API Key (leave empty to use env var)', zh: 'API 密钥（留空则使用环境变量）' },
  baseUrl: { en: 'Base URL (leave empty for default)', zh: '接口地址（留空使用默认）' },
  permissionConfig: { en: 'Permission Mode', zh: '权限模式' },
  permissionDefault: { en: 'default - Write operations need approval', zh: 'default - 写入操作需要确认' },
  permissionBypass: { en: 'bypass - Auto-approve all (CI/CD)', zh: 'bypass - 自动批准全部（适合 CI/CD）' },
  permissionPlan: { en: 'plan - Read-only, no writes or shell', zh: 'plan - 只读，禁止写入和执行' },
  desktopConfig: { en: 'Desktop Control', zh: '桌面控制' },
  desktopDesc: { en: 'Allow desktop control? (screenshots, open apps, clipboard)', zh: '允许桌面操控？（截图、打开应用、剪贴板）' },
  workspaceConfig: { en: 'Workspace', zh: '工作区' },
  workspacePath: { en: 'Workspace path', zh: '工作区路径' },
  feishuConfig: { en: 'Feishu/Lark Bot', zh: '飞书机器人' },
  feishuDesc: { en: 'Connect to Feishu bot for messaging', zh: '连接飞书机器人接收消息' },
  feishuAppId: { en: 'Feishu App ID', zh: '飞书 App ID' },
  feishuAppSecret: { en: 'Feishu App Secret', zh: '飞书 App Secret' },
  feishuDomain: { en: 'Domain', zh: '域名' },
  feishuDomainFeishu: { en: 'feishu (China)', zh: '飞书（国内）' },
  feishuDomainLark: { en: 'lark (International)', zh: 'Lark（海外）' },
  feishuHint: { en: 'Find these at open.feishu.cn => your app => Credentials', zh: '在飞书开放平台 => 你的应用 => 凭证与基础信息 中获取' },
  qqConfig: { en: 'QQ Bot', zh: 'QQ 机器人' },
  qqDesc: { en: 'Connect to QQ bot for messaging', zh: '连接 QQ 机器人接收消息' },
  qqAppId: { en: 'QQ Bot App ID', zh: 'QQ App ID' },
  qqToken: { en: 'QQ Bot Token', zh: 'QQ Bot Token' },
  qqSandbox: { en: 'Use sandbox mode?', zh: '使用沙箱模式？' },
  qqHint: { en: 'Find these at bot.q.qq.com => your bot', zh: '在 QQ 开放平台 => 你的机器人 中获取' },
  skillConfig: { en: 'Skills', zh: 'Skill 配置' },
  initSkills: { en: 'Create sample skills directory?', zh: '创建示例 Skills 目录？' },
  memoryConfig: { en: 'Memory', zh: '记忆配置' },
  memoryProvider: { en: 'Long-term memory storage', zh: '长期记忆存储' },
  memoryDesc: { en: 'memory / chromadb', zh: '内存 / ChromaDB' },
  autoLearn: { en: 'Auto-learn skills from conversations?', zh: '从对话中自动学习技能？' },
  advanced: { en: 'Advanced', zh: '高级选项' },
  maxIterations: { en: 'Max iterations', zh: '最大迭代次数' },
  logLevel: { en: 'Log level', zh: '日志级别' },
  logDesc: { en: 'debug / info / warn / error', zh: '调试 / 信息 / 警告 / 错误' },
  configSaved: { en: 'Configuration saved!', zh: '配置已保存！' },
  startInfo: { en: 'How to start:', zh: '启动方式：' },
  interactive: { en: 'Interactive session', zh: '交互式会话' },
  gateway: { en: 'Gateway + dashboard', zh: '网关 + 仪表台' },
  singleTask: { en: 'Single task mode', zh: '单次任务模式' },
  sampleSkillsCreated: { en: 'Created skills/ directory. Use /market install to add skills.', zh: '已创建 skills/ 目录。使用 /market install 添加技能。' },
  useArrowKeys: { en: 'Use arrow keys to move, ENTER to select', zh: '使用方向键移动，回车确认' },
};

function t(key: string): string {
  return (T[key] && T[key][lang]) || key;
}

// ─── 箭头选择器（自动降级）───────────────────────────

async function askSelect<T>(question: string, options: T[], displayFn: (item: T, index: number) => string): Promise<T> {
  if (stdin.isTTY) {
    try {
      return await rawSelect(question, options, displayFn);
    } catch {
      // raw mode 不支持的终端，降级
    }
  }

  // 降级：数字选择
  stdout.write('\n' + question + '\n');
  for (let i = 0; i < options.length; i++) {
    stdout.write('  ' + (i + 1) + '. ' + displayFn(options[i], i) + '\n');
  }
  stdout.write('\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<T>(resolve => {
    const prompt = lang === 'zh' ? '  选择 (1-' + options.length + '): ' : '  Choose (1-' + options.length + '): ';
    rl.question(prompt, answer => {
      rl.close();
      const idx = parseInt(answer.trim()) - 1;
      if (idx >= 0 && idx < options.length) {
        resolve(options[idx]);
      } else {
        resolve(options[0]);
      }
    });
  });
}

function rawSelect<T>(question: string, options: T[], displayFn: (item: T, index: number) => string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      let selected = 0;

      stdout.write('\n' + question + '\n');
      stdout.write('  ' + t('useArrowKeys') + '\n\n');

      function render() {
        for (let i = 0; i < options.length + 1; i++) {
          stdout.write('\x1b[1A\x1b[2K');
        }
        for (let i = 0; i < options.length; i++) {
          const prefix = i === selected ? '\x1b[32m>\x1b[0m ' : '  ';
          stdout.write(prefix + displayFn(options[i], i) + '\n');
        }
      }

      render();

      const onData = (buf: Buffer) => {
        const key = buf.toString();

        if (key === '\u001b[A') {
          selected = (selected - 1 + options.length) % options.length;
          render();
          return;
        }
        if (key === '\u001b[B') {
          selected = (selected + 1) % options.length;
          render();
          return;
        }
        if (key === '\r' || key === '\n') {
          stdin.removeListener('data', onData);
          for (let i = 0; i < options.length + 2; i++) stdout.write('\x1b[1A\x1b[2K');
          stdout.write('\r');
          cleanup();
          resolve(options[selected]);
        }
      };

      function cleanup() {
        try { stdin.setRawMode(false); } catch {}
        stdin.pause();
      }

      stdin.setRawMode(true);
      stdin.resume();
      stdin.on('data', onData);
    } catch (err) {
      reject(err);
    }
  });
}

// ─── 文本输入 ─────────────────────────────────────────

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function askWithDefault(question: string, defaultValue: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question + ' [' + defaultValue + ']: ', answer => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

// ─── 主流程 ───────────────────────────────────────────

export async function runSetup(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       EvoAgent Setup Wizard             ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // ─── 选择语言 ─────────────────────────────────────
  lang = await askSelect(
    '',
    ['en', 'zh'],
    (l) => l === 'en' ? 'English' : '中文'
  );

  console.log('\n' + 'EvoAgent v0.5.0 - ' + t('welcome'));
  console.log('  ' + t('configWillBeSaved') + ' ' + CONFIG_FILE + '\n');

  // ─── 1. LLM ─────────────────────────────────────
  console.log('--- ' + t('step') + ' 1: ' + t('llmConfig') + ' ---');
  console.log('  ' + t('supportedProviders') + '\n');

  const providers = ['longcat', 'openai', 'anthropic', 'deepseek', 'glm', 'moonshot', 'qwen', 'wenxin'];
  const provider = await askSelect(
    t('provider'),
    providers,
    (p) => p
  );

  // 模型选择（按提供商分组）
  const modelOptions: Record<string, string[]> = {
    longcat: ['LongCat-2.0-Preview', 'LongCat-2.0-Turbo'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-latest', 'claude-3-haiku'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    glm: ['glm-4', 'glm-4v', 'glm-4-air'],
    moonshot: ['moonshot-v1-8k', 'moonshot-v1-32k'],
    qwen: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    wenxin: ['ernie-4.0', 'ernie-3.5'],
  };
  const availableModels = modelOptions[provider] || [provider];
  const model = await askSelect(
    t('model'),
    availableModels,
    (m) => m === availableModels[0] ? `${m} (default)` : m
  );

  const apiKey = await ask(t('apiKey') + ': ');
  const baseURL = await askWithDefault(t('baseUrl'), '');

  // ─── 2. 权限模式 ───────────────────────────────
  console.log('\n--- ' + t('step') + ' 2: ' + t('permissionConfig') + ' ---\n');

  const permissionMode = await askSelect(
    '',
    ['default', 'bypass', 'plan'],
    (m) => {
      const descs: Record<string, string> = {
        default: t('permissionDefault'),
        bypass: t('permissionBypass'),
        plan: t('permissionPlan'),
      };
      return descs[m] || m;
    }
  );

  // ─── 3. 桌面控制 ───────────────────────────────
  console.log('\n--- ' + t('step') + ' 3: ' + t('desktopConfig') + ' ---');
  console.log('  ' + t('desktopDesc') + '\n');

  const enableDesktop = await askSelect(
    '',
    [true, false],
    (v) => v ? 'Enable' : 'Disable'
  );

  // ─── 4. 工作区 ─────────────────────────────────
  console.log('\n--- ' + t('step') + ' 4: ' + t('workspaceConfig') + ' ---\n');
  const workspaceOptions = [process.cwd(), join(process.cwd(), 'src'), join(process.cwd(), 'dist'), join(process.cwd(), '..')];
  const workspacePath = await askSelect(
    t('workspacePath'),
    workspaceOptions,
    (p) => p
  );

  // ─── 5. 飞书渠道 ───────────────────────────────
  console.log('\n--- ' + t('step') + ' 5: ' + t('feishuConfig') + ' ---');
  console.log('  ' + t('feishuDesc'));
  console.log('  ' + t('feishuHint') + '\n');

  const enableFeishu = await askSelect(
    '',
    [true, false],
    (v) => v ? 'Enable' : 'Skip'
  );

  let feishuAppId = '';
  let feishuAppSecret = '';
  let feishuDomain = 'feishu';

  if (enableFeishu) {
    feishuAppId = await ask('  ' + t('feishuAppId') + ': ');
    feishuAppSecret = await ask('  ' + t('feishuAppSecret') + ': ');
    feishuDomain = await askSelect(
      '',
      ['feishu', 'lark'],
      (d) => d === 'feishu' ? t('feishuDomainFeishu') : t('feishuDomainLark')
    );
  }

  // ─── 6. QQ 渠道 ────────────────────────────────
  console.log('\n' + '--- ' + t('step') + ' 6: ' + t('qqConfig') + ' ---');
  console.log('  ' + t('qqDesc'));
  console.log('  ' + t('qqHint') + '\n');

  const enableQQ = await askSelect(
    '',
    [true, false],
    (v) => v ? 'Enable' : 'Skip'
  );

  let qqAppId = '';
  let qqToken = '';
  let qqSandbox = false;

  if (enableQQ) {
    qqAppId = await ask('  ' + t('qqAppId') + ': ');
    qqToken = await ask('  ' + t('qqToken') + ': ');
    qqSandbox = await askSelect(
      '',
      [false, true],
      (v) => v ? 'Yes' : 'No'
    );
  }

  // ─── 7. Skill ──────────────────────────────────
  console.log('\n--- ' + t('step') + ' 7: ' + t('skillConfig') + ' ---\n');
  const initSkillsDir = await askSelect(
    '',
    [true, false],
    (v) => v ? 'Create' : 'Skip'
  );

  // ─── 7. 记忆 ──────────────────────────────────
  console.log('\n--- ' + t('step') + ' 8: ' + t('memoryConfig') + ' ---');
  console.log('  ' + t('memoryDesc') + '\n');

  const memoryProvider = await askSelect(
    '',
    ['memory', 'chromadb'],
    (m) => m === 'memory' ? 'In-memory' : 'ChromaDB'
  );

  const autoEvolve = await askSelect(
    '',
    [true, false],
    (v) => v ? 'Enable' : 'Disable'
  );

  // ─── 8. 高级 ──────────────────────────────────
  console.log('\n--- ' + t('step') + ' 9: ' + t('advanced') + ' ---\n');
  const iterationOptions = ['10', '20', '30', '50', '100', '200'];
  const maxIterations = await askSelect(
    t('maxIterations'),
    iterationOptions,
    (v) => v === '50' ? `${v} (default)` : v
  );

  const logOptions = ['info', 'debug', 'warn', 'error'];
  const logLevel = await askSelect(
    t('logLevel'),
    logOptions,
    (v) => v === 'info' ? `${v} (default)` : v
  );

  // ─── 初始化 ────────────────────────────────────
  await mkdir(CONFIG_DIR, { recursive: true });

  if (initSkillsDir) {
    const skillsDir = join(process.cwd(), 'skills');
    await mkdir(skillsDir, { recursive: true });
    const readmePath = join(skillsDir, 'README.md');
    if (!existsSync(readmePath)) {
      await writeFile(readmePath, '# EvoAgent Skills\n\nInstall skills: evoagent skills install <slug>\n', 'utf-8');
    }
    console.log('  ' + t('sampleSkillsCreated'));
  }

  // ─── 生成 YAML ────────────────────────────────
  const config: Record<string, unknown> = {
    agent: {
      language: lang,
      model,
      maxIterations: parseInt(maxIterations),
      logLevel,
      desktopControl: enableDesktop,
      workspace: resolve(workspacePath),
    },
    feishu: enableFeishu ? {
      enabled: true,
      appId: feishuAppId,
      appSecret: feishuAppSecret,
      domain: feishuDomain,
    } : {
      enabled: false,
    },
    qq: enableQQ ? {
      enabled: true,
      appId: qqAppId,
      token: qqToken,
      sandbox: qqSandbox,
    } : {
      enabled: false,
    },
    llm: {
      provider,
      apiKey: apiKey || '${LONGCAT_API_KEY || OPENAI_API_KEY}',
      baseURL: baseURL || undefined,
      model,
    },
    permissions: {
      defaultMode: permissionMode,
    },
    memory: {
      provider: memoryProvider,
      autoLearnSkills: autoEvolve,
    },
  };

  const yaml = toYAML(config);
  await writeFile(CONFIG_FILE, yaml, 'utf-8');

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  ' + '  ' + t('configSaved') + '              ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('  ' + CONFIG_FILE + '\n');
  console.log('  ' + t('startInfo'));
  console.log('    evoagent             ' + t('interactive'));
  console.log('    evoagent gateway     ' + t('gateway'));
  console.log('    evoagent -p "..."    ' + t('singleTask'));
  console.log('');
}

// ─── YAML 序列化 ─────────────────────────────────────

function toYAML(obj: unknown, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  let result = '';

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      result += pad + key + ':\n';
      result += toYAML(value, indent + 1);
    } else if (typeof value === 'boolean') {
      result += pad + key + ': ' + (value ? 'true' : 'false') + '\n';
    } else if (typeof value === 'number') {
      result += pad + key + ': ' + value + '\n';
    } else {
      const str = String(value);
      const needsQuote = /[:#[\]{}>&*!|@`%]/.test(str) || str.includes('\n');
      result += pad + key + ': ' + (needsQuote ? '"' + str.replace(/"/g, '\\"') + '"' : str) + '\n';
    }
  }

  return result;
}
