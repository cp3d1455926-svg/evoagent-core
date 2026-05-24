/**
 * EvoAgent - MCP Tool
 *
 * Call external MCP servers for extended capabilities
 */

import type { Tool, ToolExecuteResult } from './tool-executor.js';

interface MCPArgs {
  server: string;
  tool: string;
  args?: Record<string, unknown>;
}

export class MCPTool implements Tool {
  name = 'mcp';
  description = 'Call tools from external MCP (Model ContextProtocol) servers. Use for extended capabilities like database queries, API calls, etc.';
  permissionLevel = 'execute' as const;

  parameters = {
    type: 'object',
    properties: {
      server: { type: 'string', description: 'MCP server name or URL' },
      tool: { type: 'string', description: 'Tool name to call on the MCP server' },
      args: { type: 'object', description: 'Arguments to pass to the tool' }
    },
    required: ['server', 'tool']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { server, tool, args: toolArgs } = args as unknown as MCPArgs;

    try {
      // TODO: Implement actual MCP client connection
      // For now, return a placeholder indicating the call would be made
      return {
        content: `[MCP] Would call '${tool}' on server '${server}' with args: ${JSON.stringify(toolArgs || {})}`,
        isError: false
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: 'MCP error: ' + message, isError: true };
    }
  }
}
