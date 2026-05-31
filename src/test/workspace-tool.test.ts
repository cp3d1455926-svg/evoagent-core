/**
 * EvoAgent — WorkspaceTool 测试 v0.5.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceTool } from '../tools/workspace.js';

describe('WorkspaceTool', () => {
  let tool: WorkspaceTool;

  beforeEach(() => {
    tool = new WorkspaceTool();
  });

  describe('basic properties', () => {
    it('should have correct name and permission', () => {
      expect(tool.name).toBe('workspace');
      expect(tool.permissionLevel).toBe('write');
    });

    it('should have valid parameters schema', () => {
      const params = tool.parameters;
      expect(params.type).toBe('object');
      expect(params.properties.action).toBeDefined();
      expect(params.required).toContain('action');
    });

    it('should have description listing all actions', () => {
      const desc = tool.description;
      expect(desc).toContain('tree');
      expect(desc).toContain('list');
      expect(desc).toContain('read');
      expect(desc).toContain('write');
      expect(desc).toContain('search');
      expect(desc).toContain('delete');
      expect(desc).toContain('rename');
      expect(desc).toContain('mkdir');
    });
  });

  describe('error handling', () => {
    it('should return error for unknown action', async () => {
      const result = await tool.execute({ action: 'fly' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Unknown workspace action');
    });

    it('should return error for read without path', async () => {
      const result = await tool.execute({ action: 'read' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"path" is required');
    });

    it('should return error for write without path', async () => {
      const result = await tool.execute({ action: 'write', content: 'test' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"path" is required');
    });

    it('should return error for write without content', async () => {
      const result = await tool.execute({ action: 'write', path: 'test.txt' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"content" is required');
    });

    it('should return error for search without query', async () => {
      const result = await tool.execute({ action: 'search' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"query" is required');
    });

    it('should return error for delete without path', async () => {
      const result = await tool.execute({ action: 'delete' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"path" is required');
    });

    it('should return error for rename without path', async () => {
      const result = await tool.execute({ action: 'rename', newPath: 'b.txt' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"path" is required');
    });

    it('should return error for rename without newPath', async () => {
      const result = await tool.execute({ action: 'rename', path: 'a.txt' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"newPath" is required');
    });

    it('should return error for mkdir without path', async () => {
      const result = await tool.execute({ action: 'mkdir' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"path" is required');
    });
  });
});
