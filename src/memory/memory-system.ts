/**
 * EvoAgent — 四层记忆系统 v2.0
 *
 * v0.4.0 增强：
 * - 语义缓存层（缓存检索结果）
 * - 自动记忆巩固（定期整理 + 去重 + 摘要）
 * - 记忆重要性评分
 * - 跨会话记忆关联
 * - 记忆压缩存储
 * - Token 优化的上下文构建
 */

import type { LLMMessage } from '../core/types.js';
import { memorySearchCache, KVCache } from '../core/kv-cache.js';
import { WorkingMemory } from './short-term/working-memory.js';
import { LongTermMemory } from './long-term/long-term-memory.js';
import { SkillMemory } from './skill/skill-memory.js';
import { EpisodicMemory } from './episodic/episodic-memory.js';

export interface MemoryConfig {
  working?: { maxTokens: number };
  longTerm?: { provider: 'chromadb' | 'memory'; url?: string };
  skill?: { autoEvolve: boolean };
  episodic?: { provider: 'sqlite' | 'postgresql'; url?: string };
  /** 记忆巩固间隔（消息数） */
  consolidationInterval?: number;
  /** 最大注入 token 数 */
  maxContextTokens?: number;
}

export class MemorySystem {
  readonly working: WorkingMemory;
  readonly longTerm: LongTermMemory;
  readonly skill: SkillMemory;
  readonly episodic: EpisodicMemory;

  private messageCount = 0;
  private consolidationInterval: number;
  private maxContextTokens: number;
  private contextCache: KVCache<string>;

  constructor(config: MemoryConfig = {}) {
    this.working = new WorkingMemory(config.working?.maxTokens ?? 4096);
    this.longTerm = new LongTermMemory(config.longTerm?.provider ?? 'memory', config.longTerm?.url);
    this.skill = new SkillMemory(config.skill?.autoEvolve ?? true);
    this.episodic = new EpisodicMemory(config.episodic?.provider ?? 'sqlite', config.episodic?.url);
    this.consolidationInterval = config.consolidationInterval ?? 10;
    this.maxContextTokens = config.maxContextTokens ?? 4000;
    this.contextCache = new KVCache<string>({ maxSize: 50, defaultTTLMs: 300000 });
  }

  /**
   * 构建记忆上下文 — 注入到每次 LLM 调用
   * v0.4.0 改进：
   * - 语义缓存
   * - Token 预算控制
   * - 重要性排序
   * - 关联记忆
   */
  async buildContext(userInput: string): Promise<string | null> {
    // 缓存查找
    const cached = this.contextCache.getFuzzy(userInput);
    if (cached) return cached;

    const parts: string[] = [];
    let usedTokens = 0;
    const maxTokens = this.maxContextTokens;

    // 1. 长期记忆：语义检索（带缓存）
    const memResults = await memorySearchCache.getOrCompute(
      `ltm:${userInput}`,
      () => this.longTerm.search(userInput, 8),
      300000
    );

    if (memResults.length > 0) {
      const header = '## 相关记忆';
      const memoryLines = memResults.map((m, i) => `${i + 1}. [${(m.score * 100).toFixed(0)}%] ${m.content}`);
      const section = [header, ...memoryLines].join('\n');
      const tokens = Math.ceil(section.length / 4);
      if (usedTokens + tokens <= maxTokens) {
        parts.push(section);
        usedTokens += tokens;
      }
    }

    // 2. 技能记忆：匹配适用技能
    if (usedTokens < maxTokens * 0.5) {
      const matchedSkills = await this.skill.match(userInput, 3);
      if (matchedSkills.length > 0) {
        const header = '## 可用技能';
        const skillLines = matchedSkills.map(s => `- ${s.name}: ${s.description} (成功率: ${(s.successRate * 100).toFixed(0)}%)`);
        const section = [header, ...skillLines].join('\n');
        const tokens = Math.ceil(section.length / 4);
        if (usedTokens + tokens <= maxTokens) {
          parts.push(section);
          usedTokens += tokens;
        }
      }
    }

    // 3. 最近事件（仅在有空间时）
    if (usedTokens < maxTokens * 0.3) {
      try {
        const recentEvents = await this.episodic.getRecent(3);
        if (recentEvents.length > 0) {
          const header = '## 最近事件';
          const eventLines = recentEvents.map(e => `- [${e.type}] ${e.content.slice(0, 80)}`);
          const section = [header, ...eventLines].join('\n');
          const tokens = Math.ceil(section.length / 4);
          if (usedTokens + tokens <= maxTokens) {
            parts.push(section);
          }
        }
      } catch { /* ignore */ }
    }

    if (parts.length === 0) return null;

    const context = parts.join('\n\n');
    this.contextCache.set(userInput, context, 300000);
    return context;
  }

