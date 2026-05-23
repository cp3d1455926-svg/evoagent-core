/* eslint-disable no-console */
/**
 * EvoAgent — 网关服务器 + Web 仪表台
 * 
 * 提供：
 * 1. HTTP API（RESTful）
 * 2. WebSocket（实时通信）
 * 3. Web 仪表台前端
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function startGateway(port: number = 3000): Promise<void> {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());

  // ─── 静态文件（仪表台前端） ──────────────────────────
  app.use(express.static(join(__dirname, 'frontend')));

  // ─── REST API ────────────────────────────────────────
  
  // 健康检查
  app.get('/api/health', (_req: import('express').Request, res: import('express').Response) => {
    res.json({ status: 'ok', version: '0.1.0', uptime: process.uptime() });
  });

  // 状态总览
  app.get('/api/status', (_req: import('express').Request, res: import('express').Response) => {
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
  app.get('/api/sessions', (_req: import('express').Request, res: import('express').Response) => {
    res.json(Array.from(sessions.values()));
  });

  // 发送消息（通用接口）
  app.post('/api/chat', async (req: import('express').Request, res: import('express').Response) => {
    const { message, channel = 'web', userId = 'anonymous' } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    // TODO: 接入 Agent Loop
    res.json({ reply: `Echo: ${message}`, channel, userId });
  });

  // 记忆管理
  app.get('/api/memory', async (_req: import('express').Request, res: import('express').Response) => {
    res.json({ memories: [] }); // TODO: 接入记忆系统
  });

  // ─── WebSocket ───────────────────────────────────────
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log('🔌 WebSocket client connected');

    ws.send(JSON.stringify({ type: 'connected', message: 'Welcome to EvoAgent Gateway' }));

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const msg = JSON.parse(data.toString());
        // TODO: 处理 WebSocket 消息，接入 Agent Loop
        ws.send(JSON.stringify({ type: 'echo', data: msg }));
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log('🔌 WebSocket client disconnected');
    });
  });

  // 广播消息到所有 WebSocket 客户端
  function broadcast(msg: Record<string, unknown>): void {
    const data = JSON.stringify(msg);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // ─── 会话存储（简化版，实际应使用数据库） ────────────
  const sessions = new Map<string, { id: string; messages: unknown[]; createdAt: Date }>();

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
