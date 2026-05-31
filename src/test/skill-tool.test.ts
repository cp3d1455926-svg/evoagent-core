/**
 * EvoAgent — SkillTool 测试 v0.5.0
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillTool } from '../tools/skill-tool.js';
import { SkillLoader } from '../core/skill-loader.js';
import { SkillMarket } from '../core/skill-market.js';

describe('SkillTool', () => {
  let tool: SkillTool;

  beforeEach(() => {
    tool = new SkillTool();
  });

  describe('basic properties', () => {
    it('should have correct name and permission', () => {
      expect(tool.name).toBe('skill');
      expect(tool.permissionLevel).toBe('execute');
    });

    it('should have valid parameters schema', () => {
      const params = tool.parameters;
      expect(params.type).toBe('object');
      expect(params.required).toContain('action');
      expect(params.properties.action).toBeDefined();
    });

    it('should support all skill actions', () => {
      const actions = tool.parameters.properties.action.enum;
      const expected = ['install', 'install-many', 'uninstall', 'list', 'search',
        'info', 'enable', 'disable', 'popular', 'latest', 'validate'];

      for (const a of expected) {
        expect(actions).toContain(a);
      }
    });
  });

  describe('error handling', () => {
    it('should return error for unknown action', async () => {
      const result = await tool.execute({ action: 'explode' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Unknown action');
    });

    it('should return error for install without slug', async () => {
      const result = await tool.execute({ action: 'install' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"slug" is required');
    });

    it('should return error for uninstall without slug', async () => {
      const result = await tool.execute({ action: 'uninstall' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"slug" is required');
    });

    it('should return error for info without slug', async () => {
      const result = await tool.execute({ action: 'info' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"slug" is required');
    });

    it('should return error for enable without name', async () => {
      const result = await tool.execute({ action: 'enable' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"name" is required');
    });

    it('should return error for disable without name', async () => {
      const result = await tool.execute({ action: 'disable' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"name" is required');
    });

    it('should return error for search without query', async () => {
      const result = await tool.execute({ action: 'search' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"query" is required');
    });

    it('should return error for install-many without slugs', async () => {
      const result = await tool.execute({ action: 'install-many' });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('"slugs" array is required');
    });
  });
});
