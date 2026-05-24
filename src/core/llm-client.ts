/**
 * EvoAgent — LLM 客户端抽象
 * 
 * 支持多后端：Anthropic Claude、OpenAI、LongCat 等
 */

import type { LLMMessage, LLMResponse, LLMChatRequest, ToolDefinition } from './types.js';

export interface LLMClient {
  chat(request: LLMChatRequest): Promise<LLMResponse>;
  getModel(): string;
}

// ─── Anthropic Claude 客户端 ──────────────────────────

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  maxTokens?: number;
}

export class AnthropicClient implements LLMClient {
  private apiKey: string;
  private model: string;
  private baseURL: string;
  private maxTokens: number;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseURL = config.baseURL || 'https://api.anthropic.com';
    this.maxTokens = config.maxTokens || 8192;
  }

  getModel(): string {
    return this.model;
  }

  async chat(request: LLMChatRequest): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: request.messages.map(m => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content
      })),
      stream: true
    };

    if (request.tools && request.tools.length > 0) {
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

    // ── 流式解析 SSE ──
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
                toolCallDeltas.set(event.index, {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: ''
                });
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
              if (event.usage) {
                usage.output_tokens = event.usage.output_tokens || usage.output_tokens;
              }
              break;
            case 'message_start':
              if (event.message?.usage) {
                usage.input_tokens = event.message.usage.input_tokens || 0;
              }
              break;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    // 组装 tool calls
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
    for (const [, tc] of toolCallDeltas) {
      try {
        toolCalls.push({ id: tc.id, name: tc.name, arguments: JSON.parse(tc.input || '{}') });
      } catch {
        toolCalls.push({ id: tc.id, name: tc.name, arguments: {} });
      }
    }

    return {
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens
      },
      finishReason: stopReason === 'tool_use' ? 'tool_calls' : 'stop'
    };
  }
}

// ─── OpenAI 兼容客户端 ─────────────────────────────────

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  maxTokens?: number;
}

export class OpenAIClient implements LLMClient {
  private apiKey: string;
  private model: string;
  private baseURL: string;
  private maxTokens: number;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.maxTokens = config.maxTokens || 8192;
  }

  getModel(): string {
    return this.model;
  }

  async chat(request: LLMChatRequest): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: request.messages.map(m => {
        const msg: Record<string, unknown> = {
          role: m.role,
          content: m.content
        };
        if (m.toolCalls) {
          msg.tool_calls = m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
          }));
        }
        if (m.toolCallId) {
          msg.tool_call_id = m.toolCallId;
        }
        return msg;
      }),
      stream: true
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
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

    // ── 流式解析 SSE ──
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

          // 文本内容
          if (choice.delta?.content) {
            textContent += choice.delta.content;
            request.onChunk?.(choice.delta.content);
          }

          // 工具调用
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallDeltas.has(idx)) {
                toolCallDeltas.set(idx, { id: '', name: '', arguments: '' });
              }
              const delta = toolCallDeltas.get(idx)!;
              if (tc.id) delta.id = tc.id;
              if (tc.function?.name) delta.name = tc.function.name;
              if (tc.function?.arguments) delta.arguments += tc.function.arguments;
            }
          }

          // 结束原因
          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }

          // Usage
          if (event.usage) {
            usage = event.usage;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    // 组装 tool calls
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
    for (const [, tc] of toolCallDeltas) {
      try {
        toolCalls.push({ id: tc.id, name: tc.name, arguments: JSON.parse(tc.arguments || '{}') });
      } catch {
        toolCalls.push({ id: tc.id, name: tc.name, arguments: {} });
      }
    }

    return {
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens
      },
      finishReason: finishReason === 'tool_calls' ? 'tool_calls' : 'stop'
    };
  }
}

// ─── 工厂函数 ──────────────────────────────────────────

export function createLLMClient(config: {
  provider: 'anthropic' | 'openai' | string;
  apiKey: string;
  model: string;
  baseURL?: string;
  maxTokens?: number;
}): LLMClient {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicClient({
        apiKey: config.apiKey,
        model: config.model,
        baseURL: config.baseURL,
        maxTokens: config.maxTokens
      });
    case 'openai':
    default:
      return new OpenAIClient({
        apiKey: config.apiKey,
        model: config.model,
        baseURL: config.baseURL,
        maxTokens: config.maxTokens
      });
  }
}
