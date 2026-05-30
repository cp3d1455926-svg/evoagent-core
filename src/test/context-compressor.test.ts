import { describe, it, expect } from 'vitest';
import { ContextCompressor } from '../core/context-compressor.js';
import type { LLMMessage } from '../core/types.js';

describe('ContextCompressor', () => {
  const makeMessages = (count: number): LLMMessage[] => {
    const msgs: LLMMessage[] = [{ role: 'system', content: 'System prompt' }];
    for (let i = 0; i < count; i++) {
      msgs.push({ role: 'user', content: `Message ${i}` });
      msgs.push({ role: 'assistant', content: `Response ${i}` });
    }
    return msgs;
  };

  it('should not compress short context', async () => {
    const cc = new ContextCompressor({ maxTokens: 10000, softThreshold: 0.8 });
    const msgs = makeMessages(3);
    const result = await cc.compress(msgs);
    expect(result.modified).toBe(false);
    expect(result.messages).toEqual(msgs);
  });

  it('should compress when over threshold', async () => {
    const cc = new ContextCompressor({ maxTokens: 100, softThreshold: 0.5 });
    const msgs = makeMessages(20);
    const result = await cc.compress(msgs);
    expect(result.modified).toBe(true);
    expect(result.compressedTokenCount).toBeLessThan(result.originalTokenCount);
  });

  it('should preserve system messages after compression', async () => {
    const cc = new ContextCompressor({ maxTokens: 50, softThreshold: 0.5 });
    const msgs = makeMessages(30);
    const result = await cc.compress(msgs);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toBe('System prompt');
  });

  it('should return token counts', async () => {
    const cc = new ContextCompressor({ maxTokens: 10000, softThreshold: 0.8 });
    const msgs = makeMessages(5);
    const result = await cc.compress(msgs);
    expect(result.originalTokenCount).toBeGreaterThan(0);
    expect(result.compressedTokenCount).toBeGreaterThan(0);
  });

  it('should deduplicate similar messages with fuzzy matching', async () => {
    const cc = new ContextCompressor({ maxTokens: 100, softThreshold: 0.5, enableFuzzyDedup: true });
    const msgs: LLMMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'How do I write a TypeScript function?' },
      { role: 'assistant', content: 'You can write a function like this...' },
      { role: 'user', content: 'How do I write a TypeScript function?' },
      { role: 'assistant', content: 'You can write a function like this...' },
      { role: 'user', content: 'How do I write a TypeScript function?' },
    ];
    const result = await cc.compress(msgs);
    expect(result.modified).toBe(true);
    expect(result.messages.length).toBeLessThan(msgs.length);
  });

  it('should track compression stats', async () => {
    const cc = new ContextCompressor({ maxTokens: 50, softThreshold: 0.5 });
    const msgs = makeMessages(30);
    await cc.compress(msgs);
    const stats = cc.getStats();
    expect(stats.totalCompressions).toBeGreaterThan(0);
    expect(stats.totalTokensSaved).toBeGreaterThan(0);
  });
});
