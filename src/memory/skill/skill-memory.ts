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
   *
   * 检测对话中的操作模式，自动提取为可复用技能：
   * 1. 检测步骤型对话（包含序号或"步骤"/"流程"关键词）
   * 2. 提取操作名称和模板
   * 3. 如果匹配度高于阈值，添加为新技能
   */
  async evaluateAndLearn(conversation: string, finalResponse: string): Promise<void> {
    if (!this.autoEvolve) return;

    const lower = conversation.toLowerCase();

    // 检测步骤型模式
    const hasSteps = /步骤|流程|\d+[.、)]|first|then|finally|step/i.test(conversation);
    const isSuccessful = /完成|成功|done|finished|✅|success/i.test(finalResponse);

    if (!hasSteps || !isSuccessful) return;

    // 提取潜在技能名称
    const userMsg = conversation.split('\n').find(l => l.startsWith('user:') || l.startsWith('用户：'));
    if (!userMsg) return;

    const context = userMsg.slice(0, 50);
    const existing = this.skills.find(s =>
      s.name.toLowerCase().includes(context.slice(0, 20).toLowerCase()) ||
      context.toLowerCase().includes(s.name.toLowerCase())
    );

    if (existing) {
      // 更新已有技能
      existing.usageCount++;
      existing.successRate = Math.min(1.0, existing.successRate + 0.05);
      existing.lastUsedAt = new Date();
    } else {
      // 创建新技能
      const name = this.extractSkillName(context);
      if (name && name.length > 2) {
        this.addSkill({
          name,
          description: `Auto-learned skill from conversation: ${context}`,
          pattern: name.toLowerCase().split(/[\s,]+/).join('|'),
          template: this.extractTemplate(conversation)
        });
      }
    }
  }

  private extractSkillName(context: string): string {
    // 取前 5 个有意义的词
    const words = context
      .replace(/[^\w\u4e00-\u9fff\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .slice(0, 5);
    return words.join(' ');
  }

  private extractTemplate(conversation: string): string {
    // 提取步骤型内容作为模板
    const lines = conversation.split('\n');
    const steps = lines.filter(l => /^\d+[.、)]|[-*•]|步骤|step/i.test(l.trim()));
    if (steps.length >= 2) {
      return steps.slice(0, 5).map((s, i) => `${i + 1}. ${s.trim()}`).join('\n');
    }
    return '1. Analyze the task\n2. Execute step by step\n3. Verify the result';
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
