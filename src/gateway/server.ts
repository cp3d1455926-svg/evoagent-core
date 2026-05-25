/* eslint-disable no-console */
/**
 * EvoAgent — 网关服务器 + Web 仪表台
 *
 * 提供：
 * 1. HTTP API（RESTful）
 * 2. WebSocket（实时通信）
 * 3. Web 仪表台前端
 * 4. 会话管理
 *
 * v0.2.0 改进：
 * - 版本号与 package.json 同步
 * - WebSocket 认证（token 参数）
 * - 请求速率限制
 * - 结构化日志 + 指标
 * - /api/metrics 端点
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import type { AgentLoop } from '../core/agent-loop.js';
import type { LLMMessage, ToolDefinition } from '../core/types.js';
import { Logger } from '../telemetry/logger.js';
import { MetricsCollector, MetricNames } from '../telemetry/metrics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = '0.2.0';

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
  wsAuthToken?: string;
  rateLimitPerMinute?: number;
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
    return Array.from(this.sessions.values()).map(s => ({ ...s, messages: [] }));
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

// ─── 速率限制器 ───────────────────────────────────────
class RateLimiter {
  private requests = new Map<string, number[]>();
  private maxPerMinute: number;

  constructor(maxPerMinute: number = 60) {
    this.maxPerMinute = maxPerMinute;
  }

  check(clientId: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const windowStart = now - 60000;
    const timestamps = this.requests.get(clientId) || [];
    const recent = timestamps.filter(t => t > windowStart);

    if (recent.length >= this.maxPerMinute) {
      const oldest = recent[0];
      this.requests.set(clientId, recent);
      return { allowed: false, remaining: 0, resetIn: oldest + 60000 - now };
    }

    recent.push(now);
    this.requests.set(clientId, recent);
    return { allowed: true, remaining: this.maxPerMinute - recent.length, resetIn: 60000 };
  }

  cleanup(): void {
    const now = Date.now();
    const windowStart = now - 60000;
    for (const [id, timestamps] of this.requests) {
      const recent = timestamps.filter(t => t > windowStart);
      if (recent.length === 0) {
        this.requests.delete(id);
      } else {
        this.requests.set(id, recent);
      }
    }
  }
}

// ─── WebSocket 客户端 ─────────────────────────────────
interface WSClient {
  ws: WebSocket;
  sessionId: string;
  userId: string;
  authenticated: boolean;
  connectedAt: number;
}

export async function startGateway(
  ctx: GatewayContext,
  port: number = 3000
): Promise<void> {
  const logger = new Logger('gateway');
  const metrics = MetricsCollector.getInstance();
  const sessions = new SessionManager();
  const rateLimiter = new RateLimiter(ctx.rateLimitPerMinute ?? 60);

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const wsClients = new Map<WebSocket, WSClient>();

  app.use(express.json());

  // ─── 速率限制中间件 ─────────────────────────────────
  const rateLimitMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const clientId = req.ip || req.socket.remoteAddress || 'unknown';
    const result = rateLimiter.check(clientId);

    res.set('X-RateLimit-Limit', String(ctx.rateLimitPerMinute ?? 60));
    res.set('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      metrics.incrementCounter(MetricNames.GATEWAY_ERRORS, 1, { type: 'rate_limit' });
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(result.resetIn / 1000)
      });
      return;
    }
    next();
  };

  // ─── 静态文件（仪表台前端） ──────────────────────────
  const frontendPath = join(__dirname, 'frontend');
  if (existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
  } else {
    const devPath = join(__dirname, '..', 'gateway', 'frontend');
    if (existsSync(devPath)) {
      app.use(express.static(devPath));
    }
  }

  // ─── REST API ────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: VERSION, uptime: process.uptime() });
  });

  app.get('/api/status', (_req, res) => {
    res.json({
      status: 'running',
      version: VERSION,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      channels: ['cli', 'feishu', 'mcp', 'web'],
      activeSessions: sessions.size,
      wsConnections: wsClients.size
    });
  });

  app.get('/api/metrics', (_req, res) => {
    res.json(metrics.snapshot());
  });

  app.get('/api/sessions', (_req, res) => {
    res.json(sessions.getAll());
  });

  app.post('/api/chat', rateLimitMiddleware, async (req, res) => {
    const { message, sessionId = 'default', userId = 'anonymous', channel = 'web' } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    metrics.incrementCounter(MetricNames.GATEWAY_REQUESTS, 1, { channel: 'rest' });
    const session = sessions.getOrCreate(sessionId, userId, channel);

    try {
      const outputChunks: string[] = [];
      const result = await ctx.agentLoop.run(
        message,
        ctx.tools,
        ctx.systemPrompt,
        (chunk) => outputChunks.push(chunk)
      );

      session.messages.push(
        { role: 'user', content: message },
        { role: 'assistant', content: result }
      );
      session.updatedAt = new Date();
      session.lastActivity = Date.now();

      res.json({ reply: result, sessionId, channel, userId });
    } catch (err) {
      metrics.incrementCounter(MetricNames.GATEWAY_ERRORS, 1, { type: 'chat' });
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Chat error', { error: errorMsg, sessionId });
      res.status(500).json({ error: errorMsg, sessionId });
    }
  });

  app.get('/api/memory', (_req, res) => {
    res.json({ memories: [], note: 'Memory management coming soon' });
  });

  // ─── WebSocket ───────────────────────────────────────

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const sessionId = url.searchParams.get('sessionId') || 'ws-default';
    const userId = url.searchParams.get('userId') || 'anonymous';

    let authenticated = true;
    if (ctx.wsAuthToken && token !== ctx.wsAuthToken) {
      authenticated = false;
      logger.warn('WebSocket auth failed', { userId, ip: req.socket.remoteAddress });
      ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    const client: WSClient = { ws, sessionId, userId, authenticated, connectedAt: Date.now() };
    wsClients.set(ws, client);
    metrics.setGauge(MetricNames.GATEWAY_WS_CONNECTIONS, wsClients.size);

    logger.info('WebSocket client connected', { userId, sessionId, ip: req.socket.remoteAddress });
    ws.send(JSON.stringify({ type: 'connected', version: VERSION, message: 'Welcome to EvoAgent Gateway' }));

    ws.on('message', async (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'chat') {
          const { message, sessionId: sid = sessionId, userId: uid = userId } = msg;
          if (!message) {
            ws.send(JSON.stringify({ type: 'error', message: 'Message is required' }));
            return;
          }

          metrics.incrementCounter(MetricNames.GATEWAY_REQUESTS, 1, { channel: 'ws' });
          const session = sessions.getOrCreate(sid, uid, 'web');

          const result = await ctx.agentLoop.run(
            message,
            ctx.tools,
            ctx.systemPrompt,
            (chunk) => {
              ws.send(JSON.stringify({ type: 'stream', chunk, sessionId: sid }));
            }
          );

          session.messages.push(
            { role: 'user', content: message },
            { role: 'assistant', content: result }
          );
          session.updatedAt = new Date();
          session.lastActivity = Date.now();

          ws.send(JSON.stringify({ type: 'done', reply: result, sessionId: sid }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        metrics.incrementCounter(MetricNames.GATEWAY_ERRORS, 1, { type: 'ws_message' });
        ws.send(JSON.stringify({ type: 'error', message: errorMsg }));
      }
    });

    ws.on('close', () => {
      wsClients.delete(ws);
      metrics.setGauge(MetricNames.GATEWAY_WS_CONNECTIONS, wsClients.size);
      logger.info('WebSocket client disconnected', { userId, sessionId });
    });
  });

  // ─── 定期清理 ──────────────────────────────────────
  const cleanupInterval = setInterval(() => {
    const cleaned = sessions.cleanup(3600000);
    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} inactive sessions`);
    }
    rateLimiter.cleanup();
    metrics.setGauge(MetricNames.GATEWAY_SESSIONS, sessions.size);
  }, 600000);

  // 优雅关闭
  const shutdown = () => {
    logger.info('Shutting down gateway...');
    clearInterval(cleanupInterval);
    wss.close();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // ─── 启动 ────────────────────────────────────────────
  server.listen(port, () => {
    logger.info(`EvoAgent Gateway v${VERSION} started`, { port });
    console.log(`
╔═══════════════════════════════════════════════╗
║   🧬 EvoAgent Gateway v${VERSION}                  ║
║                                               ║
║   🌐 Web Dashboard: http://localhost:${port}     ║
║   📡 WebSocket:     ws://localhost:${port}       ║
║   🔌 REST API:      http://localhost:${port}/api ║
║                                               ║
╚═══════════════════════════════════════════════╝
    `);
  });
}
