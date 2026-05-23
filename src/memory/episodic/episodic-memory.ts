/* eslint-disable no-console */
/**
 * 事件记忆层 — Episodic Memory
 * 
 * 带时间戳的完整交互日志
 * 支持按时间范围、类型检索
 */

export interface EpisodicEvent {
  id: string;
  type: 'conversation' | 'tool_use' | 'error' | 'milestone';
  content: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export class EpisodicMemory {
  private provider: string;
  private url?: string;
  private events: EpisodicEvent[] = [];

  constructor(provider: string = 'sqlite', url?: string) {
    this.provider = provider;
    this.url = url;
  }

  async initialize(): Promise<void> {
    // TODO: 连接数据库（SQLite / PostgreSQL）
    console.log(`📦 EpisodicMemory: using ${this.provider} mode`);
  }

  /**
   * 记录事件
   */
  async record(event: Omit<EpisodicEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: EpisodicEvent = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date()
    };
    this.events.push(fullEvent);

    // 限制内存中保留的事件数
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500);
    }
  }

  /**
   * 按类型检索事件
   */
  async queryByType(type: EpisodicEvent['type'], limit: number = 20): Promise<EpisodicEvent[]> {
    return this.events
      .filter(e => e.type === type)
      .slice(-limit);
  }

  /**
   * 按时间范围检索
   */
  async queryByTimeRange(start: Date, end: Date): Promise<EpisodicEvent[]> {
    return this.events.filter(e => e.timestamp >= start && e.timestamp <= end);
  }

  /**
   * 获取最近的事件
   */
  async getRecent(limit: number = 10): Promise<EpisodicEvent[]> {
    return this.events.slice(-limit);
  }

  /**
   * 获取事件总数
   */
  getEventCount(): number {
    return this.events.length;
  }

  async close(): Promise<void> {
    // TODO: 持久化到数据库
  }
}
