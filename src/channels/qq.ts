/* eslint-disable no-console */
/**
 * EvoAgent — QQ 渠道适配器 v0.5.0
 *
 * 通过 QQ 开放平台 API 接收和发送消息
 * 支持 WebSocket 长连接模式
 *
 * 依赖: ws（WebSocket 库）
 * API 文档: https://bot.q.qq.com/wiki/develop/api/
 */

import WebSocket from 'ws';
import type { Channel } from './base.js';
import type { ChannelMessage } from '../core/types.js';

export interface QQConfig {
  appId: string;
  appSecret: string;
  /** Bot token (从开放平台获取) */
  token: string;
  /** 沙箱模式 */
  sandbox?: boolean;
}

interface QQGateway {
  url: string;
  shards: number;
}

interface QQPayload {
  op: number;
  d?: any;
  s?: number;
  t?: string;
}

// OpCodes
const OP = {
  DISPATCH: 0,        // 事件分发
  HEARTBEAT: 1,       // 心跳
  IDENTIFY: 2,        // 鉴权
  RESUME: 6,          // 恢复连接
  RECONNECT: 7,       // 重新连接
  INVALID_SESSION: 9, // 无效 session
  HELLO: 10,          // 连接就绪
  HEARTBEAT_ACK: 11,  // 心跳确认
};

const BASE_URL = 'https://api.sgroup.qq.com';
const SANDBOX_URL = 'https://sandbox.api.sgroup.qq.com';

export class QQChannel implements Channel {
  name = 'qq';
  private config: QQConfig;
  private messageHandler: ((msg: ChannelMessage) => void) | null = null;
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string | null = null;
  private seq: number | null = null;
  private ready = false;

  constructor(config: QQConfig) {
    this.config = config;
  }

