/* eslint-disable no-console */
/**
 * EvoAgent - Interactive Setup Wizard
 *
 * Guides users through configuring:
 * 1. LLM provider (model, API key, base URL)
 * 2. Feishu channel (app ID, app secret, policies)
 * 3. Memory settings
 * 4. Permission mode
 *
 * Usage: evoagent setup
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
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
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return askWithDefault(question + ' (' + hint + ')', defaultYes ? 'y' : 'n').then(a => a.toLowerCase().startsWith('y'));
}

export async function runSetup(): Promise<void> {
  console.log('');
  console.log('============================================');
  console.log('  EvoAgent Setup Wizard');
  console.log('============================================');
  console.log('  This will create: ' + CONFIG_FILE);
  console.log('');

  // ─── Step 1: LLM Provider ──────────────────────────
  console.log('--- Step 1: LLM Provider ---');
  console.log('  Supported: openai, anthropic, longcat');
  console.log('');

  const provider = await askWithDefault('Provider', 'openai');
  const model = await askWithDefault('Model', provider === 'anthropic' ? 'claude-sonnet-4-20250514' : provider === 'longcat' ? 'LongCat-2.0-Preview' : 'gpt-4o');
  const apiKey = await ask('API Key' + (process.env.OPENAI_API_KEY ? ' (leave empty to use env)' : '') + ': ');
  const baseURL = await askWithDefault('Base URL (leave empty for default)', provider === 'longcat' ? 'https://api.longcat.chat/openai' : '');

  // ─── Step 2: Feishu Channel ────────────────────────
  console.log('');
  console.log('--- Step 2: Feishu Channel ---');

  const enableFeishu = await askYesNo('Enable Feishu channel?');

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
    console.log('  Get credentials from: https://open.feishu.cn/app');
    console.log('');

    const appId = await ask('Feishu App ID: ');
    const appSecret = await ask('Feishu App Secret: ');
    const domain = await askWithDefault('Domain (feishu/lark)', 'feishu');
    const dmPolicy = await askWithDefault('DM Policy (open/pairing/allowlist/disabled)', 'pairing');
    const groupPolicy = await askWithDefault('Group Policy (open/allowlist/disabled)', 'open');
    const requireMention = await askYesNo('Require @mention in groups?', true);

    feishuConfig = { appId, appSecret, domain, dmPolicy, groupPolicy, requireMention: requireMention ?? true };
  }

  // ─── Step 3: Memory Settings ───────────────────────
  console.log('');
  console.log('--- Step 3: Memory Settings ---');

  const memoryProvider = await askWithDefault('Long-term memory provider (memory/chromadb)', 'memory');
  const chromadbUrl = memoryProvider === 'chromadb' ? await askWithDefault('ChromaDB URL', 'http://localhost:8000') : '';
  const episodicProvider = await askWithDefault('Episodic memory provider (sqlite/memory)', 'sqlite');
  const autoEvolve = await askYesNo('Auto-learn skills from conversations?', true);

  // ─── Step 4: Permission Mode ───────────────────────
  console.log('');
  console.log('--- Step 4: Permission Mode ---');
  console.log('  default    - Write ops need approval');
  console.log('  bypass     - Auto-approve all (CI/CD)');
  console.log('  plan       - Read-only mode');
  console.log('  auto       - Risk-based auto decision');
  console.log('');

  const permissionMode = await askWithDefault('Permission Mode', 'default');

  // ─── Step 5: Advanced ──────────────────────────────
  console.log('');
  console.log('--- Step 5: Advanced ---');

  const maxIterations = await askWithDefault('Max Agent Loop iterations', '50');
  const thinkingMode = await askYesNo('Enable thinking mode?', false);
  const logLevel = await askWithDefault('Log Level (debug/info/warn/error)', 'info');

  // ─── Generate Config ───────────────────────────────
  const config = {
    agent: {
      model,
      maxIterations: parseInt(maxIterations),
      thinkingMode,
      logLevel
    },
    llm: {
      provider,
      apiKey: apiKey || '${OPENAI_API_KEY}',
      baseURL: baseURL || undefined,
      model
    },
    channels: {
      cli: { enabled: true },
      feishu: enableFeishu && feishuConfig ? {
        enabled: true,
        appId: feishuConfig.appId,
        appSecret: feishuConfig.appSecret,
        domain: feishuConfig.domain,
        dmPolicy: feishuConfig.dmPolicy,
        groupPolicy: feishuConfig.groupPolicy,
        requireMention: feishuConfig.requireMention
      } : { enabled: false },
      mcp: { enabled: false },
      web: { enabled: false, port: 3000 }
    },
    memory: {
      longTerm: {
        provider: memoryProvider,
        ...(memoryProvider === 'chromadb' && { url: chromadbUrl })
      },
      episodic: { provider: episodicProvider },
      skill: { autoEvolve }
    },
    permissions: {
      defaultMode: permissionMode
    }
  };

  // Convert to YAML manually (no external dependency)
  const yaml = toYAML(config, 0);

  // Write config
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, yaml, 'utf-8');

  console.log('');
  console.log('============================================');
  console.log('  Configuration saved to:');
  console.log('  ' + CONFIG_FILE);
  console.log('============================================');
  console.log('');
  console.log('  Start EvoAgent with:');
  console.log('    evoagent                    # Interactive mode');
  console.log('    evoagent gateway            # Start gateway');
  console.log('    evoagent -p "your task"     # Single task');
  console.log('');
}

/**
 * Simple YAML serializer (no external dependency)
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
      result += pad + key + ': ' + value + '\n';
    } else if (typeof value === 'number') {
      result += pad + key + ': ' + value + '\n';
    } else {
      // String
      const needsQuote = /[:#[\]{}>&*!|@`%]/.test(value as string) || (value as string).includes('\n');
      if (needsQuote) {
        result += pad + key + ': "' + (value as string).replace(/"/g, '\\"') + '"\n';
      } else {
        result += pad + key + ': ' + value + '\n';
      }
    }
  }

  return result;
}
