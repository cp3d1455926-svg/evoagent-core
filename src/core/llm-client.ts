/**
 * EvoAgent — LLM 客户端抽象
 *
 * 支持多后端：Anthropic Claude、OpenAI、LongCat 等
 * v0.4.0 改进：
 * - KV 缓存集成，提高缓存命中率
 * - Token 预算控制
 * - 智能消息截断（省 token）
 * - 缓存统计
 */

import type { LLMMessage, LLMResponse, LLMChatRequest, ToolDefinition } from './types.js';
import { llmCache, KVCache } from './kv-cache.js';

export interface LLMClient {
  chat(request: LLMChatRequest): Promise<LLMResponse>;
  getModel(): string;
}

// ─── 工具函数 ──────────────────────────────────────────

/** 估算消息 token 数 */
function estimateTokens(msgs: LLMMessage[]): number {
  return msgs.reduce((sum, m) => {
    let len = m.content?.length ?? 0;
    if (m.toolCalls) len += JSON.stringify(m.toolCalls).length;
    return sum + Math.ceil(len / 4);
  }, 0);
}

/** 构建缓存 key */
function buildCacheKey(model: string, msgs: LLMMessage[], tools?: ToolDefinition[]): string {
  const parts = [model];
  for (const m of msgs) {
    parts.push(`${m.role}:${m.content?.slice(0, 200)}`);
  }
  if (tools?.length) parts.push(`tools:${tools.map(t => t.name).join(',')}`);
  return parts.join('|');
}

// ─── 智能消息截断（省 token） ──────────────────────────

/**
 * 智能截断消息列表以适配 token 限制
 * 策略：
 * 1. 保留所有 system 消息
 * 2. 保留最后一条 user 消息
 * 3. 截断过长的 tool 输出（保留头尾）
 * 4. 如果还超，移除最旧的非关键消息
 */
function truncateMessages(msgs: LLMMessage[], maxTokens: number): LLMMessage[] {
  const result = [...msgs];
  let tokens = estimateTokens(result);
  if (tokens <= maxTokens) return result;

  // 阶段 1: 截断过长的 tool 输出
  for (let i = 0; i < result.length && tokens > maxTokens; i++) {
    const m = result[i];
    if (m.role === 'tool' && (m.content?.length ?? 0) > 1000) {
      const originalLen = m.content!.length;
      const truncated = m.content!.slice(0, 400) +
        `\n...[${originalLen - 800} chars omitted]...\n` +
        m.content!.slice(-400);
      tokens -= Math.ceil(m.content!.length / 4);
      tokens += Math.ceil(truncated.length / 4);
      result[i] = { ...m, content: truncated };
    }
  }

  // 阶段 2: 移除最旧的非关键消息对（assistant + tool）
  while (tokens > maxTokens && result.length > 3) {
    const lastUserIdx = result.map((m, i) => ({ m, i })).reverse().find(x => x.m.role === 'user')?.i ?? -1;
    let removed = false;
    for (let i = 1; i < result.length - 1; i++) {
      if (result[i].role === 'assistant' && i !== lastUserIdx) {
        const nextIsTool = result[i + 1]?.role === 'tool';
        const toRemove = nextIsTool ? 2 : 1;
        const removedMsgs = result.splice(i, toRemove);
        tokens -= estimateTokens(removedMsgs);
        removed = true;
        break;
      }
    }
    if (!removed) break;
  }

  // 阶段 3: 最后手段 — 只保留 system + 最后 2 条
  if (tokens > maxTokens) {
    const systemMsgs = result.filter(m => m.role === 'system');
    const last2 = result.slice(-2);
    return [...systemMsgs, ...last2];
  }

  return result;
}

// ─── Anthropic Claude 客户端 ──────────────────────────

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  maxTokens?: number;
  cache?: KVCache<string>;
  tokenBudget?: number;
}

