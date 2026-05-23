/**
 * EvoAgent — MCP 工具
 * 
 * 调用外部 MCP Server 的工具
 */

import type { Tool, ToolExecuteResult } from './tool-executor.js';

interface MCPArgs {
  server: string;
  tool: string;
  args: Record<string, unknown>;
}

export class MCPTool implements Tool {
  name = 'mcp';
  description = 'Call a tool on an external MCP server. Specify server name, tool name, and arguments.';
  permissionLevel = 'execute' as const;

  parameters = {
    type: 'object',
    properties: {
      server: { type: 'string', description: 'MCP server name (configured in evoagent config)' },
      tool: { type: 'string', description: 'Tool name to call on the MCP server' },
      args: { type: 'object', description: 'Arguments to pass to the MCP tool' }
    },
    required: ['server', 'tool']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { server, tool, args: toolArgs = {} } = args as unknown as MCPArgs;

    // TODO: 实现 MCP 客户端调用
    // 当前返回占位信息，实际应通过 MCP 协议调用
    return {
      content: `[MCP] Would call tool "${tool}" on server "${server}" with args: ${JSON.stringify(toolArgs)}`,
      isError: false
    };
  }
}
