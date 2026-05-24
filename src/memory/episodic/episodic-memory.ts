/* eslint-disable no-console */
/**
 * 事件记忆层 - Episodic Memory
 *
 * 带时间戳的完整交互日志
 * 支持内存模式和 SQLite 持久化
 */

import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  private db: any = null;
  private initialized = false;

  constructor(provider: string = 'sqlite', url?: string) {
    this.provider = provider;
    this.url = url || this.getDefaultDbPath();
  }

  private async loadSQLite(): Promise<any> {
    // Use eval to avoid TypeScript static analysis of optional dependency
    const Database = await (0, eval)('import("better-sqlite3")') as any;
    return Database.default || Database;
  }

  private getDefaultDbPath(): string {
    const home = process.env.USERPROFILE || process.env.HOME || '.';
    return home + '/.evoagent/episodic.db';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.provider === 'sqlite') {
      await this.initSQLite();
    } else {
      console.log('EpisodicMemory: using memory mode (no persistence)');
    }
    this.initialized = true;
  }

  private async initSQLite(): Promise<void> {
    try {
      // Ensure directory exists
      const dbDir = dirname(this.url!);
      await mkdir(dbDir, { recursive: true });

      // Dynamic import for better-sqlite3 (optional dependency)
      const Database = await this.loadSQLite();
      this.db = new Database(this.url!);

      // Create table if not exists
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      `);

      // Load recent events into memory
      const rows = this.db.prepare(
        'SELECT * FROM events ORDER BY timestamp DESC LIMIT 100'
      ).all();

      this.events = rows.reverse().map((row: any) => ({
        id: row.id,
        type: row.type,
        content: row.content,
        metadata: JSON.parse(row.metadata || '{}'),
        timestamp: new Date(row.timestamp)
      }));

      console.log('EpisodicMemory: SQLite loaded (' + this.events.length + ' events)');
    } catch (err) {
      console.warn('EpisodicMemory: SQLite unavailable, falling back to memory mode');
      console.warn('  Install better-sqlite3 for persistence: npm i better-sqlite3');
      this.provider = 'memory';
    }
  }

  async record(event: Omit<EpisodicEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: EpisodicEvent = {
      ...event,
      id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date()
    };

    this.events.push(fullEvent);

    // Persist to SQLite
    if (this.db) {
      try {
        this.db.prepare(
          'INSERT INTO events (id, type, content, metadata, timestamp) VALUES (?, ?, ?, ?, ?)'
        ).run(
          fullEvent.id,
          fullEvent.type,
          fullEvent.content,
          JSON.stringify(fullEvent.metadata),
          fullEvent.timestamp.getTime()
        );
      } catch (err) {
        console.error('EpisodicMemory: failed to persist event:', err);
      }
    }

    // Limit memory cache
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500);
    }
  }

  async queryByType(type: EpisodicEvent['type'], limit: number = 20): Promise<EpisodicEvent[]> {
    if (this.db) {
      try {
        const rows = this.db.prepare(
          'SELECT * FROM events WHERE type = ? ORDER BY timestamp DESC LIMIT ?'
        ).all(type, limit);
        return rows.map((row: any) => ({
          id: row.id,
          type: row.type,
          content: row.content,
          metadata: JSON.parse(row.metadata || '{}'),
          timestamp: new Date(row.timestamp)
        }));
      } catch (err) {
        console.error('EpisodicMemory: query failed, using cache');
      }
    }
    return this.events.filter(e => e.type === type).slice(-limit);
  }

  async queryByTimeRange(start: Date, end: Date): Promise<EpisodicEvent[]> {
    if (this.db) {
      try {
        const rows = this.db.prepare(
          'SELECT * FROM events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp'
        ).all(start.getTime(), end.getTime());
        return rows.map((row: any) => ({
          id: row.id,
          type: row.type,
          content: row.content,
          metadata: JSON.parse(row.metadata || '{}'),
          timestamp: new Date(row.timestamp)
        }));
      } catch (err) {
        console.error('EpisodicMemory: query failed, using cache');
      }
    }
    return this.events.filter(e => e.timestamp >= start && e.timestamp <= end);
  }

  async getRecent(limit: number = 10): Promise<EpisodicEvent[]> {
    if (this.db) {
      try {
        const rows = this.db.prepare(
          'SELECT * FROM events ORDER BY timestamp DESC LIMIT ?'
        ).all(limit);
        return rows.reverse().map((row: any) => ({
          id: row.id,
          type: row.type,
          content: row.content,
          metadata: JSON.parse(row.metadata || '{}'),
          timestamp: new Date(row.timestamp)
        }));
      } catch (err) {
        console.error('EpisodicMemory: query failed, using cache');
      }
    }
    return this.events.slice(-limit);
  }

  getEventCount(): number {
    if (this.db) {
      try {
        const row = this.db.prepare('SELECT COUNT(*) as cnt FROM events').get();
        return row?.cnt || 0;
      } catch {
        return this.events.length;
      }
    }
    return this.events.length;
  }

  async close(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
      } catch { /* ignore */ }
    }
  }
}
