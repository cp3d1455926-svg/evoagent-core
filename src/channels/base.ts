/**
 * EvoAgent — 渠道基类
 * 
 * 所有渠道适配器需要实现的接口
 */

import type { ChannelMessage } from '../core/types.js';

export interface Channel {
  /** 渠道名称 */
  name: string;

  /**
   * 启动渠道
   * @param onMessage 收到消息时的回调
   */
  start(onMessage: (msg: ChannelMessage) => void): Promise<void>;

  /**
   * 发送消息
   */
  send(message: ChannelMessage): Promise<void>;

  /**
   * 停止渠道
   */
  stop(): Promise<void>;
}
