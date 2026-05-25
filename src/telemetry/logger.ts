/**
 * EvoAgent — 结构化日志系统
 *
 * 特性：
 * - 日志级别：debug < info < warn < error < fatal
 * - 带时间戳和上下文标签
 * - 支持结构化数据附加
 * - 生产环境可接入 OpenTelemetry
 * - 零外部依赖，纯 Node.js 实现
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info:  'ℹ️ ',
  warn:  '⚠️ ',
  error: '❌',
  fatal: '💀'
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableTimestamp: boolean;
  enableColors: boolean;
  /** 自定义输出目标（默认 console） */
  output?: (entry: LogEntry) => void;
}

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: (process.env.EVOAGENT_LOG_LEVEL as LogLevel) || 'info',
  enableTimestamp: true,
  enableColors: process.stdout.isTTY ?? false
};

export class Logger {
  private config: LoggerConfig;
  private tag: string;
  private static globalConfig: LoggerConfig = { ...DEFAULT_CONFIG };
  private static outputs: Array<(entry: LogEntry) => void> = [];

  constructor(tag: string, config: Partial<LoggerConfig> = {}) {
    this.tag = tag;
    this.config = { ...Logger.globalConfig, ...config };
  }

  /** 设置全局日志配置 */
  static configure(config: Partial<LoggerConfig>): void {
    Logger.globalConfig = { ...Logger.globalConfig, ...config };
  }

  /** 添加全局输出目标（如文件、HTTP endpoint） */
  static addOutput(fn: (entry: LogEntry) => void): void {
    Logger.outputs.push(fn);
  }

  /** 清除所有全局输出目标（主要用于测试） */
  static clearOutputs(): void {
    Logger.outputs = [];
  }

  /** 创建子 Logger（继承 tag 前缀） */
  child(subTag: string): Logger {
    return new Logger(`${this.tag}:${subTag}`, this.config);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  fatal(message: string, data?: Record<string, unknown>): void {
    this.log('fatal', message, data);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.config.minLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      tag: this.tag,
      message,
      data
    };

    // 输出到控制台
    const formatted = this.format(entry);
    switch (level) {
      case 'debug':
      case 'info':
        console.log(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
      case 'fatal':
        console.error(formatted);
        break;
    }

    // 输出到自定义目标
    for (const output of Logger.outputs) {
      try {
        output(entry);
      } catch {
        // 忽略输出错误，避免日志系统本身导致崩溃
      }
    }
  }

  private format(entry: LogEntry): string {
    const parts: string[] = [];

    if (this.config.enableTimestamp) {
      parts.push(`[${entry.timestamp}]`);
    }

    parts.push(`${LEVEL_ICONS[entry.level]} [${entry.tag}]`);
    parts.push(entry.message);

    if (entry.data && Object.keys(entry.data).length > 0) {
      parts.push(JSON.stringify(entry.data));
    }

    return parts.join(' ');
  }
}

// ─── 便捷工厂函数 ────────────────────────────────────

export function createLogger(tag: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger(tag, config);
}

// ─── 全局根 Logger ───────────────────────────────────

export const rootLogger = new Logger('evoagent');
