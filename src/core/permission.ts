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
}

export class DefaultPermissionSystem implements PermissionSystem {
  private config: PermissionConfig;

  constructor(config: Partial<PermissionConfig> = {}) {
    this.config = {
      mode: config.mode ?? 'default',
      allowedTools: config.allowedTools ?? [],
      deniedTools: config.deniedTools ?? [],
      sandboxEnabled: config.sandboxEnabled ?? false
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

      case 'escalate':
        // 高风险工具需要审批
        const highRisk = ['bash', 'delete', 'deploy', 'database'];
        if (highRisk.includes(toolName.toLowerCase())) {
          // TODO: 实现审批流程
          return false;
        }
        return true;

      case 'auto':
        // 基于风险评分（简化版）
        return this.riskScore(toolName) < 0.7;

      case 'default':
      default: {
        // 默认：写入和网络需确认
        const writeTools = ['bash', 'write', 'edit', 'delete', 'deploy'];
        if (writeTools.includes(toolName.toLowerCase())) {
          return this.promptApproval(toolName);
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
   * 请求用户审批（简化版：自动批准，实际应接入渠道交互）
   * 生产环境应通过 WebSocket/消息渠道等待用户回复
   */
  private async promptApproval(toolName: string): Promise<boolean> {
    // TODO: 接入实际审批流程
    // 1. 通过渠道发送审批请求
    // 2. 等待用户回复
    // 3. 返回审批结果
    console.warn(`⚠️  Tool '${toolName}' requires approval in default mode (auto-approved for now)`);
    return true;
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
