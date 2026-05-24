/**
 * EvoAgent - Memory Importer
 *
 * Migrate memories from other AI agent systems into EvoAgent's 4-layer memory.
 *
 * Supported sources:
 * - JSON file (generic format)
 * - OpenClaw workspace memory files
 * - mem0 export
 * - SQLite database (generic schema)
 * - CSV file
 *
 * Usage:
 *   import { MemoryImporter } from 'evoagent/importer';
 *
 *   // From JSON
 *   await MemoryImporter.fromJSON('./old-memories.json', memorySystem);
 *
 *   // From OpenClaw
 *   await MemoryImporter.fromOpenClaw('~/.openclaw/workspace', memorySystem);
 *
 *   // From mem0
 *   await MemoryImporter.fromMem0({ apiKey: '...', userId: '...' }, memorySystem);
 *
 *   // From SQLite
 *   await MemoryImporter.fromSQLite('./old-agent.db', memorySystem);
 *
 *   // From CSV
 *   await MemoryImporter.fromCSV('./memories.csv', memorySystem);
 */

import { readFile, readdir, access } from 'fs/promises';
import { constants } from 'fs';
import { join, basename } from 'path';
import type { MemorySystem } from '../memory/memory-system.js';

// ─── Types ───────────────────────────────────────────

export interface ImportOptions {
  batchSize?: number;      // Number of memories to import per batch (default 50)
  skipDuplicates?: boolean; // Skip memories that already exist (default true)
  dryRun?: boolean;         // Preview without writing (default false)
  onProgress?: (current: number, total: number) => void;
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  details: string[];
}

interface RawMemory {
  content: string;
  type?: 'conversation' | 'tool_use' | 'error' | 'milestone' | 'preference' | 'fact' | 'skill';
  timestamp?: string | number;
  metadata?: Record<string, unknown>;
}

// ─── JSON Importer ────────────────────────────────────

async function fromJSON(filePath: string, memory: MemorySystem, options: ImportOptions = {}): Promise<ImportResult> {
  const content = await readFile(filePath, 'utf-8');
  let data: RawMemory[];

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      data = parsed;
    } else if (parsed.memories && Array.isArray(parsed.memories)) {
      data = parsed.memories;
    } else if (parsed.data && Array.isArray(parsed.data)) {
      data = parsed.data;
    } else {
      // Single memory object
      data = [parsed];
    }
  } catch (err) {
    return { total: 0, imported: 0, skipped: 0, errors: 1, details: ['Failed to parse JSON: ' + (err instanceof Error ? err.message : String(err))] };
  }

  return importMemories(data, memory, options);
}

// ─── OpenClaw Importer ────────────────────────────────

