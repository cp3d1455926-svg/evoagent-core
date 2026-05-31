/**
 * EvoAgent — Code Tool 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeTool } from '../tools/code.js';

const SAMPLE_TS = `
import { describe, it, expect } from 'vitest';
import fs from 'fs';

// TODO: refactor this later
export async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch: ' + response.status);
  }
  return response.text();
}

// FIXME: handle edge cases
function processItem(item: string, count: number, label: string, flag: boolean, extra: string): void {
  console.log('Processing:', item);
  for (let i = 0; i < count; i++) {
    if (flag) {
      console.log(label, i);
    }
  }
}

export class DataProcessor {
  private items: string[] = [];

  add(item: string): void {
    this.items.push(item);
  }
}
`;

const SAMPLE_PY = `
import os
import sys
from typing import Optional

def clean_data(raw: str) -> str:
    """Clean and normalize input data."""
    return raw.strip().lower()

def main():
    data = clean_data("  HELLO  ")
    print(data)
    return True
`;

const EMPTY_CODE = '';

describe('CodeTool', () => {
  let tool: CodeTool;

  beforeEach(() => {
    tool = new CodeTool();
  });

  describe('analyze', () => {
    it('should analyze TypeScript code and extract functions', async () => {
      const result = await tool.execute({ action: 'analyze', code: SAMPLE_TS, language: 'TypeScript' });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('fetchData');
      expect(result.content).toContain('processItem');
      expect(result.content).toContain('DataProcessor');
      expect(result.content).toContain('Functions: 2');
      expect(result.content).toContain('Classes: 1');
      expect(result.content).toContain('Imports: 2');
    });

    it('should analyze Python code', async () => {
      const result = await tool.execute({ action: 'analyze', code: SAMPLE_PY, language: 'Python' });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('clean_data');
      expect(result.content).toContain('main');
    });

    it('should detect TODOs and FIXMEs', async () => {
      const result = await tool.execute({ action: 'analyze', code: SAMPLE_TS, language: 'TypeScript' });
      expect(result.content).toContain('TODO');
      expect(result.content).toContain('FIXME');
    });

    it('should detect console.log', async () => {
      const result = await tool.execute({ action: 'analyze', code: SAMPLE_TS, language: 'TypeScript' });
      expect(result.content).toContain('console.log');
    });

    it('should return error for empty code', async () => {
      const result = await tool.execute({ action: 'analyze', code: EMPTY_CODE });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Error');
    });

    it('should auto-detect language from Python syntax', async () => {
      const result = await tool.execute({ action: 'analyze', code: SAMPLE_PY });
      expect(result.content).toContain('Python');
    });
  });

  describe('lint', () => {
    it('should lint TypeScript code', async () => {
      const result = await tool.execute({ action: 'lint', code: SAMPLE_TS, language: 'TypeScript' });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Score');
    });

    it('should return no issues for clean code', async () => {
      const clean = `export function add(a: number, b: number): number {
  return a + b;
}`;
      const result = await tool.execute({ action: 'lint', code: clean, language: 'TypeScript' });
      expect(result.content).toContain('No issues');
    });
  });

  describe('test generation', () => {
    it('should generate vitest tests for TypeScript', async () => {
      const result = await tool.execute({ action: 'test', code: SAMPLE_TS, language: 'TypeScript', testFramework: 'jest' });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('vitest');
      expect(result.content).toContain('describe');
      expect(result.content).toContain('fetchData');
    });

    it('should generate pytest for Python', async () => {
      const result = await tool.execute({ action: 'test', code: SAMPLE_PY, language: 'Python', testFramework: 'pytest' });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('pytest');
      expect(result.content).toContain('test_clean_data_valid');
      expect(result.content).toContain('test_main_valid');
    });

    it('should return error for empty code', async () => {
      const result = await tool.execute({ action: 'test', code: EMPTY_CODE });
      expect(result.isError).toBe(true);
    });

    it('should handle code with no functions', async () => {
      const noFuncs = 'const x = 1;';
      const result = await tool.execute({ action: 'test', code: noFuncs });
      expect(result.content).toContain('No functions found');
    });
  });

  describe('refactor', () => {
    it('should suggest refactoring plan', async () => {
      const result = await tool.execute({ action: 'refactor', code: SAMPLE_TS, language: 'TypeScript' });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Refactor');
      expect(result.content).toContain('Plan');
    });
  });

  describe('generate', () => {
    it('should return generation plan', async () => {
      const result = await tool.execute({ action: 'generate', language: 'TypeScript', instruction: 'Create a REST client' });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Generate');
      expect(result.content).toContain('TypeScript');
    });
  });

  describe('project_map', () => {
    it('should map project structure', async () => {
      const result = await tool.execute({ action: 'project_map', targetPath: __dirname });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Project Map');
    });
  });

  describe('dependency_check', () => {
    it('should check package.json dependencies', async () => {
      const result = await tool.execute({ action: 'dependency_check', targetPath: process.cwd() });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Dependency Check');
    });
  });

  describe('diff', () => {
    it('should return diff info', async () => {
      const result = await tool.execute({ action: 'diff', instruction: 'Compare branches' });
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Diff');
    });
  });

  describe('unknown action', () => {
    it('should return error for unknown action', async () => {
      const result = await tool.execute({ action: 'unknown' as any, code: SAMPLE_TS });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Unknown');
    });
  });

  describe('language detection', () => {
    it('should detect React/TS from imports', async () => {
      const result = await tool.execute({ action: 'analyze', code: 'import React from "react";\nconst App = () => <div />;' });
      expect(result.content).toContain('React/TS');
    });

    it('should detect Go', async () => {
      const result = await tool.execute({ action: 'analyze', code: 'package main\n\nfunc main() {\n\tfmt.Println("hello")\n}' });
      expect(result.content).toContain('Go');
    });

    it('should detect Rust', async () => {
      const result = await tool.execute({ action: 'analyze', code: 'fn main() {\n\tlet mut x = 1;\n\tprintln!("{}", x);\n}' });
      expect(result.content).toContain('Rust');
    });
  });

  describe('quality scoring', () => {
    it('should produce different scores for good vs bad code', async () => {
      const goodCode = `/**
 * Adds two numbers
 */
export function add(a: number, b: number): number {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Invalid input');
  }
  return a + b;
}`;

      const badCode = `function x(a,b,c,d,e,f){console.log(a);if(a>1){if(a>2){if(a>3){if(a>4){return a}}}}} 
// TODO: clean this up
// FIXME: too many params`;

      const goodResult = await tool.execute({ action: 'analyze', code: goodCode, language: 'TypeScript' });
      const badResult = await tool.execute({ action: 'analyze', code: badCode, language: 'TypeScript' });

      const goodScore = parseInt(goodResult.content.match(/Score: (\d+)/)?.[1] || '0');
      const badScore = parseInt(badResult.content.match(/Score: (\d+)/)?.[1] || '100');

      expect(goodScore).toBeGreaterThan(badScore);
    });
  });
});
