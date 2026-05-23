/**
 * EvoAgent — 工具执行器
 * 
 * 统一工具调用入口，分发到具体工具实现
 */

import type { PermissionLevel } from '../core/types.js';
import { BashTool } from './bash.js';
import { FileTool } from './file.js';
import { CodeTool } from './code.js';
import { WebTool } from './web.js';
import { MCPTool } from './mcp-tool.js';
import { GitTool } from './git.js';

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permissionLevel: PermissionLevel;
  execute(args: Record<string, unknown>): Promise<ToolExecuteResult>;
}

export interface ToolExecuteResult {
  content: string;
  isError: boolean;
}

export class ToolExecutor {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    // 注册内置工具
    this.register(new BashTool());
    this.register(new FileTool());
    this.register(new CodeTool());
    this.register(new WebTool());
    this.register(new MCPTool());
    this.register(new GitTool());
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitions() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      permissionLevel: t.permissionLevel
    }));
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { content: `Tool '${name}' not found`, isError: true };
    }
    try {
      return await tool.execute(args);
    } catch (err) {
      return {
        content: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true
      };
    }
  }
}