async function fromOpenClaw(workspacePath: string, memory: MemorySystem, options: ImportOptions = {}): Promise<ImportResult> {
  const memories: RawMemory[] = [];
  const details: string[] = [];

  try {
    // Read MEMORY.md if exists
    const memoryFile = join(workspacePath, 'MEMORY.md');
    try {
      await access(memoryFile, constants.R_OK);
      const md = await readFile(memoryFile, 'utf-8');
      memories.push({
        content: md,
        type: 'preference',
        metadata: { source: 'openclaw-memory-md' }
      });
      details.push('Imported MEMORY.md');
    } catch { /* not found, skip */ }

    // Read memory/ directory for daily logs
    const memoryDir = join(workspacePath, 'memory');
    try {
      const files = await readdir(memoryDir);
      const dailyLogs = files.filter(f => /^\d{4}-\d{2}-\d{2}\.md$/).sort();

      for (const logFile of dailyLogs) {
        const logPath = join(memoryDir, logFile);
        const logContent = await readFile(logPath, 'utf-8');
        memories.push({
          content: logContent,
          type: 'conversation',
          timestamp: logFile.replace('.md', ''),
          metadata: { source: 'openclaw-daily-log', file: logFile }
        });
      }
      details.push('Imported ' + dailyLogs.length + ' daily logs');
    } catch { /* directory not found, skip */ }

    // Read SOUL.md if exists
    const soulFile = join(workspacePath, 'SOUL.md');
    try {
      await access(soulFile, constants.R_OK);
      const soul = await readFile(soulFile, 'utf-8');
      memories.push({
        content: 'Agent personality and values: ' + soul.slice(0, 500),
        type: 'preference',
        metadata: { source: 'openclaw-soul-md' }
      });
      details.push('Imported SOUL.md');
    } catch { /* not found, skip */ }

    // Read USER.md if exists
    const userFile = join(workspacePath, 'USER.md');
    try {
      await access(userFile, constants.R_OK);
      const user = await readFile(userFile, 'utf-8');
      memories.push({
        content: 'User info: ' + user.slice(0, 500),
        type: 'preference',
        metadata: { source: 'openclaw-user-md' }
      });
      details.push('Imported USER.md');
    } catch { /* not found, skip */ }

  } catch (err) {
    return { total: 0, imported: 0, skipped: 0, errors: 1, details: ['Failed to read OpenClaw workspace: ' + (err instanceof Error ? err.message : String(err))] };
  }

  const result = await importMemories(memories, memory, options);
  result.details = [...details, ...result.details];
  return result;
}

// ─── mem0 Importer ────────────────────────────────────

async function fromMem0(config: { apiKey: string; userId?: string; agentId?: string }, memory: MemorySystem, options: ImportOptions = {}): Promise<ImportResult> {
  const details: string[] = [];

  try {
    const url = 'https://api.mem0.ai/v1/memories/';
    const headers = {
      'Authorization': 'Token ' + config.apiKey,
      'Content-Type': 'application/json'
    };

    const params = new URLSearchParams();
    if (config.userId) params.set('user_id', config.userId);
    if (config.agentId) params.set('agent_id', config.agentId);
    params.set('page_size', '100');

    const response = await fetch(url + '?' + params.toString(), { headers, signal: AbortSignal.timeout(30000) });

    if (!response.ok) {
      throw new Error('mem0 API returned ' + response.status);
    }

    const data = await response.json();
    const items: RawMemory[] = (data.results || data.memories || data || []).map((item: any) => ({
      content: item.memory || item.content || item.text || '',
      type: 'conversation' as const,
      timestamp: item.created_at || item.timestamp,
      metadata: { source: 'mem0', id: item.id, ...item.metadata }
    }));

    details.push('Fetched ' + items.length + ' memories from mem0');
    return importMemories(items, memory, options);
  } catch (err) {
    return { total: 0, imported: 0, skipped: 0, errors: 1, details: ['mem0 import failed: ' + (err instanceof Error ? err.message : String(err))] };
  }
}

// ─── SQLite Importer ──────────────────────────────────

async function fromSQLite(dbPath: string, memory: MemorySystem, options: ImportOptions = {}): Promise<ImportResult> {
  const memories: RawMemory[] = [];
  const details: string[] = [];

  try {
    // Dynamic import for optional dependency
    const loadDB = await (0, eval)('import("better-sqlite3")') as any;
    const Database = loadDB.default || loadDB;
    const db = new Database(dbPath);

    // Try common table names
    const tableNames = ['memories', 'memory', 'messages', 'conversations', 'events'];
    let found = false;

    for (const table of tableNames) {
      try {
        const rows = db.prepare('SELECT * FROM ' + table + ' LIMIT 1000').all();
        if (rows.length > 0) {
          for (const row of rows) {
            const content = row.content || row.memory || row.text || row.message || JSON.stringify(row);
            if (content && typeof content === 'string') {
              memories.push({
                content,
                type: row.type || 'conversation',
                timestamp: row.created_at || row.timestamp || row.date,
                metadata: { source: 'sqlite', table, id: row.id }
              });
            }
          }
          details.push('Imported ' + rows.length + ' rows from table "' + table + '"');
          found = true;
        }
      } catch { /* table doesn't exist, try next */ }
    }

    db.close();

    if (!found) {
      return { total: 0, imported: 0, skipped: 0, errors: 0, details: ['No recognizable memory tables found in ' + dbPath] };
    }
  } catch (err) {
    return { total: 0, imported: 0, skipped: 0, errors: 1, details: ['SQLite import failed: ' + (err instanceof Error ? err.message : String(err))] };
  }

  return importMemories(memories, memory, options);
}

