/**
 * EvoAgent — 四层记忆系统
 * 
 * 借鉴 Hermes Agent 的三层记忆 + 扩展事件记忆层
 * 
 * 1. 短期记忆 (WorkingMemory)  — 当前会话上下文，滑动窗口
 * 2. 长期记忆 (LongTermMemory) — 向量数据库，语义检索
 * 3. 技能记忆 (SkillMemory)     — 可复用操作模板库
 * 4. 事件记忆 (EpisodicMemory)  — 带时间戳的完整交互日志
 */

import type { LLMMessage } from '../core/types.js';
import { WorkingMemory } from './short-term/working-memory.js';
import { LongTermMemory } from './long-term/long-term-memory.js';
import { SkillMemory } from './skill/skill-memory.js';
import { EpisodicMemory } from './episodic/episodic-memory.js';

export interface MemoryConfig {
  working?: { maxTokens: number };
  longTerm?: { provider: 'chromadb' | 'memory'; url?: string };
  skill?: { autoEvolve: boolean };
  episodic?: { provider: 'sqlite' | 'postgresql'; url?: string };
}

export class MemorySystem {
  readonly working: WorkingMemory;
  readonly longTerm: LongTermMemory;
  readonly skill: SkillMemory;
  readonly episodic: EpisodicMemory;

  constructor(config: MemoryConfig = {}) {
    this.working = new WorkingMemory(config.working?.maxTokens ?? 4096);
    this.longTerm = new LongTermMemory(config.longTerm?.provider ?? 'memory', config.longTerm?.url);
    this.skill = new SkillMemory(config.skill?.autoEvolve ?? true);
    this.episodic = new EpisodicMemory(config.episodic?.provider ?? 'sqlite', config.episodic?.url);
  }

  /**
   * 构建记忆上下文 — 注入到每次 LLM 调用
   */
  async buildContext(userInput: string): Promise<string | null> {
    const parts: string[] = [];

    // 1. 长期记忆：语义检索相关历史
    const relevantMemories = await this.longTerm.search(userInput, 5);
    if (relevantMemories.length > 0) {
      parts.push('## 相关记忆\n' + relevantMemories.map(m => `- ${m.content}`).join('\n'));
    }

    // 2. 技能记忆：匹配适用技能
    const matchedSkills = await this.skill.match(userInput, 3);
    if (matchedSkills.length > 0) {
      parts.push('## 可用技能\n' + matchedSkills.map((s: { name: string; description: string }) => `- ${s.name}: ${s.description}`).join('\n'));
    }

    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  /**
   * 记忆固化 — 会话结束后自动提取关键信息
   */
  async solidify(messages: LLMMessage[], finalResponse: string): Promise<void> {
    const conversationText = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // 1. 写入事件记忆
    await this.episodic.record({
      type: 'conversation',
      content: conversationText,
      metadata: { finalResponse }
    });

    // 2. 提取关键信息写入长期记忆（简化版）
    const keyInfo = this.extractKeyInfo(conversationText);
    for (const info of keyInfo) {
      await this.longTerm.store(info);
    }

    // 3. 评估是否生成新技能
    await this.skill.evaluateAndLearn(conversationText, finalResponse);
  }

  /**
   * 从对话中提取关键信息（简化版 NER）
   * 实际项目中应使用 NLP 库
   */
  private extractKeyInfo(text: string): string[] {
    const info: string[] = [];
    // 提取用户偏好
    const prefMatch = text.match(/喜欢|偏好|习惯|风格[：:]\s*(.+)/g);
    if (prefMatch) info.push(...prefMatch);
    // 提取重要决策
    const decisionMatch = text.match(/决定|选择|确定|确认[：:]\s*(.+)/g);
    if (decisionMatch) info.push(...decisionMatch);
    return info;
  }

  /**
   * 初始化所有记忆存储
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.longTerm.initialize(),
      this.skill.initialize(),
      this.episodic.initialize()
    ]);
  }

  /**
   * 关闭所有记忆存储
   */
  async close(): Promise<void> {
    await Promise.all([
      this.longTerm.close(),
      this.skill.close(),
      this.episodic.close()
    ]);
  }
}