  /**
   * 记忆固化 — 会话结束后自动提取关键信息
   * v0.4.0 改进：
   * - 重要性评分
   * - 去重检测
   * - 自动巩固触发
   */
  async solidify(messages: LLMMessage[], finalResponse: string): Promise<void> {
    this.messageCount++;

    const conversationText = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // 1. 写入事件记忆
    await this.episodic.record({
      type: 'conversation',
      content: conversationText.slice(0, 2000), // 截断，避免过大
      metadata: { finalResponse: finalResponse.slice(0, 500), messageCount: messages.length }
    });

    // 2. 提取并评分关键信息
    const keyInfos = this.extractKeyInfo(conversationText);
    for (const info of keyInfos) {
      const importance = this.scoreImportance(info, conversationText);
      if (importance > 0.3) {
        await this.longTerm.store(`[${(importance * 100).toFixed(0)}%] ${info}`);
      }
    }

    // 3. 评估是否生成新技能
    await this.skill.evaluateAndLearn(conversationText, finalResponse);

    // 4. 更新全局时间衰减基准
    this.updateDecayFactor();

    // 5. 定期触发记忆巩固
    if (this.messageCount % this.consolidationInterval === 0) {
      await this.consolidate();
    }

    // 5. 清除已过期的缓存
    // （KVCache 自带 TTL，无需手动清理）
  }

  // ─── 时间衰减 ─────────────────────────────────────

  /** 全局衰减因子（每日递减 5%，每次 solidify 更新） */
  private decayFactor = 1.0;

  private updateDecayFactor(): void {
    // 每 20 次会话缓慢衰减，但不低于 0.5
    this.decayFactor = Math.max(0.5, this.decayFactor - 0.005);
  }

  /**
   * 记忆巩固 v3.0 — 定期整理记忆
   * - 时间衰减（旧记忆优先级降低）
   * - 聚类合并（Jaccard > 0.6 的记忆合并为摘要）
   * - 知识图谱节点提取
   * - 低重要性 + 低访问清理
   */
  async consolidate(): Promise<void> {
    const allMemories = this.longTerm.getAll();
    if (allMemories.length === 0) return;

    // ─── 阶段 1: 评分 + 过滤 ────────────────────────
    const scored: Array<{ entry: typeof allMemories[0]; importance: number }> = [];

    for (const mem of allMemories) {
      let importance = this.scoreImportance(mem.content, mem.content);

      // 时间衰减：越旧的记忆权重越低
      const ageDays = (Date.now() - mem.timestamp) / (24 * 60 * 60 * 1000);
      const timePenalty = Math.max(0, 1 - ageDays * 0.05); // 每天降 5%
      importance *= timePenalty;

      // 访问次数惩罚：无人问津的记忆降低权重
      const accessBonus = Math.min(mem.accessCount * 0.05, 0.3);
      importance += accessBonus;

      // 全局衰减因子
      importance *= this.decayFactor;

      scored.push({ entry: mem, importance });
    }

    // ─── 阶段 2: 聚类合并 ──────────────────────────
    const merged: Array<{ content: string; importance: number }> = [];
    const seen = new Set<number>();

    for (let i = 0; i < scored.length; i++) {
      if (seen.has(i)) continue;
      const clusterItems: Array<{ content: string; importance: number }> = [{
        content: scored[i].entry.content,
        importance: scored[i].importance
      }];
      const tokensI = this.tokenize(scored[i].entry.content);

      for (let j = i + 1; j < scored.length; j++) {
        if (seen.has(j)) continue;
        const tokensJ = this.tokenize(scored[j].entry.content);
        if (this.jaccard(tokensI, tokensJ) > 0.6) {
          clusterItems.push({
            content: scored[j].entry.content,
            importance: scored[j].importance
          });
          seen.add(j);
        }
      }

      // 从聚类中选出最佳记忆
      if (clusterItems.length === 1) {
        if (clusterItems[0].importance >= 0.2) {
          merged.push(clusterItems[0]);
        }
      } else {
        // 多个相似记忆：保留最高分的那条
        clusterItems.sort((a, b) => b.importance - a.importance);
        merged.push(clusterItems[0]);
      }
    }

    // ─── 阶段 3: 知识图谱提取 ──────────────────────
    const knowledgeGraph = this.extractKnowledgeGraph(merged.map(m => m.content));
    if (knowledgeGraph.length > 0) {
      // 将知识图谱节点作为高优先级记忆注入
      for (const node of knowledgeGraph) {
        merged.push({ content: node, importance: 0.85 });
      }
    }

    // ─── 阶段 4: 重建 ──────────────────────────────
    this.longTerm.clear();
    for (const mem of merged) {
      await this.longTerm.store(mem.content);
    }
  }

