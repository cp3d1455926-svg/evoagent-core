/**
 * EvoAgent — 核心类型定义
 */

// ─── LLM 消息类型 ──────────────────────────────────────
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  isError?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ─── 工具定义 ──────────────────────────────────────────
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  permissionLevel: PermissionLevel;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: string[];
  description?: string;
  [key: string]: unknown;
}

export type PermissionLevel = 'read' | 'write' | 'execute' | 'network' | 'admin';

// ─── 工具执行结果 ──────────────────────────────────────
export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
}

// ─── LLM 响应 ──────────────────────────────────────────
export interface LLMResponse {
  content: string | null;
  toolCalls?: ToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

// ─── LLM 聊天请求 ──────────────────────────────────────
export interface LLMChatRequest {
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  thinking?: boolean;
  onChunk?: (chunk: string) => void;
}

// ─── 会话 ──────────────────────────────────────────────
export interface Session {
  id: string;
  channel: string;
  userId: string;
  messages: LLMMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

// ─── 渠道消息 ──────────────────────────────────────────
export interface ChannelMessage {
  channel: string;
  userId: string;
  content: string;
  messageId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ─── 子 Agent 任务 ─────────────────────────────────────
export interface SubAgentTask {
  id: string;
  parentSessionId: string;
  task: string;
  workspace: string;
  tokenBudget: number;
  timeoutSeconds: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}
