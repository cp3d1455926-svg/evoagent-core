/**
 * EvoAgent — MCP Server
 * 
 * 将 EvoAgent 的能力通过 MCP 协议暴露给外部客户端
 * 支持 Claude Desktop、Cursor、VS Code 等
 */

import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/* eslint-disable no-console */
import type { ToolExecutor } from '../../tools/tool-executor.js';

export class EvoMCPServer {
  private server: Server;
  private tools: ToolExecutor;

  constructor(tools: ToolExecutor) {
    this.tools = tools;
    this.server = new Server({
      name: 'evoagent-mcp-server',
      version: '0.1.0'
    }, {
      capabilities: {
        tools: {}
      }
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('🔌 MCP Server started (stdio)');
  }

  async stop(): Promise<void> {
    await this.server.close();
  }
}
