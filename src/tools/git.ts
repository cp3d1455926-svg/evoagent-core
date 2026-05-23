/**
 * EvoAgent — Git 工具
 * Git 操作封装
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { Tool, ToolExecuteResult } from './tool-executor.js';

const execAsync = promisify(exec);

interface GitArgs {
  action: 'status' | 'log' | 'diff' | 'add' | 'commit' | 'push' | 'pull' | 'branch' | 'checkout' | 'clone' | 'init';
  args?: string;
  cwd?: string;
}

export class GitTool implements Tool {
  name = 'git';
  description = 'Git version control operations. Actions: status, log, diff, add, commit, push, pull, branch, checkout, clone, init.';
  permissionLevel = 'write' as const;

  parameters = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['status', 'log', 'diff', 'add', 'commit', 'push', 'pull', 'branch', 'checkout', 'clone', 'init'], description: 'Git operation to perform' },
      args: { type: 'string', description: 'Additional arguments (e.g., commit message, branch name, file paths)' },
      cwd: { type: 'string', description: 'Working directory (default: project root)' }
    },
    required: ['action']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action, args: extraArgs, cwd } = args as unknown as GitArgs;

    try {
      let command = 'git';
      const options = cwd ? { cwd } : {};

      switch (action) {
        case 'status':
          command += ' status --short';
          break;
        case 'log':
          command += ` log --oneline -20 ${extraArgs || ''}`;
          break;
        case 'diff':
          command += ` diff ${extraArgs || ''}`;
          break;
        case 'add':
          command += ` add ${extraArgs || '.'}`;
          break;
        case 'commit':
          if (!extraArgs) return { content: 'Error: commit message required', isError: true };
          command += ` commit -m "${extraArgs.replace(/"/g, '\\"')}"`;
          break;
        case 'push':
          command += ` push ${extraArgs || ''}`;
          break;
        case 'pull':
          command += ` pull ${extraArgs || ''}`;
          break;
        case 'branch':
          command += ` branch ${extraArgs || ''}`;
          break;
        case 'checkout':
          if (!extraArgs) return { content: 'Error: branch name required', isError: true };
          command += ` checkout ${extraArgs}`;
          break;
        case 'clone':
          if (!extraArgs) return { content: 'Error: repository URL required', isError: true };
          command += ` clone ${extraArgs}`;
          break;
        case 'init':
          command += ' init';
          break;
        default:
          return { content: `Error: Unknown git action "${action}"`, isError: true };
      }

      const { stdout, stderr } = await execAsync(command, { ...options, maxBuffer: 10 * 1024 * 1024 });
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      return { content: output || '(no output)', isError: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Git error: ${message}`, isError: true };
    }
  }
}
