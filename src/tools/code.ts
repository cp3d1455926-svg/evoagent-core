/**
 * EvoAgent - Code Tool
 *
 * Code analysis, refactoring, generation, lint, and diff.
 * Provides structured code operation context, works with bash/file tools.
 */

import type { Tool, ToolExecuteResult } from './tool-executor.js';
import { readFile } from 'fs/promises';

interface CodeArgs {
  action: 'analyze' | 'refactor' | 'generate' | 'test' | 'lint' | 'diff';
  language?: string;
  code?: string;
  instruction?: string;
  filePath?: string;
}

interface AnalysisResult {
  lines: number;
  functions: number;
  classes: number;
  imports: number;
  todos: string[];
  issues: string[];
}

export class CodeTool implements Tool {
  name = 'code';
  description = 'Code analysis, refactoring, and generation. Actions: analyze, refactor, generate, test, lint, diff.';
  permissionLevel = 'execute' as const;

  parameters = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['analyze', 'refactor', 'generate', 'test', 'lint', 'diff'], description: 'Code operation' },
      language: { type: 'string', description: 'Programming language (e.g. typescript, python)' },
      code: { type: 'string', description: 'Source code to process' },
      instruction: { type: 'string', description: 'Natural language instruction for the operation' },
      filePath: { type: 'string', description: 'Path to source file (alternative to code param)' }
    },
    required: ['action']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action, language, code, instruction, filePath } = args as unknown as CodeArgs;

    let sourceCode = code;
    if (filePath && !sourceCode) {
      try {
        sourceCode = await readFile(filePath, 'utf-8');
      } catch (err) {
        return { content: 'Error reading file: ' + (err instanceof Error ? err.message : String(err)), isError: true };
      }
    }

    switch (action) {
      case 'analyze':
        return this.analyze(sourceCode, language, filePath);
      case 'refactor':
        return this.refactor(sourceCode, language, instruction);
      case 'generate':
        return {
          content: '[Generate] Language: ' + (language || 'auto') + '\nInstruction: ' + (instruction || 'None') + '\n\nPlan:\n1. Generate code based on instruction\n2. Write with file tool\n3. Test with bash tool',
          isError: false
        };
      case 'test':
        return {
          content: '[Test] Language: ' + (language || 'auto') + '\n' + (instruction ? 'Test: ' + instruction : 'Run project tests') + '\n\nCommands:\n- npm test\n- pytest\n- cargo test\n- go test ./...',
          isError: false
        };
      case 'lint':
        return this.lint(sourceCode, language, filePath);
      case 'diff':
        return {
          content: '[Diff] ' + (instruction || 'No instruction') + '\n\nTo see changes:\n- git diff (for git repos)\n- diff file1 file2',
          isError: false
        };
      default:
        return { content: 'Unknown action: ' + action, isError: true };
    }
  }

  private analyze(code: string | undefined, language?: string, filePath?: string): ToolExecuteResult {
    if (!code) {
      return { content: 'Error: No code provided. Use filePath or code param.', isError: true };
    }

    const result = this.performAnalysis(code, language);
    const lang = language || this.detectLanguage(filePath || '', code);
    const codeLines = code.split('\n');

    const title = '[Code Analysis] ' + lang;
    const file = 'File: ' + (filePath || 'inline');
    const stats = 'Lines: ' + result.lines + ' | Functions: ' + result.functions + ' | Classes: ' + result.classes + ' | Imports: ' + result.imports;

    const parts = [title, file, '', '--- Stats ---', stats];

    if (result.todos.length > 0) {
      parts.push('', '--- TODOs ---');
      result.todos.forEach(t => parts.push('  ' + t));
    }

    if (result.issues.length > 0) {
      parts.push('', '--- Issues ---');
      result.issues.forEach(i => parts.push('  [!] ' + i));
    }

    // Structure overview
    parts.push('', '--- Structure ---');
    const structLines = codeLines.filter(l => {
      const t = l.trim();
      return t.startsWith('function ') || t.startsWith('class ') || t.startsWith('export ') ||
        t.startsWith('import ') || t.startsWith('const ') || t.startsWith('interface ') ||
        t.startsWith('type ') || t.startsWith('async function') || t.startsWith('def ') ||
        t.startsWith('public ') || t.startsWith('private ');
    }).slice(0, 20);
    structLines.forEach(l => parts.push('  ' + l.trim()));

    return { content: parts.join('\n'), isError: false };
  }

  private performAnalysis(code: string, _language?: string): AnalysisResult {
    const lines = code.split('\n');

    return {
      lines: lines.length,
      functions: (code.match(/\b(function|def|fn|func|async\s+function)\b/g) || []).length,
      classes: (code.match(/\b(class|struct|interface|trait|impl)\b/g) || []).length,
      imports: (code.match(/\b(import|require|use|from|include)\b/g) || []).length,
      todos: lines.filter(l => l.includes('TODO') || l.includes('FIXME') || l.includes('HACK') || l.includes('XXX')).map(l => l.trim()),
      issues: this.detectIssues(code, lines)
    };
  }

  private detectIssues(code: string, lines: string[]): string[] {
    const issues: string[] = [];
    if (lines.some(l => l.length > 200)) issues.push('Some lines exceed 200 chars');
    if (lines.some(l => /\t/.test(l) && / {2}/.test(l))) issues.push('Mixed tabs and spaces');
    if (code.includes('console.log') || code.includes('print(')) issues.push('Contains debug print statements');
    if (!code.includes('try') && lines.length > 50) issues.push('No error handling detected');
    if (/\bany\b/.test(code) && /\btypescript\b/.test(code.toLowerCase())) issues.push('Uses TypeScript any type');
    if ((code.match(/function|def|fn/g) || []).length > 20) issues.push('Many functions - consider splitting into modules');
    return issues;
  }

  private detectLanguage(filePath: string, code: string): string {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'TypeScript';
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'JavaScript';
    if (filePath.endsWith('.py')) return 'Python';
    if (filePath.endsWith('.rs')) return 'Rust';
    if (filePath.endsWith('.go')) return 'Go';
    if (filePath.endsWith('.java')) return 'Java';
    if (code.includes('import React') || code.includes('from "react"')) return 'React/TypeScript';
    if (code.includes('def ') && code.includes(':')) return 'Python';
    if (code.includes('func ') && code.includes('package ')) return 'Go';
    return 'Unknown';
  }

  private refactor(code: string | undefined, language?: string, instruction?: string): ToolExecuteResult {
    if (!code) return { content: 'Error: No code provided.', isError: true };
    return {
      content: '[Refactor] Language: ' + (language || 'auto') + '\nInstruction: ' + (instruction || 'None') + '\n\nSteps:\n1. Analyze current code structure\n2. Identify refactoring targets\n3. Apply changes incrementally\n4. Run tests after each change\n\nUse file tool to read/write, bash tool to run tests.',
      isError: false
    };
  }

  private lint(code: string | undefined, language?: string, _filePath?: string): ToolExecuteResult {
    if (!code) return { content: 'Error: No code or filePath provided.', isError: true };
    const result = this.performAnalysis(code, language);
    const parts = ['[Lint Report] ' + (language || 'auto')];
    if (result.issues.length > 0) {
      result.issues.forEach(i => parts.push('  [!] ' + i));
    } else {
      parts.push('  OK - No obvious issues detected');
    }
    return { content: parts.join('\n'), isError: false };
  }
}
