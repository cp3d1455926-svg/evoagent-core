/**
 * EvoAgent — Agent 工厂 v2.0
 *
 * 统一创建配置好的 AgentLoop 实例
 * v0.5.0 改进：
 * - 集成 KV 缓存
 * - Token 预算控制
 * - 增强记忆配置
 * - 模糊去重
 */

import { AgentLoop } from '../core/agent-loop.js';
import { createLLMClient, FailoverClient } from '../core/llm-client.js';
import { llmCache } from '../core/kv-cache.js';
import type { FailoverConfig } from '../core/llm-client.js';
import { MemorySystem } from '../memory/memory-system.js';
import { DefaultPermissionSystem } from '../core/permission.js';
import { ContextCompressor } from '../core/context-compressor.js';
import { ToolExecutor } from '../tools/tool-executor.js';
import { Logger } from '../telemetry/logger.js';
import { defaultConfig } from '../config/default-config.js';

export interface AgentOptions {
  model?: string;
  thinking?: boolean;
  maxIterations?: number;
  permissionMode?: 'default' | 'bypass' | 'plan' | 'auto';
  apiKey?: string;
  baseURL?: string;
  fallbacks?: Array<{ provider: string; apiKey: string; model: string; baseURL?: string }>;
  logger?: import('../telemetry/logger.js').Logger;
  /** Token 预算（整个会话） */
  tokenBudget?: number;
  /** 是否启用 LLM 响应缓存 */
  enableCache?: boolean;
}

export function createAgent(options: AgentOptions = {}): AgentLoop {
  const cfg = defaultConfig;

  const primaryConfig = {
    provider: cfg.llm.provider,
    apiKey: options.apiKey || process.env.LONGCAT_API_KEY || process.env.OPENAI_API_KEY || '',
    model: options.model || cfg.llm.model,
    baseURL: options.baseURL || cfg.llm.baseURL,
    maxTokens: cfg.llm.maxTokens,
    cache: options.enableCache !== false ? llmCache : undefined,
    tokenBudget: options.tokenBudget
  };

  const llm = options.fallbacks && options.fallbacks.length > 0
    ? new FailoverClient({
        primary: primaryConfig,
        fallbacks: options.fallbacks
      })
    : createLLMClient(primaryConfig);

  const logger = options.logger ?? new Logger('evoagent');

  const memory = new MemorySystem({
    working: { maxTokens: cfg.memory.working.maxTokens },
    longTerm: { provider: cfg.memory.longTerm.provider, url: cfg.memory.longTerm.url },
    skill: { autoEvolve: cfg.memory.skill.autoEvolve },
    episodic: { provider: cfg.memory.episodic.provider, url: cfg.memory.episodic.url },
    consolidationInterval: 10,
    maxContextTokens: 4000
  });

  const permissions = new DefaultPermissionSystem({
    mode: options.permissionMode || cfg.permissions.defaultMode as 'default' | 'bypass' | 'plan' | 'auto',
    allowedTools: cfg.permissions.allowedTools,
    sandboxEnabled: cfg.permissions.sandboxEnabled
  });

  const tools = new ToolExecutor();

  const compressor = new ContextCompressor({
    maxTokens: cfg.agent.maxTokens,
    softThreshold: 0.8,
    preserveSystemMessages: true,
    enableFuzzyDedup: true
  });

  return new AgentLoop({
    llm,
    memory,
    permissions,
    tools,
    compressor,
    maxIterations: options.maxIterations || cfg.agent.maxIterations,
    thinkingMode: options.thinking || cfg.agent.thinkingMode,
    maxRetries: 3,
    retryDelayMs: 1000,
    logger
  });
}
