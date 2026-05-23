/**
 * 技能记忆层 — Skill Memory
 * 
 * 可复用的操作模板库
 * 自动从成功经验中学习新技能
 */

export interface Skill {
  id: string;
  name: string;
  description: string;
  pattern: string;       // 触发模式（关键词/正则）
  template: string;      // 操作模板
  usageCount: number;
  successRate: number;
  createdAt: Date;
  lastUsedAt: Date;
}

export class SkillMemory {
  private skills: Skill[] = [];
  private autoEvolve: boolean;

  constructor(autoEvolve: boolean = true) {
    this.autoEvolve = autoEvolve;
  }

  async initialize(): Promise<void> {
    // 预置一些常用技能
    this.skills = [
      {
        id: 'skill-code-review',
        name: 'Code Review',
        description: 'Review code for bugs, style, and best practices',
        pattern: 'review|check|audit',
        template: '1. Read the code\n2. Check for bugs and edge cases\n3. Verify style consistency\n4. Suggest improvements',
        usageCount: 0,
        successRate: 1.0,
        createdAt: new Date(),
        lastUsedAt: new Date()
      },
      {
        id: 'skill-debug',
        name: 'Debug Issue',
        description: 'Systematic debugging approach',
        pattern: 'debug|fix|bug|error|broken',
        template: '1. Reproduce the issue\n2. Read error messages\n3. Check recent changes\n4. Isolate the cause\n5. Fix and verify',
        usageCount: 0,
        successRate: 1.0,
        createdAt: new Date(),
        lastUsedAt: new Date()
      },
      {
        id: 'skill-refactor',
        name: 'Refactor Code',
        description: 'Safe code refactoring workflow',
        pattern: 'refactor|clean|improve|optimize',
        template: '1. Ensure tests exist\n2. Make small incremental changes\n3. Run tests after each change\n4. Verify behavior unchanged',
        usageCount: 0,
        successRate: 1.0,
        createdAt: new Date(),
        lastUsedAt: new Date()
      }
    ];
  }

  /**
   * 匹配适用于当前输入的技能
   */
  async match(input: string, limit: number = 3): Promise<Skill[]> {
    const lower = input.toLowerCase();
    const matched = this.skills
      .filter(s => {
        const keywords = s.pattern.toLowerCase().split('|');
        return keywords.some(k => lower.includes(k));
      })
      .sort((a, b) => b.successRate - a.successRate || b.usageCount - a.usageCount)
      .slice(0, limit);

    // 更新使用统计
    for (const skill of matched) {
      skill.usageCount++;
      skill.lastUsedAt = new Date();
    }

    return matched;
  }

  /**
   * 评估对话并学习新技能
   */
  async evaluateAndLearn(conversation: string, finalResponse: string): Promise<void> {
    if (!this.autoEvolve) return;

    // 简化版：检测是否出现了新的操作模式
    // 实际项目中应使用 LLM 提取技能
    const hasNewPattern = conversation.includes('步骤') || conversation.includes('流程');
    if (hasNewPattern && finalResponse.includes('完成')) {
      // 记录潜在的新技能（简化处理）
      // TODO: 使用 LLM 自动提取和总结技能
    }
  }

  /**
   * 手动添加技能
   */
  addSkill(skill: Omit<Skill, 'id' | 'usageCount' | 'successRate' | 'createdAt' | 'lastUsedAt'>): void {
    this.skills.push({
      ...skill,
      id: `skill-${Date.now()}`,
      usageCount: 0,
      successRate: 1.0,
      createdAt: new Date(),
      lastUsedAt: new Date()
    });
  }

  /**
   * 获取所有技能
   */
  getSkills(): Skill[] {
    return [...this.skills];
  }

  async close(): Promise<void> {
    // TODO: 持久化到存储
  }
}
