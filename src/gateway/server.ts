/* eslint-disable no-console */
/**
 * EvoAgent — 网关服务器 + Web 仪表台
 * 
 * 提供：
 * 1. HTTP API（RESTful）
 * 2. WebSocket（实时通信）
 * 3. Web 仪表台前端
 * 4. 会话管理
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import type { AgentLoop } from '../core/agent-loop.js';
import type { LLMMessage, ToolDefinition } from '../core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 会话类型 ─────────────────────────────────────────
interface Session {
  id: string;
  userId: string;
  channel: string;
  messages: LLMMessage[];
  createdAt: Date;
  updatedAt: Date;
  lastActivity: number;
}

// ─── 网关上下文（由外部注入） ──────────────────────────
export interface GatewayContext {
  agentLoop: AgentLoop;
  systemPrompt: string;
  tools: ToolDefinition[];
}

// ─── 会话管理器 ───────────────────────────────────────
class SessionManager {
  private sessions = new Map<string, Session>();

  getOrCreate(sessionId: string, userId: string, channel: string): Session {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        userId,
        channel,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActivity: Date.now()
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getAll(): Session[] {
    return Array.from(this.sessions.values()).map(s => ({
      ...s,
      // 不返回完整消息历史，只返回摘要
      messages: []
    }));
  }

  cleanup(maxInactiveMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > maxInactiveMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  get size(): number {
    return this.sessions.size;
  }
}

export async function startGateway(
  ctx: GatewayContext,
  port: number = 3000
): Promise<void> {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const sessions = new SessionManager();

  app.use(express.json());

  // ─── 静态文件（仪表台前端） ──────────────────────────
  // Serve frontend
  const frontendPath = join(__dirname, 'frontend');
  if (existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
  } else {
    // Fallback for dev: serve from src
    const devPath = join(__dirname, '..', 'gateway', 'frontend');
    if (existsSync(devPath)) {
      app.use(express.static(devPath));
    }
  }

  // ─── REST API ────────────────────────────────────────

  // 健康检查
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0', uptime: process.uptime() });
  });

  // 状态总览
  app.get('/api/status', (_req, res) => {
    res.json({
      status: 'running',
      version: '0.1.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      channels: ['cli', 'feishu', 'mcp', 'web'],
      activeSessions: sessions.size
    });
  });

  // 会话列表
  app.get('/api/sessions', (_req, res) => {
    res.json(sessions.getAll());
  });

  // 发送消息 → AgentLoop
  app.post('/api/chat', async (req, res) => {
    const { message, sessionId = 'default', userId = 'anonymous', channel = 'web' } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const session = sessions.getOrCreate(sessionId, userId, channel);

    try {
      // 收集流式输出
      const outputChunks: string[] = [];
      const result = await ctx.agentLoop.run(
        message,
        ctx.tools,
        ctx.systemPrompt,
        (chunk) => outputChunks.push(chunk)
      );

      // 更新会话
      session.messages.push(
        { role: 'user', content: message },
        { role: 'assistant', content: result }
      );
      session.updatedAt = new Date();
      session.lastActivity = Date.now();

      res.json({ reply: result, sessionId, channel, userId });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errorMsg, sessionId });
    }
  });

  // 记忆管理
  app.get('/api/memory', (_req, res) => {
    res.json({ memories: [], note: 'Memory management coming soon' });
  });

  // ─── WebSocket ───────────────────────────────────────
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log('🔌 WebSocket client connected');

    ws.send(JSON.stringify({ type: 'connected', message: 'Welcome to EvoAgent Gateway' }));

    ws.on('message', async (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'chat') {
          const { message, sessionId = 'ws-default', userId = 'anonymous' } = msg;
          if (!message) {
            ws.send(JSON.stringify({ type: 'error', message: 'Message is required' }));
            return;
          }

          const session = sessions.getOrCreate(sessionId, userId, 'web');

          // 流式回复
          const result = await ctx.agentLoop.run(
            message,
            ctx.tools,
            ctx.systemPrompt,
            (chunk) => {
              ws.send(JSON.stringify({ type: 'stream', chunk, sessionId }));
            }
          );

          // 更新会话
          session.messages.push(
            { role: 'user', content: message },
            { role: 'assistant', content: result }
          );
          session.updatedAt = new Date();
          session.lastActivity = Date.now();

          ws.send(JSON.stringify({ type: 'done', reply: result, sessionId }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        ws.send(JSON.stringify({ type: 'error', message: errorMsg }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log('🔌 WebSocket client disconnected');
    });
  });

  // ─── 定期清理过期会话 ────────────────────────────────
  const cleanupInterval = setInterval(() => {
    const cleaned = sessions.cleanup(3600000); // 1小时无活动清理
    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} inactive sessions`);
    }
  }, 600000); // 每10分钟检查

  // 优雅关闭
  const shutdown = () => {
    console.log('\n⏻ Shutting down gateway...');
    clearInterval(cleanupInterval);
    wss.close();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // ─── 启动 ────────────────────────────────────────────
  server.listen(port, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║   🧬 EvoAgent Gateway v0.1.0                  ║
║                                               ║
║   🌐 Web Dashboard: http://localhost:${port}     ║
║   📡 WebSocket:     ws://localhost:${port}       ║
║   🔌 REST API:      http://localhost:${port}/api ║
║                                               ║
╚═══════════════════════════════════════════════╝
    `);
  });
}