  async start(onMessage: (msg: ChannelMessage) => void): Promise<void> {
    this.messageHandler = onMessage;
    const baseUrl = this.config.sandbox ? SANDBOX_URL : BASE_URL;

    try {
      // 1. 获取 WebSocket 地址
      const gateway = await this.getGateway(baseUrl);
      console.log(`🐧 QQ WebSocket: ${gateway.url}`);

      // 2. 连接 WebSocket
      await this.connectWebSocket(gateway.url, baseUrl);
      this.ready = true;
      console.log('🐧 QQ channel started');

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ QQ channel failed: ${msg}`);
      throw err;
    }
  }

  private async getGateway(baseUrl: string): Promise<QQGateway> {
    const res = await fetch(`${baseUrl}/v2/gateway`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`QQ gateway API error: ${res.status}`);
    const data = await res.json() as QQGateway;
    return data;
  }

  private authHeaders(): Record<string, string> {
    const { appId, token } = this.config;
    return {
      Authorization: `Bot ${appId}.${token}`,
      'Content-Type': 'application/json',
    };
  }

  private async connectWebSocket(url: string, baseUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        reject(new Error('QQ WebSocket connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        console.log('🐧 WebSocket connected');
      });

      this.ws.on('message', async (raw: Buffer) => {
        let payload: QQPayload;
        try {
          payload = JSON.parse(raw.toString());
        } catch {
          return;
        }

        switch (payload.op) {
          case OP.HELLO: {
            clearTimeout(timeout);
            const heartbeatInterval = (payload.d?.heartbeat_interval ?? 30000);
            this.startHeartbeat(heartbeatInterval);
            this.identify();
            resolve();
            break;
          }

          case OP.DISPATCH: {
            this.seq = payload.s ?? null;
            this.sessionId = payload.d?.guild_id ?? this.sessionId;

            // 处理 C2C 消息
            if (payload.t === 'C2C_MESSAGE_CREATE' || payload.t === 'DIRECT_MESSAGE_CREATE') {
              this.handleQQMessage(payload.d);
            }
            break;
          }

          case OP.HEARTBEAT_ACK: {
            // 心跳确认，无需操作
            break;
          }

          case OP.RECONNECT: {
            console.log('🐧 QQ requesting reconnect, reconnecting...');
            this.reconnect(baseUrl);
            break;
          }

          case OP.INVALID_SESSION: {
            console.log('🐧 QQ invalid session, re-identifying...');
            this.identify();
            break;
          }
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        console.log(`🐧 QQ WebSocket closed: ${code} ${reason?.toString() || ''}`);
        this.cleanup();
        // 自动重连
        setTimeout(() => this.reconnect(baseUrl), 3000);
      });

      this.ws.on('error', (err: Error) => {
        console.error(`🐧 QQ WebSocket error: ${err.message}`);
        if (!this.ready) reject(err);
      });
    });
  }

  private identify(): void {
    if (!this.ws) return;
    const { appId, token } = this.config;

    this.ws.send(JSON.stringify({
      op: OP.IDENTIFY,
      d: {
        token: `Bot ${appId}.${token}`,
        intents: 1 << 10 | 1 << 25, // C2C_MESSAGE (10) + DIRECT_MESSAGE (25)
        shard: [0, 1],
        properties: {
          $os: process.platform,
          $language: 'node',
          $device: 'EvoAgent',
        },
      },
    }));
  }

  private startHeartbeat(intervalMs: number): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          op: OP.HEARTBEAT,
          d: this.seq,
        }));
      }
    }, intervalMs);
  }

  private handleQQMessage(data: any): void {
    try {
      // 只处理文本消息
      if (data.content) {
        const channelMessage: ChannelMessage = {
          channel: 'qq',
          userId: data.author?.user_openid || data.author?.id || 'unknown',
          content: data.content,
          messageId: data.id || '',
          timestamp: new Date(),
          metadata: {
            chatId: data.chat_id || data.guild_id || '',
            chatType: 'p2p',
            messageId: data.id || '',
          },
        };

        if (this.messageHandler) {
          this.messageHandler(channelMessage);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ QQ message handling error: ${msg}`);
    }
  }

  async send(message: ChannelMessage): Promise<void> {
    if (!this.ready) {
      console.error('❌ QQ channel not ready');
      return;
    }

    const baseUrl = this.config.sandbox ? SANDBOX_URL : BASE_URL;
    const openid = message.userId;

    try {
      // 发送 C2C 消息
      const res = await fetch(`${baseUrl}/v2/users/${openid}/messages`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({
          content: message.content,
          msg_type: 0, // 文本
          msg_id: message.messageId || '',
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`❌ QQ send error: ${res.status} ${errText}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ QQ send error: ${msg}`);
    }
  }

  private async reconnect(baseUrl: string): Promise<void> {
    this.cleanup();
    try {
      const gateway = await this.getGateway(baseUrl);
      // 带 session 恢复的连接
      await this.connectWithResume(gateway.url);
    } catch (err) {
      console.error(`❌ QQ reconnect failed: ${err}`);
      setTimeout(() => this.reconnect(baseUrl), 5000);
    }
  }

  private async connectWithResume(url: string): Promise<void> {
    return new Promise((resolve) => {
      this.ws = new WebSocket(url);

      this.ws.on('message', (raw: Buffer) => {
        let payload: QQPayload;
        try {
          payload = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (payload.op === OP.HELLO) {
          const interval = payload.d?.heartbeat_interval ?? 30000;
          this.startHeartbeat(interval);

          if (this.sessionId) {
            // 恢复会话
            this.ws?.send(JSON.stringify({
              op: OP.RESUME,
              d: {
                token: `Bot ${this.config.appId}.${this.config.token}`,
                session_id: this.sessionId,
                seq: this.seq,
              },
            }));
          } else {
            this.identify();
          }
          resolve();
        }

        if (payload.op === OP.DISPATCH) {
          this.seq = payload.s ?? null;
          this.sessionId = payload.d?.guild_id ?? this.sessionId;
          if (payload.t === 'C2C_MESSAGE_CREATE') {
            this.handleQQMessage(payload.d);
          }
        }

        if (payload.op === OP.RECONNECT) {
          this.reconnect('');
        }
      });

      this.ws.on('error', () => {});
    });
  }

  async stop(): Promise<void> {
    this.cleanup();
    this.ready = false;
    console.log('🐧 QQ channel stopped');
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  isReady(): boolean {
    return this.ready;
  }
}