// ─── CSV Importer ─────────────────────────────────────

async function fromCSV(filePath: string, memory: MemorySystem, options: ImportOptions = {}): Promise<ImportResult> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    return { total: 0, imported: 0, skipped: 0, errors: 1, details: ['CSV file is empty or has no data rows'] };
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const contentIdx = headers.findIndex(h => /content|memory|text|message/i.test(h));
  const typeIdx = headers.findIndex(h => /type|category/i.test(h));
  const timeIdx = headers.findIndex(h => /time|date|created/i.test(h));

  if (contentIdx === -1) {
    return { total: 0, imported: 0, skipped: 0, errors: 1, details: ['CSV must have a "content", "memory", "text", or "message" column'] };
  }

  const memories: RawMemory[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols[contentIdx]) {
      memories.push({
        content: cols[contentIdx],
        type: typeIdx >= 0 ? (cols[typeIdx] as RawMemory['type']) || 'conversation' : 'conversation',
        timestamp: timeIdx >= 0 ? cols[timeIdx] : undefined,
        metadata: { source: 'csv', row: i }
      });
    }
  }

  return importMemories(memories, memory, options);
}

// ─── Core Import Logic ────────────────────────────────

async function importMemories(rawMemories: RawMemory[], memory: MemorySystem, options: ImportOptions): Promise<ImportResult> {
  const { batchSize = 50, skipDuplicates = true, dryRun = false, onProgress } = options;

  const result: ImportResult = {
    total: rawMemories.length,
    imported: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  const batches: RawMemory[][] = [];
  for (let i = 0; i < rawMemories.length; i += batchSize) {
    batches.push(rawMemories.slice(i, i + batchSize));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    for (const raw of batch) {
      try {
        if (!raw.content || raw.content.trim().length === 0) {
          result.skipped++;
          continue;
        }

        if (dryRun) {
          result.imported++;
          result.details.push('[DRY] Would import: ' + raw.content.slice(0, 100));
          continue;
        }

        // Route to appropriate memory layer
        const memType = raw.type || 'conversation';

        if (memType === 'skill') {
          // Add as skill
          memory.skill.addSkill({
            name: (raw.metadata?.name as string) || 'Imported Skill',
            description: raw.content.slice(0, 200),
            pattern: (raw.metadata?.pattern as string) || '',
            template: raw.content
          });
        } else if (memType === 'preference' || memType === 'fact') {
          // Store in long-term memory
          await memory.longTerm.store(raw.content);
        } else if (memType === 'conversation' || memType === 'tool_use' || memType === 'error' || memType === 'milestone') {
          // Store as episodic event
          await memory.episodic.record({
            type: memType,
            content: raw.content,
            metadata: raw.metadata || {}
          });
          // Also extract key info for long-term
          if (raw.content.length > 50) {
            await memory.longTerm.store(raw.content.slice(0, 500));
          }
        }

        result.imported++;
      } catch (err) {
        result.errors++;
        result.details.push('Error importing: ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    onProgress?.((batchIdx + 1) * batchSize, rawMemories.length);
  }

  result.details.unshift('Import complete: ' + result.imported + '/' + result.total + ' imported, ' + result.skipped + ' skipped, ' + result.errors + ' errors');
  return result;
}

// ─── Export ───────────────────────────────────────────

export const MemoryImporter = {
  fromJSON,
  fromOpenClaw,
  fromMem0,
  fromSQLite,
  fromCSV,
};
