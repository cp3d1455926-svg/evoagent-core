// EvoAgent — 核心导出 v0.4.0

export { AgentLoop } from './core/agent-loop.js';
export { createAgent } from './cli/create-agent.js';
export type { GatewayContext } from './gateway/server.js';
export { FailoverClient } from './core/llm-client.js';
export type { FailoverConfig } from './core/llm-client.js';
export { EvoMCPServer } from './mcp/server/mcp-server.js';
export type { MCPServerConfig } from './mcp/server/mcp-server.js';
export { MemoryImporter } from './importer/index.js';
export type { ImportOptions, ImportResult } from './importer/index.js';
export { ContextCompressor } from './core/context-compressor.js';
export { DefaultPermissionSystem } from './core/permission.js';
export { AnthropicClient, OpenAIClient, createLLMClient } from './core/llm-client.js';
export type { LLMClient } from './core/llm-client.js';

// ─── KV 缓存 ──────────────────────────────────────────
export { KVCache, llmCache, toolCache, memorySearchCache } from './core/kv-cache.js';
export type { CacheEntry, CacheConfig } from './core/kv-cache.js';

export { MemorySystem } from './memory/memory-system.js';
export { WorkingMemory } from './memory/short-term/working-memory.js';

export { ToolExecutor } from './tools/tool-executor.js';
export type { Tool, ToolExecuteResult } from './tools/tool-executor.js';
export { BashTool } from './tools/bash.js';
export { FileTool } from './tools/file.js';
export { CodeTool } from './tools/code.js';
export { WebTool } from './tools/web.js';
export { GitTool } from './tools/git.js';
export { MCPTool } from './tools/mcp-tool.js';
export { DesktopTool } from './tools/desktop.js';

export type { LLMMessage, LLMResponse, ToolDefinition, ToolResult, PermissionLevel } from './core/types.js';

// ─── 遥测 ─────────────────────────────────────────────
export { Logger, createLogger, rootLogger } from './telemetry/logger.js';
export type { LogLevel, LogEntry, LoggerConfig } from './telemetry/logger.js';
export { MetricsCollector, MetricNames } from './telemetry/metrics.js';
