import { describe, it, expect } from 'vitest';
import { ToolExecutor } from '../tools/tool-executor.js';

describe('ToolExecutor', () => {
  it('should register all built-in tools', () => {
    const te = new ToolExecutor();
    const names = te.getTools().map(t => t.name);
    expect(names).toContain('bash');
    expect(names).toContain('file');
    expect(names).toContain('code');
    expect(names).toContain('web');
    expect(names).toContain('mcp');
    expect(names).toContain('git');
    expect(names).toContain('desktop');
  });

  it('should return tool definitions', () => {
    const te = new ToolExecutor();
    const defs = te.getToolDefinitions();
    expect(defs.length).toBe(7);
    for (const def of defs) {
      expect(def).toHaveProperty('name');
      expect(def).toHaveProperty('description');
      expect(def).toHaveProperty('parameters');
      expect(def).toHaveProperty('permissionLevel');
    }
  });

  it('should execute bash echo command', async () => {
    const te = new ToolExecutor();
    const result = await te.execute('bash', { command: 'echo hello' });
    expect(result.isError).toBe(false);
    expect(result.content).toContain('hello');
  });

  it('should return error for unknown tool', async () => {
    const te = new ToolExecutor();
    const result = await te.execute('nonexistent', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not found');
  });

  it('should execute desktop system_info', async () => {
    const te = new ToolExecutor();
    const result = await te.execute('desktop', { action: 'system_info' });
    expect(result.isError).toBe(false);
    expect(result.content).toContain('Platform');
  });

  it('should register custom tool', () => {
    const te = new ToolExecutor();
    te.register({
      name: 'custom',
      description: 'A custom tool',
      parameters: {},
      permissionLevel: 'read',
      execute: async () => ({ content: 'custom result', isError: false }),
    });
    expect(te.getTools().map(t => t.name)).toContain('custom');
  });
});
