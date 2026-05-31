/**
 * EvoAgent — Desktop 工具
 *
 * 操控用户电脑：打开应用/文件/URL、截图、剪贴板、系统信息
 * v0.4.0: 新增桌面控制能力
 *
 * 安全说明：
 * - 所有操作需要用户确认（permission system 控制）
 * - 危险操作（删除、格式化等）默认拒绝
 * - 支持 Windows / macOS / Linux
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { Tool, ToolExecuteResult } from './tool-executor.js';

const execAsync = promisify(exec);

type DesktopAction =
  | 'open'          // 打开应用/文件/URL
  | 'screenshot'    // 截屏
  | 'clipboard_read'   // 读取剪贴板
  | 'clipboard_write'  // 写入剪贴板
  | 'system_info'   // 系统信息
  | 'notify'        // 系统通知
  | 'window_list'   // 列出窗口（仅部分平台）
  | 'run_background'; // 后台运行进程

interface DesktopArgs {
  action: DesktopAction;
  target?: string;      // 应用名/文件路径/URL
  text?: string;        // 剪贴板内容/通知文本
  timeout?: number;     // 超时
}

export class DesktopTool implements Tool {
  name = 'desktop';
  description = 'Control the user desktop: open apps/files/URLs, take screenshots, read/write clipboard, system info, notifications, background processes. Actions: open, screenshot, clipboard_read, clipboard_write, system_info, notify, window_list, run_background.';
  permissionLevel = 'execute' as const;

  parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['open', 'screenshot', 'clipboard_read', 'clipboard_write', 'system_info', 'notify', 'window_list', 'run_background'],
        description: 'Desktop operation'
      },
      target: { type: 'string', description: 'App name, file path, URL, or command' },
      text: { type: 'string', description: 'Text for clipboard_write or notify' },
      timeout: { type: 'number', description: 'Timeout in ms (default 30000)' }
    },
    required: ['action']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action, target, text, timeout = 30000 } = args as unknown as DesktopArgs;
    const platform = process.platform;

    try {
      switch (action) {
        case 'open': {
          if (!target) return { content: 'Error: target is required', isError: true };
          return await this.open(target, platform);
        }
        case 'screenshot': {
          return await this.screenshot(platform);
        }
        case 'clipboard_read': {
          return await this.clipboardRead(platform);
        }
        case 'clipboard_write': {
          if (!text) return { content: 'Error: text is required', isError: true };
          return await this.clipboardWrite(text, platform);
        }
        case 'system_info': {
          return this.systemInfo(platform);
        }
        case 'notify': {
          if (!text) return { content: 'Error: text is required', isError: true };
          return await this.notify(text, platform);
        }
        case 'window_list': {
          return await this.windowList(platform);
        }
        case 'run_background': {
          if (!target) return { content: 'Error: target (command) is required', isError: true };
          return await this.runBackground(target);
        }
        default:
          return { content: `Unknown action: ${action}`, isError: true };
      }
    } catch (err) {
      return { content: `Desktop error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }

  // ─── 打开应用/文件/URL ───────────────────────────────

  private async open(target: string, platform: string): Promise<ToolExecuteResult> {
    let cmd: string;
    switch (platform) {
      case 'win32':
        cmd = `start "" "${target.replace(/"/g, '\\"')}"`;
        break;
      case 'darwin':
        cmd = `open "${target.replace(/"/g, '\\"')}"`;
        break;
      default:
        cmd = `xdg-open "${target.replace(/"/g, '\\"')}"`;
    }

    await execAsync(cmd, { timeout: 10000 });
    return { content: `✅ Opened: ${target}`, isError: false };
  }

  // ─── 截屏 ────────────────────────────────────────────

  private async screenshot(platform: string): Promise<ToolExecuteResult> {
    const tmpDir = join(process.env.TEMP || process.env.TMP || '/tmp', 'evoagent');
    await mkdir(tmpDir, { recursive: true });
    const filePath = join(tmpDir, `screenshot-${Date.now()}.png`);

    let screenshotSuccess = false;
    let lastError = '';

    // 尝试平台原生截图
    try {
      switch (platform) {
        case 'win32': {
          // 方法 1: PowerShell + .NET（最可靠）
          const psCmd = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $b = [System.Windows.Forms.Screen]::PrimaryScreen; $bounds = $b.Bounds; $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); $bitmap.Save('${filePath.replace(/\\/g, '\\')}'); $graphics.Dispose(); $bitmap.Dispose()`;
          await execAsync(`powershell -NoProfile -Command "${psCmd}"`, { timeout: 15000 });
          if (require('fs').existsSync(filePath)) { screenshotSuccess = true; }
          break;
        }
        case 'darwin': {
          await execAsync(`screencapture -x "${filePath}"`, { timeout: 10000 });
          if (require('fs').existsSync(filePath)) { screenshotSuccess = true; }
          break;
        }
        default: {
          await execAsync(`gnome-screenshot -f "${filePath}" 2>/dev/null || scrot "${filePath}" 2>/dev/null || import -window root "${filePath}"`, { timeout: 10000 });
          if (require('fs').existsSync(filePath)) { screenshotSuccess = true; }
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (screenshotSuccess) {
      return { content: `📸 Screenshot saved: ${filePath}`, isError: false };
    }

    // 降级：返回系统信息代替截图
    return {
      content: `⚠️ Screenshot failed (${lastError}). Screenshot requires GUI environment.\n\n${this.systemInfo(platform).content}`,
      isError: false
    };
  }

  // ─── 剪贴板 ──────────────────────────────────────────

  private async clipboardRead(platform: string): Promise<ToolExecuteResult> {
    let cmd: string;
    switch (platform) {
      case 'win32': cmd = 'powershell -Command "Get-Clipboard"'; break;
      case 'darwin': cmd = 'pbpaste'; break;
      default: cmd = 'xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output'; break;
    }

    const { stdout } = await execAsync(cmd, { timeout: 5000 });
    return { content: stdout || '(clipboard empty)', isError: false };
  }

  private async clipboardWrite(text: string, platform: string): Promise<ToolExecuteResult> {
    let cmd: string;
    switch (platform) {
      case 'win32':
        // 使用 PowerShell 避免编码问题
        await execAsync(`powershell -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`, { timeout: 5000 });
        return { content: `✅ Written to clipboard (${text.length} chars)`, isError: false };
      case 'darwin':
        cmd = `echo '${text.replace(/'/g, "\\'")}' | pbcopy`;
        break;
      default:
        cmd = `echo '${text.replace(/'/g, "\\'")}' | xclip -selection clipboard`;
    }

    await execAsync(cmd, { timeout: 5000 });
    return { content: `✅ Written to clipboard (${text.length} chars)`, isError: false };
  }

  // ─── 系统信息 ────────────────────────────────────────

  private systemInfo(platform: string): ToolExecuteResult {
    const info: string[] = [
      `[System Info]`,
      `Platform: ${platform} (${process.arch})`,
      `Node: ${process.version}`,
      `CPUs: ${require('os').cpus().length} cores`,
      `Memory: ${Math.round(require('os').totalmem() / 1024 / 1024 / 1024)}GB total, ${Math.round(require('os').freemem() / 1024 / 1024 / 1024)}GB free`,
      `Uptime: ${Math.round(require('os').uptime() / 3600)}h`,
      `User: ${process.env.USERNAME || process.env.USER || 'unknown}'}`,
      `Home: ${process.env.USERPROFILE || process.env.HOME || 'unknown}'}`,
      `CWD: ${process.cwd()}`,
    ];

    // Windows 额外信息
    if (platform === 'win32') {
      try {
        const hostname = execSync('hostname', { encoding: 'utf-8' }).toString().trim();
        info.push(`Hostname: ${hostname}`);
      } catch { /* skip */ }
    }

    return { content: info.join('\n'), isError: false };
  }

  // ─── 系统通知 ────────────────────────────────────────

  private async notify(text: string, platform: string): Promise<ToolExecuteResult> {
    switch (platform) {
      case 'win32': {
        const psCmd = `
Add-Type -AssemblyName System.Windows.Forms
$balloon = New-Object System.Windows.Forms.NotifyIcon
$balloon.Icon = [System.Drawing.SystemIcons]::Information
$balloon.BalloonTipTitle = 'EvoAgent'
$balloon.BalloonTipText = '${text.replace(/'/g, "''")}'
$balloon.Visible = $true
$balloon.ShowBalloonTip(3000)
Start-Sleep -Seconds 4
$balloon.Dispose()
`;
        await execAsync(`powershell -Command "${psCmd.replace(/\n/g, ' ')}"`, { timeout: 10000 });
        break;
      }
      case 'darwin': {
        await execAsync(`osascript -e 'display notification "${text.replace(/"/g, '\\"')}" with title "EvoAgent"'`, { timeout: 5000 });
        break;
      }
      default: {
        await execAsync(`notify-send "EvoAgent" "${text.replace(/"/g, '\\"')}"`, { timeout: 5000 });
      }
    }

    return { content: `🔔 Notification sent: ${text.slice(0, 50)}...`, isError: false };
  }

  // ─── 窗口列表 ────────────────────────────────────────

  private async windowList(platform: string): Promise<ToolExecuteResult> {
    switch (platform) {
      case 'win32': {
        const psCmd = `
Get-Process | Where-Object {$_.MainWindowTitle -ne ''} |
  Select-Object ProcessName, MainWindowTitle, Id |
  Format-Table -AutoSize -Wrap
`;
        const { stdout } = await execAsync(`powershell -Command "${psCmd.replace(/\n/g, ' ')}"`, { timeout: 10000 });
        return { content: `[Window List]\n${stdout}`, isError: false };
      }
      case 'darwin': {
        const { stdout } = await execAsync(`osascript -e 'tell application "System Events" to get name of every process whose visible is true'`, { timeout: 5000 });
        return { content: `[Visible Apps]\n${stdout.split(', ').join('\n')}`, isError: false };
      }
      default: {
        const { stdout } = await execAsync(`wmctrl -l 2>/dev/null || xdotool search --onlyvisible --name "" getwindowname 2>/dev/null`, { timeout: 5000 });
        return { content: `[Window List]\n${stdout || 'No window manager detected'}`, isError: false };
      }
    }
  }

  // ─── 后台进程 ────────────────────────────────────────

  private async runBackground(command: string): Promise<ToolExecuteResult> {
    // 使用 detached 模式在后台运行
    const subprocess = exec(command, { windowsHide: true });

    // 不等待完成，立即返回
    subprocess.unref();

    return {
      content: `▶️ Background process started (PID: ${subprocess.pid})\nCommand: ${command.slice(0, 100)}`,
      isError: false
    };
  }
}