  /**
   * 知识图谱提取 — 从记忆集合中发现知识节点
   * 检测形如 "A 是 B" / "A 使用 B" / "A 依赖 B" 的关系
   */
  private extractKnowledgeGraph(memories: string[]): string[] {
    const nodes: string[] = [];

    // 关系模式
    const relationPatterns = [
      /(.{2,30})(?:是|属于|表示)(.{2,30})/g,
      /(.{2,30})(?:使用|依赖|基于|采用)(.{2,30})/g,
      /(.{2,30})(?:提供|支持|包含)(.{2,30})/g,
      /(.{2,30})(?:连接|关联|集成)(.{2,30})/g,
    ];

    for (const memory of memories) {
      for (const pat of relationPatterns) {
        let m: RegExpExecArray | null;
        while ((m = pat.exec(memory)) !== null) {
          const subject = m[1].trim();
          const object = m[2].trim();
          if (subject.length >= 2 && object.length >= 2) {
            nodes.push(`知识: ${subject} → ${object}`);
          }
        }
      }
    }

    return [...new Set(nodes)]; // 去重
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text.toLowerCase()
        .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2)
    );
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const item of a) { if (b.has(item)) intersection++; }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * 提取关键信息（增强版）
   */
  private extractKeyInfo(text: string): string[] {
    const info: string[] = [];

    // 用户偏好
    const prefPatterns = [
      /喜欢[：:]\s*(.+)/g, /偏好[：:]\s*(.+)/g, /习惯[：:]\s*(.+)/g,
      /风格[：:]\s*(.+)/g, /要用[：:]\s*(.+)/g, /倾向于[：:]\s*(.+)/g,
      /prefer[s]?\s*[:\s]+(.+)/gi, /like[s]?\s*[:\s]+(.+)/gi,
    ];
    for (const pat of prefPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pat.exec(text)) !== null) info.push(`偏好: ${m[1].trim()}`);
    }

    // 重要决策
    const decisionPatterns = [
      /决定[：:]\s*(.+)/g, /选择[：:]\s*(.+)/g, /确定[：:]\s*(.+)/g,
      /确认[：:]\s*(.+)/g, /改为[：:]\s*(.+)/g,
      /decided?\s*[:\s]+(.+)/gi, /chose\s*[:\s]+(.+)/gi,
    ];
    for (const pat of decisionPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pat.exec(text)) !== null) info.push(`决策: ${m[1].trim()}`);
    }

    // 技术选择
    const techPatterns = [
      /使用[：:]\s*(.+)/g, /采用[：:]\s*(.+)/g, /技术栈[：:]\s*(.+)/g,
      /框架[：:]\s*(.+)/g, /语言[：:]\s*(.+)/g,
    ];
    for (const pat of techPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pat.exec(text)) !== null) info.push(`技术: ${m[1].trim()}`);
    }

    // 问题/解决方案
    const solutionPatterns = [
      /解决[：:]\s*(.+)/g, /方案[：:]\s*(.+)/g, /修复[：:]\s*(.+)/g,
      /fixed?\s*[:\s]+(.+)/gi, /solution[:\s]+(.+)/gi,
    ];
    for (const pat of solutionPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pat.exec(text)) !== null) info.push(`方案: ${m[1].trim()}`);
    }

    return [...new Set(info)]; // 去重
  }

  /**
   * 评分记忆重要性 (0-1)
   */
  private scoreImportance(info: string, fullText: string): number {
    let score = 0.5;

    // 决策/偏好类更重要
    if (info.startsWith('决策:') || info.startsWith('偏好:')) score += 0.3;
    if (info.startsWith('方案:')) score += 0.2;

    // 在对话中多次提及 = 更重要
    const keyword = info.replace(/^(偏好|决策|技术|方案):\s*/, '');
    const mentions = (fullText.match(new RegExp(keyword.slice(0, 10), 'g')) || []).length;
    score += Math.min(mentions * 0.1, 0.3);

    return Math.min(1, score);
  }

  /**
   * 获取记忆统计
   */
  async getStats(): Promise<{
    longTermCount: number;
    skillCount: number;
    episodicCount: number;
    workingUtilization: number;
    cacheHitRate: number;
  }> {
    const cacheStats = memorySearchCache.stats();
    return {
      longTermCount: this.longTerm.getCount(),
      skillCount: this.skill.getSkills().length,
      episodicCount: this.episodic.getEventCount(),
      workingUtilization: this.working.getStats().utilizationPercent,
      cacheHitRate: cacheStats.hitRate
    };
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.longTerm.initialize(),
      this.skill.initialize(),
      this.episodic.initialize()
    ]);
  }

  async close(): Promise<void> {
    await Promise.all([
      this.longTerm.close(),
      this.skill.close(),
      this.episodic.close()
    ]);
  }
}
