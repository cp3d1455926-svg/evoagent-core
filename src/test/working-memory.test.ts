import { describe, it, expect } from 'vitest';
import { WorkingMemory } from '../memory/short-term/working-memory.js';

describe('WorkingMemory', () => {
  it('should add and retrieve messages', () => {
    const wm = new WorkingMemory(4096);
    wm.add({ role: 'system', content: 'You are helpful' });
    wm.add({ role: 'user', content: 'Hello' });
    expect(wm.getMessages()).toHaveLength(2);
  });

  it('should preserve system messages when enforcing limit', () => {
    const wm = new WorkingMemory(20);
    wm.add({ role: 'system', content: 'System prompt here' });
    wm.add({ role: 'user', content: 'A'.repeat(100) });
    wm.add({ role: 'assistant', content: 'B'.repeat(100) });
    const msgs = wm.getMessages();
    expect(msgs[0].role).toBe('system');
  });

  it('should clear all messages', () => {
    const wm = new WorkingMemory(4096);
    wm.add({ role: 'user', content: 'test' });
    wm.clear();
    expect(wm.getMessages()).toHaveLength(0);
  });

  it('should not mutate internal state via getMessages', () => {
    const wm = new WorkingMemory(4096);
    wm.add({ role: 'user', content: 'test' });
    const msgs = wm.getMessages();
    msgs.pop();
    expect(wm.getMessages()).toHaveLength(1);
  });
});
