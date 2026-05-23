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
});
