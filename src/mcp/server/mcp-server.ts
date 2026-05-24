/**
 * EvoAgent - MCP Server
 *
 * Exposes EvoAgent capabilities via MCP protocol
 * Compatible with Claude Desktop, Cursor, VS Code, etc.
 */

import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ToolExecutor } from '../../tools/tool-executor.js';
import type { LLMClient } from '../../core/llm-client.js';

/* eslint-disable no-console */

export interface MCPServerConfig {
  tools: ToolExecutor;
  llm: LLMClient;
  systemPrompt?: string;
}

export class EvoMCPServer {
  private server: Server;
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    this.config = config;
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
    this.registerHandlers();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('MCP Server started (stdio)');
  }

  async stop(): Promise<void> {
    await this.server.close();
  }

  private registerHandlers(): void {
    const toolDefs = this.config.tools.getToolDefinitions();

    // List available tools
    this.server.setRequestHandler('tools/list' as any, async () => ({
      tools: toolDefs.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters as any
      }))
    }));

    // Execute tool calls
    this.server.setRequestHandler('tools/call' as any, async (request: any) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await this.config.tools.execute(name, args || {});
        return {
          content: [{ type: 'text' as const, text: result.content }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: 'Error: ' + msg }],
          isError: true
        };
      }
    });

    console.log('MCP: registered ' + toolDefs.length + ' tools');
  }
}
