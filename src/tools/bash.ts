/**
 * EvoAgent — Bash 工具
 * 
 * 执行 Shell 命令，支持超时和输出截断
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { Tool, ToolExecuteResult } from './tool-executor.js';

const execAsync = promisify(exec);

export interface BashArgs {
  command: string;
  timeout?: number;
  cwd?: string;
  description?: string;
}

export class BashTool implements Tool {
  name = 'bash';
  description = 'Execute a shell command. Use for file operations, running scripts, installing packages, etc.';
  permissionLevel = 'execute' as const;

  parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
      cwd: { type: 'string', description: 'Working directory (default: project root)' },
      description: { type: 'string', description: 'Human-readable description of what this command does' }
    },
    required: ['command']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { command, timeout = 30000, cwd } = args as unknown as BashArgs;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        cwd,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      return {
        content: output || '(no output)',
        isError: false
      };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; killed?: boolean; message?: string };
      if (error.killed) {
        return { content: `Command timed out after ${timeout}ms`, isError: true };
      }
      const output = [error.stdout?.trim(), error.stderr?.trim()].filter(Boolean).join('\n');
      return {
        content: output || error.message || 'Command failed',
        isError: true
      };
    }
  }
}
