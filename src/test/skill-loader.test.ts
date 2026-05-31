/**
 * EvoAgent — SkillLoader 测试 v0.5.0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SkillLoader } from '../core/skill-loader.js';

describe('SkillLoader', () => {
  const mockFm = `---
name: Test Skill
description: A test skill for unit tests
version: 1.2.3
author: Test Author
tags: ["test", "utility"]
---

# Test Skill

This is a test skill.

## Usage

Just testing.`;

  const mockFmMinimal = `---
name: Minimal Skill
---

# Minimal`;

  const noFmContent = `# No Frontmatter Skill

Just content without frontmatter.`;

  describe('parseSkillMd', () => {
    it('should parse full frontmatter', async () => {
      const loader = new SkillLoader('/tmp/skills');
      const parsed = (loader as any).parseSkillMd(mockFm, '/tmp/skills/test-skill', 'test-skill');

      expect(parsed).not.toBeNull();
      expect(parsed!.name).toBe('Test Skill');
      expect(parsed!.description).toBe('A test skill for unit tests');
      expect(parsed!.version).toBe('1.2.3');
      expect(parsed!.author).toBe('Test Author');
      expect(parsed!.tags).toEqual(['test', 'utility']);
      expect(parsed!.slug).toBe('test-skill');
    });

    it('should default version when missing', async () => {
      const loader = new SkillLoader('/tmp/skills');
      const parsed = (loader as any).parseSkillMd(mockFmMinimal, '/tmp/skills/minimal', 'minimal');

      expect(parsed!.version).toBe('1.0.0');
      expect(parsed!.description).toBe('');
    });

    it('should extract description from content when no frontmatter', async () => {
      const loader = new SkillLoader('/tmp/skills');
      const parsed = (loader as any).parseSkillMd(noFmContent, '/tmp/skills/no-fm', 'no-fm');

      expect(parsed).not.toBeNull();
      expect(parsed!.name).toBe('no-fm');
      expect(parsed!.description).toBe('Just content without frontmatter.');
    });
  });

  describe('validate', () => {
    it('should report valid skills', async () => {
      const loader = new SkillLoader('/tmp/skills');

      // Manually add a skill
      (loader as any).skills.set('test-skill', {
        name: 'Test Skill',
        slug: 'test-skill',
        description: 'A test',
        version: '1.0.0',
        author: 'Me',
        tags: [],
        path: '/tmp/skills/test-skill',
        markdown: mockFm,
        installedAt: Date.now(),
        enabled: true
      });

      const result = loader.validate('test-skill');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing frontmatter as error', async () => {
      const loader = new SkillLoader('/tmp/skills');

      (loader as any).skills.set('bad-skill', {
        name: 'Bad',
        slug: 'bad-skill',
        description: 'Bad skill',
        version: '1.0.0',
        author: '',
        tags: [],
        path: '/tmp/skills/bad-skill',
        markdown: 'just some text without frontmatter at all',
        installedAt: Date.now(),
        enabled: true
      });

      const result = loader.validate('bad-skill');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Missing frontmatter');
    });

    it('should warn on very short markdown', async () => {
      const loader = new SkillLoader('/tmp/skills');

      (loader as any).skills.set('tiny', {
        name: 'Tiny',
        slug: 'tiny',
        description: 'S',
        version: '1.0.0',
        author: '',
        tags: [],
        path: '/tmp/skills/tiny',
        markdown: '---\nname: Tiny\n---',
        installedAt: Date.now(),
        enabled: true
      });

      const result = loader.validate('tiny');
      expect(result.warnings.some(w => w.includes('very short'))).toBe(true);
    });
  });

  describe('search', () => {
    it('should find skills by name, description, tag, and content', async () => {
      const loader = new SkillLoader('/tmp/skills');

      (loader as any).skills.set('skill-a', {
        name: 'Weather Tool',
        slug: 'weather-tool',
        description: 'Get weather data',
        version: '1.0.0',
        author: '',
        tags: ['weather', 'api'],
        path: '',
        markdown: '# Weather\nGet weather',
        installedAt: Date.now(),
        enabled: true
      });

      (loader as any).skills.set('skill-b', {
        name: 'Notepad',
        slug: 'notepad',
        description: 'Take notes',
        version: '1.0.0',
        author: '',
        tags: ['notes'],
        path: '',
        markdown: '# Notepad\nWrite notes',
        installedAt: Date.now(),
        enabled: true
      });

      const weatherResults = loader.search('weather');
      expect(weatherResults).toHaveLength(1);
      expect(weatherResults[0].skill.slug).toBe('weather-tool');
      expect(weatherResults[0].matchedFields).toContain('name');
      expect(weatherResults[0].matchedFields).toContain('description');
      expect(weatherResults[0].matchedFields).toContain('tags');
    });

    it('should return all skills for empty query', async () => {
      const loader = new SkillLoader('/tmp/skills');
      (loader as any).skills.set('a', { slug: 'a', enabled: true } as any);
      (loader as any).skills.set('b', { slug: 'b', enabled: true } as any);

      const results = loader.search('');
      expect(results).toHaveLength(2);
    });
  });
});
