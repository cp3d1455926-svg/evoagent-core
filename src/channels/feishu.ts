/* eslint-disable no-console */
/**
 * EvoAgent — 飞书渠道适配器 v0.5.0
 *
 * 通过飞书开放平台 API 接收和发送消息
 * 支持 WebSocket 长连接模式（无需公网回调地址）
 *
 * 依赖: @larksuiteoapi/node-sdk
 *
 * 注意：@larksuiteoapi/node-sdk v1.65+
 * WSClient 使用 EventDispatcher 注册事件，而不是 .on() 方法
 */

import type { Channel } from './base.js';
import type { ChannelMessage } from '../core/types.js';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  domain?: string;        // 'feishu' (国内) 或 'lark' (海外)
  dmPolicy?: 'open' | 'pairing' | 'allowlist' | 'disabled';
  groupPolicy?: 'open' | 'allowlist' | 'disabled';
  requireMention?: boolean;
  verificationToken?: string;
  encryptKey?: string;
}

export class FeishuChannel implements Channel {
  name = 'feishu';
  private config: FeishuConfig;
  private messageHandler: ((msg: ChannelMessage) => void) | null = null;
  private client: any = null;
  private wsClient: any = null;
  private ready = false;

  constructor(config: FeishuConfig) {
    this.config = {
      domain: 'feishu',
      dmPolicy: 'pairing',
      groupPolicy: 'open',
      requireMention: true,
      ...config
    };
  }

  /**
   * 启动飞书渠道
   * 使用 WebSocket 长连接模式，无需公网 IP
   */
  async start(onMessage: (msg: ChannelMessage) => void): Promise<void> {
    this.messageHandler = onMessage;

    try {
      const sdk = await import('@larksuiteoapi/node-sdk');

      // 创建 API 客户端（用于发送消息）
      this.client = new sdk.Client({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        appType: sdk.AppType?.SelfBuild ?? 0,
        domain: this.config.domain === 'lark' ? sdk.Domain?.Lark ?? 1 : sdk.Domain?.Feishu ?? 0,
      });

      // 创建事件分发器
      const eventDispatcher = new sdk.EventDispatcher({
        encryptKey: this.config.encryptKey || '',
        verificationToken: this.config.verificationToken || '',
      }).register({
        'im.message.receive_v1': async (data: any) => {
          this.handleMessage(data);
        },
      });

      // 创建 WebSocket 客户端（长连接模式）
      this.wsClient = new sdk.WSClient({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        domain: this.config.domain === 'lark' ? 'lark' : 'feishu',
        loggerLevel: sdk.LoggerLevel?.warn ?? 2,
      });

      // 启动 WebSocket 连接（传入事件分发器）
      await this.wsClient.start({ eventDispatcher });
      this.ready = true;
      console.log('🐦 Feishu channel started (WebSocket mode)');

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Feishu channel failed to start: ${msg}`);
      console.log('💡 Make sure @larksuiteoapi/node-sdk is installed and credentials are correct');
      throw err;
    }
  }

  /**
   * 处理收到的飞书消息
   */
  private handleMessage(data: any): void {
    try {
      const message = data?.message;
      if (!message) return;

      // 只处理文本消息
      if (message.message_type !== 'text') return;

      let content = '';
      try {
        content = JSON.parse(message.content || '{}').text || '';
      } catch {
        content = message.content || '';
      }

      // 去除 @提及
      content = content.replace(/@_all/g, '').replace(/@_user_\d+/g, '').trim();
      if (!content) return;

      // 群聊中检查是否需要 @提及
      if (this.config.requireMention && message.chat_type === 'group') {
        const mentions = message.mentions || [];
        const botMentioned = mentions.some((m: any) => m.is_bot);
        if (!botMentioned) return;
      }

      // DM 策略检查
      if (message.chat_type === 'p2p' && this.config.dmPolicy === 'disabled') {
        return;
      }

      // 群聊策略检查
      if (message.chat_type === 'group' && this.config.groupPolicy === 'disabled') {
        return;
      }

      const channelMessage: ChannelMessage = {
        channel: 'feishu',
        userId: message.sender?.sender_id?.open_id || 'unknown',
        content,
        messageId: message.message_id || '',
        timestamp: new Date(message.create_time ? Number(message.create_time) : Date.now()),
        metadata: {
          chatId: message.chat_id,
          chatType: message.chat_type,
          messageId: message.message_id,
        }
      };

      if (this.messageHandler) {
        this.messageHandler(channelMessage);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Feishu message handling error: ${msg}`);
    }
  }

  /**
   * 发送文本消息到飞书
   */
  async send(message: ChannelMessage): Promise<void> {
    if (!this.client || !this.ready) {
      console.error('❌ Feishu channel not ready');
      return;
    }

    try {
      const receiveId = message.metadata?.chatId as string || message.userId;
      const receiveIdType = message.metadata?.chatType === 'p2p' ? 'open_id' : 'chat_id';

      await this.client.im.messages.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: receiveId,
          content: JSON.stringify({ text: message.content }),
          msg_type: 'text',
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Feishu send error: ${msg}`);
    }
  }

  /**
   * 发送卡片消息
   */
  async sendCard(receiveId: string, cardContent: Record<string, unknown>): Promise<void> {
    if (!this.client || !this.ready) {
      console.error('❌ Feishu channel not ready');
      return;
    }

    try {
      await this.client.im.messages.create({
        params: { receive_id_type: 'open_id' },
        data: {
          receive_id: receiveId,
          content: JSON.stringify(cardContent),
          msg_type: 'interactive',
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Feishu sendCard error: ${msg}`);
    }
  }

  /**
   * 回复消息（带引用）
   */
  async reply(messageId: string, content: string, userId: string): Promise<void> {
    if (!this.client || !this.ready) {
      console.error('❌ Feishu channel not ready');
      return;
    }

    try {
      await this.client.im.messages.reply({
        message_id: messageId,
        data: {
          content: JSON.stringify({ text: content }),
          msg_type: 'text',
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Feishu reply error: ${msg}`);
    }
  }

  /**
   * 停止飞书渠道
   */
  async stop(): Promise<void> {
    try {
      if (this.wsClient) {
        this.wsClient = null;
      }
      this.client = null;
      this.ready = false;
      console.log('🐦 Feishu channel stopped');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Feishu stop error: ${msg}`);
    }
  }

  /**
   * 检查渠道是否就绪
   */
  isReady(): boolean {
    return this.ready;
  }
}
