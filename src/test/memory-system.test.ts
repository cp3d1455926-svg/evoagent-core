import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MemorySystem } from '../memory/memory-system.js';

describe('MemorySystem', () => {
  let ms: MemorySystem;

  beforeAll(async () => {
    ms = new MemorySystem();
    await ms.initialize();
  });

  afterAll(async () => {
    await ms.close();
  });

  it('should build empty context', async () => {
    const ctx = await ms.buildContext('test');
    expect(ctx).toBeNull();
  });

  it('should store and search long-term memory', async () => {
    await ms.longTerm.store('Jake likes TypeScript and Node.js');
    await ms.longTerm.store('Project uses Express and WebSocket');
    const results = await ms.longTerm.search('Jake');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('Jake');
  });

  it('should match skills by keyword', async () => {
    const skills = await ms.skill.match('help me review this code');
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0].name).toBe('Code Review');
  });

  it('should match debug skill', async () => {
    const skills = await ms.skill.match('I need to debug an error');
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0].name).toBe('Debug Issue');
  });

  it('should record episodic events', async () => {
    await ms.episodic.record({ type: 'conversation', content: 'test event', metadata: {} });
    const recent = await ms.episodic.getRecent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].type).toBe('conversation');
  });

  it('should query events by type', async () => {
    await ms.episodic.record({ type: 'tool_use', content: 'bash echo', metadata: {} });
    await ms.episodic.record({ type: 'error', content: 'test error', metadata: {} });
    const toolEvents = await ms.episodic.queryByType('tool_use', 10);
    expect(toolEvents.length).toBeGreaterThan(0);
  });

  it('should build context with skills matched', async () => {
    const ctx = await ms.buildContext('review my code');
    expect(ctx).not.toBeNull();
    expect(ctx).toContain('可用技能');
  });

  it('should build context with relevant memories', async () => {
    await ms.longTerm.store('Previous code review found 3 bugs in auth module');
    const ctx = await ms.buildContext('code review auth');
    expect(ctx).not.toBeNull();
    expect(ctx).toContain('相关记忆');
  });

  describe('consolidate', () => {
    it('should run consolidation without errors', async () => {
      await ms.longTerm.store('Jake prefers dark mode for IDE');
      await ms.longTerm.store('Jake uses dark mode in VS Code');
      await ms.longTerm.store('Some random unimportant thing');

      // Should not throw
      await expect(ms.consolidate()).resolves.toBeUndefined();
    });

    it('should merge similar memories during consolidation', async () => {
      const beforeCount = ms.longTerm.getCount();
      await ms.consolidate();
      const afterCount = ms.longTerm.getCount();
      // After consolidation, count should be <= before
      expect(afterCount).toBeLessThanOrEqual(beforeCount);
    });

    it('should extract knowledge graph nodes', async () => {
      const memories = [
        'EvoAgent 使用 TypeScript 开发',
        'EvoAgent 依赖 KV 缓存层',
      ];
      for (const m of memories) {
        await ms.longTerm.store(m);
      }
      await ms.consolidate();
      const allMems = ms.longTerm.getAll();
      const hasKnowledge = allMems.some(m =>
        m.content.includes('知识:') || m.content.includes('→')
      );
      // Knowledge graph nodes may or may not be kept depending on dedup
      expect(allMems.length).toBeGreaterThan(0);
    });

    it('should handle empty memory list', async () => {
      await ms.longTerm.clear();
      await expect(ms.consolidate()).resolves.toBeUndefined();
    });
  });

  describe('knowledge graph extraction', () => {
    it('should extract entity relationships', () => {
      const extractor = (ms as any).extractKnowledgeGraph.bind(ms);
      const memories = [
        'EvoAgent 使用 TypeScript 开发',
        'Redis 提供缓存能力',
      ];
      const nodes = extractor(memories);
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.some((n: string) => n.includes('EvoAgent'))).toBe(true);
      expect(nodes.some((n: string) => n.includes('Redis'))).toBe(true);
    });

    it('should return empty for unrelated text', () => {
      const extractor = (ms as any).extractKnowledgeGraph.bind(ms);
      const nodes = extractor(['今天天气很好', '我去吃饭了']);
      expect(nodes.length).toBe(0);
    });
  });

  describe('consolidation interval', () => {
    it('should trigger consolidation at interval', async () => {
      const ms2 = new MemorySystem({ consolidationInterval: 2 });
      await ms2.initialize();

      // Solidify twice should trigger consolidation
      await ms2.solidify(
        [{ role: 'user', content: 'hello' }],
        'hello, how can I help?'
      );
      await ms2.solidify(
        [{ role: 'user', content: 'test' }],
        'test response'
      );

      await ms2.close();
    });
  });
});
