// EvoAgent — 核心导出

export { AgentLoop } from './core/agent-loop.js';
export { ContextCompressor } from './core/context-compressor.js';
export { DefaultPermissionSystem } from './core/permission.js';
export { AnthropicClient, OpenAIClient, createLLMClient } from './core/llm-client.js';
export type { LLMClient } from './core/llm-client.js';

export { MemorySystem } from './memory/memory-system.js';
export { WorkingMemory } from './memory/short-term/working-memory.js';

export { ToolExecutor } from './tools/tool-executor.js';
export { BashTool } from './tools/bash.js';
export { FileTool } from './tools/file.js';
export { CodeTool } from './tools/code.js';
export { WebTool } from './tools/web.js';
export { GitTool } from './tools/git.js';
export { MCPTool } from './tools/mcp-tool.js';

export type { LLMMessage, LLMResponse, ToolDefinition, ToolResult, PermissionLevel } from './core/types.js';