export class AnthropicClient implements LLMClient {
  private apiKey: string;
  private model: string;
  private baseURL: string;
  private maxTokens: number;
  private cache: KVCache<string>;
  private tokenBudget: number;
  private tokensUsed = 0;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseURL = config.baseURL || 'https://api.anthropic.com';
    this.maxTokens = config.maxTokens || 8192;
    this.cache = config.cache ?? llmCache;
    this.tokenBudget = config.tokenBudget ?? Infinity;
  }

  getModel(): string { return this.model; }

  getTokenUsage() {
    return { used: this.tokensUsed, budget: this.tokenBudget, remaining: Math.max(0, this.tokenBudget - this.tokensUsed) };
  }

  async chat(request: LLMChatRequest): Promise<LLMResponse> {
    // 缓存查找
    const cacheKey = buildCacheKey(this.model, request.messages, request.tools);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as LLMResponse;
      request.onChunk?.(parsed.content ?? '');
      return { ...parsed, finishReason: 'stop' };
    }

    // Token 预算
    const inputEstimate = estimateTokens(request.messages);
    if (this.tokensUsed + inputEstimate > this.tokenBudget) {
      throw new Error(`Token budget exceeded: used ${this.tokensUsed}/${this.tokenBudget}`);
    }

    // 智能截断
    const truncated = truncateMessages(request.messages, this.maxTokens * 4 * 0.9);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: truncated.map(m => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content
      })),
      stream: true
    };

    if (request.tools?.length) {
      body.tools = request.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
      }));
    }

    const response = await fetch(`${this.baseURL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let textContent = '';
    const toolCallDeltas: Map<number, { id: string; name: string; input: string }> = new Map();
    let stopReason = 'stop';
    let usage = { input_tokens: 0, output_tokens: 0 };
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          switch (event.type) {
            case 'content_block_start':
              if (event.content_block?.type === 'tool_use') {
                toolCallDeltas.set(event.index, { id: event.content_block.id, name: event.content_block.name, input: '' });
              }
              break;
            case 'content_block_delta':
              if (event.delta?.type === 'text_delta' && event.delta?.text) {
                textContent += event.delta.text;
                request.onChunk?.(event.delta.text);
              } else if (event.delta?.type === 'input_json_delta') {
                const tc = toolCallDeltas.get(event.index);
                if (tc) tc.input += event.delta.partial_json || '';
              }
              break;
            case 'message_delta':
              stopReason = event.delta?.stop_reason || stopReason;
              if (event.usage) usage.output_tokens = event.usage.output_tokens || usage.output_tokens;
              break;
            case 'message_start':
              if (event.message?.usage) usage.input_tokens = event.message.usage.input_tokens || 0;
              break;
          }
        } catch { /* skip */ }
      }
    }

    const toolCalls: LLMResponse['toolCalls'] = [];
    for (const [, tc] of toolCallDeltas) {
      try { toolCalls.push({ id: tc.id, name: tc.name, arguments: JSON.parse(tc.input || '{}') }); }
      catch { toolCalls.push({ id: tc.id, name: tc.name, arguments: {} }); }
    }

    this.tokensUsed += usage.input_tokens + usage.output_tokens;

    const result: LLMResponse = {
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
      finishReason: stopReason === 'tool_use' ? 'tool_calls' : 'stop'
    };

    // 缓存响应（仅无工具调用的纯文本响应）
    if (!result.toolCalls) {
      this.cache.set(cacheKey, JSON.stringify(result), 3600000);
    }

    return result;
  }
}

// ─── OpenAI 兼容客户端 ─────────────────────────────────

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  maxTokens?: number;
  cache?: KVCache<string>;
  tokenBudget?: number;
}

export class OpenAIClient implements LLMClient {
  private apiKey: string;
  private model: string;
  private baseURL: string;
  private maxTokens: number;
  private cache: KVCache<string>;
  private tokenBudget: number;
  private tokensUsed = 0;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.maxTokens = config.maxTokens || 8192;
    this.cache = config.cache ?? llmCache;
    this.tokenBudget = config.tokenBudget ?? Infinity;
  }

  getModel(): string { return this.model; }

  getTokenUsage() {
    return { used: this.tokensUsed, budget: this.tokenBudget, remaining: Math.max(0, this.tokenBudget - this.tokensUsed) };
  }

  async chat(request: LLMChatRequest): Promise<LLMResponse> {
    // 缓存查找
    const cacheKey = buildCacheKey(this.model, request.messages, request.tools);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as LLMResponse;
      request.onChunk?.(parsed.content ?? '');
      return { ...parsed, finishReason: 'stop' };
    }

    // Token 预算
    const inputEstimate = estimateTokens(request.messages);
    if (this.tokensUsed + inputEstimate > this.tokenBudget) {
      throw new Error(`Token budget exceeded: used ${this.tokensUsed}/${this.tokenBudget}`);
    }

    // 智能截断
    const truncated = truncateMessages(request.messages, this.maxTokens * 4 * 0.9);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: truncated.map(m => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.toolCalls) {
          msg.tool_calls = m.toolCalls.map(tc => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
          }));
        }
        if (m.toolCallId) msg.tool_call_id = m.toolCallId;
        return msg;
      }),
      stream: true
    };

    if (request.tools?.length) {
      body.tools = request.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters }
      }));
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let textContent = '';
    const toolCallDeltas: Map<number, { id: string; name: string; arguments: string }> = new Map();
    let finishReason = 'stop';
    let usage = { prompt_tokens: 0, completion_tokens: 0 };
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          const choice = event.choices?.[0];
          if (!choice) continue;
          if (choice.delta?.content) {
            textContent += choice.delta.content;
            request.onChunk?.(choice.delta.content);
          }
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallDeltas.has(idx)) toolCallDeltas.set(idx, { id: '', name: '', arguments: '' });
              const delta = toolCallDeltas.get(idx)!;
              if (tc.id) delta.id = tc.id;
              if (tc.function?.name) delta.name = tc.function.name;
              if (tc.function?.arguments) delta.arguments += tc.function.arguments;
            }
          }
          if (choice.finish_reason) finishReason = choice.finish_reason;
          if (event.usage) usage = event.usage;
        } catch { /* skip */ }
      }
    }

    const toolCalls: LLMResponse['toolCalls'] = [];
    for (const [, tc] of toolCallDeltas) {
      try { toolCalls.push({ id: tc.id, name: tc.name, arguments: JSON.parse(tc.arguments || '{}') }); }
      catch { toolCalls.push({ id: tc.id, name: tc.name, arguments: {} }); }
    }

    this.tokensUsed += usage.prompt_tokens + usage.completion_tokens;

    const result: LLMResponse = {
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
      finishReason: finishReason === 'tool_calls' ? 'tool_calls' : 'stop'
    };

    // 缓存响应（仅无工具调用的纯文本响应）
    if (!result.toolCalls) {
      this.cache.set(cacheKey, JSON.stringify(result), 3600000);
    }

    return result;
  }
}

// ─── 多模型 Failover 客户端 ──────────────────────────

export interface FailoverConfig {
  primary: { provider: string; apiKey: string; model: string; baseURL?: string; maxTokens?: number };
  fallbacks: Array<{ provider: string; apiKey: string; model: string; baseURL?: string; maxTokens?: number }>;
}

export class FailoverClient implements LLMClient {
  private clients: LLMClient[] = [];
  private currentIndex = 0;

  constructor(config: FailoverConfig) {
    this.clients = [
      createLLMClient(config.primary),
      ...config.fallbacks.map(fb => createLLMClient(fb))
    ];
  }

  getModel(): string { return this.clients[this.currentIndex].getModel(); }

  async chat(request: LLMChatRequest): Promise<LLMResponse> {
    let lastError: Error | undefined;
    for (let i = 0; i < this.clients.length; i++) {
      const idx = (this.currentIndex + i) % this.clients.length;
      try { return await this.clients[idx].chat(request); }
      catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`LLM failover: ${this.clients[idx].getModel()} failed (${lastError.message})`);
      }
    }
    throw lastError || new Error('All LLM providers failed');
  }
}

// ─── 工厂函数 ──────────────────────────────────────────

export function createLLMClient(config: {
  provider: string; apiKey: string; model: string;
  baseURL?: string; maxTokens?: number;
  cache?: KVCache<string>; tokenBudget?: number;
}): LLMClient {
  const provider = config.provider.toLowerCase();
  if (provider === 'anthropic' || provider === 'claude') {
    return new AnthropicClient({
      apiKey: config.apiKey, model: config.model,
      baseURL: config.baseURL, maxTokens: config.maxTokens,
      cache: config.cache, tokenBudget: config.tokenBudget
    });
  }
  const knownBaseURLs: Record<string, string> = {
    deepseek: 'https://api.deepseek.com/v1',
    glm: 'https://open.bigmodel.cn/api/paas/v4',
    moonshot: 'https://api.moonshot.cn/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    wenxin: 'https://qianfan.baidubce.com/v2',
    longcat: 'https://api.longcat.chat/openai',
  };
  return new OpenAIClient({
    apiKey: config.apiKey, model: config.model,
    baseURL: config.baseURL || knownBaseURLs[provider],
    maxTokens: config.maxTokens,
    cache: config.cache, tokenBudget: config.tokenBudget
  });
}
