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
      }))
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

    const data = await response.json() as {
      content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string }>;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const toolCalls = data.content
      .filter(c => c.type === 'tool_use')
      .map(c => ({
        id: c.id || '',
        name: c.name || '',
        arguments: c.input || {}
      }));

    const textContent = data.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    return {
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens
      },
      finishReason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop'
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
      })
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

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    const toolCalls = choice.message.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments)
    }));

    return {
      content: choice.message.content,
      toolCalls,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens
      },
      finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop'
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
