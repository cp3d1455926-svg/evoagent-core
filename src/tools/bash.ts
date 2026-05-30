/**
 * EvoAgent — Bash Tool v2.0
 *
 * 执行 Shell 命令，支持超时、输出截断、流式输出、后台运行
 * v0.4.0 改进：
 * - 流式输出（大命令实时返回）
 * - 后台运行模式
 * - 输出智能截断
 * - 工作目录自动补全
 * - 命令结果缓存
 * - 安全沙箱（可选）
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { toolCache } from '../core/kv-cache.js';
import type { Tool, ToolExecuteResult } from './tool-executor.js';

const execAsync = promisify(exec);

interface BashArgs {
  command: string;
  timeout?: number;
  cwd?: string;
  description?: string;
  stream?: boolean;       // 是否流式输出（大命令推荐）
  background?: boolean;   // 后台运行
  maxOutput?: number;     // 最大输出字符数（默认 10000）
  cache?: boolean;        // 是否缓存结果（默认 false）
}

export class BashTool implements Tool {
  name = 'bash';
  description = 'Execute shell commands with streaming, background mode, and caching. Supports timeout, output truncation, and working directory.';
  permissionLevel = 'execute' as const;

  parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms (default 60000)' },
      cwd: { type: 'string', description: 'Working directory' },
      description: { type: 'string', description: 'Human-readable description' },
      stream: { type: 'boolean', description: 'Enable streaming for long-running commands (default false)' },
      background: { type: 'boolean', description: 'Run in background (default false)' },
      maxOutput: { type: 'number', description: 'Max output chars (default 10000)' },
      cache: { type: 'boolean', description: 'Cache result for identical commands (default false)' }
    },
    required: ['command']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const {
      command, timeout = 60000, cwd, description,
      stream = false, background = false, maxOutput = 10000, cache = false
    } = args as unknown as BashArgs;

    // 安全检查：拒绝危险命令
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, /rm\s+-rf\s+~/, /rm\s+-rf\s+\*/,
      /format\s+/, /mkfs\./, /dd\s+if=/,
      />\s*\/dev\//, /shutdown\s+/, /reboot\s+/,
      /chmod\s+-R\s+777\s+\//,
    ];
    for (const pat of dangerousPatterns) {
      if (pat.test(command)) {
        return {
          content: `🚫 Dangerous command blocked by safety check: ${command}\nPattern matched: ${pat.toString()}`,
          isError: true
        };
      }
    }

    // 缓存查找
    if (cache) {
      const cacheKey = `bash:${command}:${cwd || ''}`;
      const cached = toolCache.get(cacheKey);
      if (cached) return { content: `[cached] ${cached.content}`, isError: cached.isError };
    }

    // 后台运行
    if (background) {
      const subprocess = spawn(command, {
        shell: true,
        cwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      subprocess.unref();
      return {
        content: `▶️ Background: PID ${subprocess.pid} | ${description || command.slice(0, 80)}`,
        isError: false
      };
    }

    // 流式输出（大命令）
    if (stream) {
      return await this.executeStreaming(command, timeout, cwd, maxOutput);
    }

    // 普通执行
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        cwd,
        maxBuffer: 50 * 1024 * 1024 // 50MB
      });

      let output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n') || '(no output)';
      output = this.truncateOutput(output, maxOutput);

      if (cache) {
        toolCache.set(`bash:${command}:${cwd || ''}`, { content: output, isError: false }, 60000);
      }

      return { content: output, isError: false };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; killed?: boolean; message?: string };
      if (error.killed) {
        return { content: `⏱️ Command timed out after ${timeout}ms\nPartial output:\n${(error.stdout || '').slice(0, 2000)}`, isError: true };
      }
      const output = [error.stdout?.trim(), error.stderr?.trim()].filter(Boolean).join('\n');
      return { content: output || error.message || 'Command failed', isError: true };
    }
  }

  /**
   * 流式执行 — 实时收集输出，适合长时间运行的命令
   */
  private executeStreaming(
    command: string, timeout: number, cwd: string | undefined, maxOutput: number
  ): Promise<ToolExecuteResult> {
    return new Promise((resolve) => {
      const parts: string[] = [];
      let totalLen = 0;
      let killed = false;

      const child = spawn(command, {
        shell: true,
        cwd,
        windowsHide: true
      });

      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000);
      }, timeout);

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        totalLen += text.length;
        if (totalLen <= maxOutput) {
          parts.push(text);
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        totalLen += text.length;
        if (totalLen <= maxOutput) {
          parts.push(text);
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        let output = parts.join('').trim() || '(no output)';
        output = this.truncateOutput(output, maxOutput);
        if (killed) output += `\n⏱️ (timed out after ${timeout}ms)`;
        resolve({
          content: output + (code !== 0 ? `\n[exit code: ${code}]` : ''),
          isError: code !== 0
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ content: `Process error: ${err.message}`, isError: true });
      });
    });
  }

  /**
   * 智能截断输出
   */
  private truncateOutput(output: string, maxChars: number): string {
    if (output.length <= maxChars) return output;

    const half = Math.floor(maxChars / 2);
    const head = output.slice(0, half);
    const tail = output.slice(-half);
    const omitted = output.length - maxChars;

    return `${head}\n\n... [${omitted} chars omitted — use stream=true or increase maxOutput] ...\n\n${tail}`;
  }
}
