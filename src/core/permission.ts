/**
 * EvoAgent — 七模式权限系统
 * 
 * 参考 Claude Code 的权限模式设计
 */

export type PermissionMode =
  | 'default'     // 写入 & 网络需确认，读取自动批准
  | 'plan'        // 只读模式，禁止写入和 Shell
  | 'bypass'      // 全工具自动批准（CI/CD）
  | 'auto'        // 基于风险评分自动决策
  | 'sandbox'     // 所有操作在沙箱执行
  | 'approvelist' // 白名单机制
  | 'escalate';   // 高风险操作升级到人工审批

export interface PermissionSystem {
  check(toolName: string, args: Record<string, unknown>): Promise<boolean>;
  getMode(): PermissionMode;
  setMode(mode: PermissionMode): void;
}

interface PermissionConfig {
  mode: PermissionMode;
  allowedTools: string[];
  deniedTools: string[];
  sandboxEnabled: boolean;
  autoApprove?: boolean;  // default 模式下是否自动批准写入操作
}

export class DefaultPermissionSystem implements PermissionSystem {
  private config: PermissionConfig;

  constructor(config: Partial<PermissionConfig> = {}) {
    this.config = {
      mode: config.mode ?? 'default',
      allowedTools: config.allowedTools ?? [],
      deniedTools: config.deniedTools ?? [],
      sandboxEnabled: config.sandboxEnabled ?? false,
      autoApprove: config.autoApprove ?? false
    };
  }

  async check(toolName: string, _args: Record<string, unknown>): Promise<boolean> {
    const { mode } = this.config;

    switch (mode) {
      case 'bypass':
        return true;

      case 'plan':
        // 只读模式：禁止写入类工具
        return !['bash', 'write', 'edit', 'delete'].includes(toolName.toLowerCase());

      case 'approvelist':
        return this.config.allowedTools.includes(toolName);

      case 'sandbox':
        // 沙箱模式：允许所有，但标记为沙箱执行
        return true;

      case 'escalate': {
        // 高风险工具需要审批 — 自动拒绝并提示
        const highRisk = ['bash', 'delete', 'deploy', 'database'];
        if (highRisk.includes(toolName.toLowerCase())) {
          console.warn(`🔒 Tool '${toolName}' requires manual approval in escalate mode.`);
          console.warn(`   To allow: switch to 'bypass' mode or add to allowlist.`);
          return false;
        }
        // 中风险工具自动批准但记录
        const mediumRisk = ['write', 'edit', 'git', 'file'];
        if (mediumRisk.includes(toolName.toLowerCase())) {
          console.info(`⚠️  Medium-risk tool '${toolName}' auto-approved with logging.`);
        }
        return true;
      }

      case 'auto':
        // 基于风险评分（简化版）
        return this.riskScore(toolName) < 0.7;

      case 'default':
      default: {
        // 默认：写入和网络需确认
        const writeTools = ['bash', 'write', 'edit', 'delete', 'deploy'];
        const networkTools = ['web_fetch', 'web_search', 'http'];
        if (writeTools.includes(toolName.toLowerCase())) {
          return this.promptApproval(toolName);
        }
        // 网络工具在 default 模式下允许（只读），但记录日志
        if (networkTools.includes(toolName.toLowerCase())) {
          return true;
        }
        return true;
      }
    }
  }

  getMode(): PermissionMode {
    return this.config.mode;
  }

  setMode(mode: PermissionMode): void {
    this.config.mode = mode;
  }

  /**
   * 请求用户审批
   *
   * 行为取决于配置：
   * - autoApprove: true → 自动批准（开发/测试用）
   * - autoApprove: false → 拒绝并提示用户切换到 bypass 模式
   *
   * 生产环境应通过 WebSocket/消息渠道等待用户回复
   */
  private async promptApproval(toolName: string): Promise<boolean> {
    if (this.config.autoApprove) {
      console.warn(`⚠️  Tool '${toolName}' auto-approved (autoApprove=true)`);
      return true;
    }
    // 默认拒绝，需要用户显式切换到 bypass 模式
    console.error(`🚫 Tool '${toolName}' blocked in default mode. Use 'bypass' mode to allow.`);
    return false;
  }

  private riskScore(toolName: string): number {
    const scores: Record<string, number> = {
      'read': 0.1,
      'search': 0.1,
      'write': 0.5,
      'edit': 0.5,
      'bash': 0.7,
      'delete': 0.8,
      'deploy': 0.9,
      'database': 0.8
    };
    return scores[toolName.toLowerCase()] ?? 0.5;
  }
}
