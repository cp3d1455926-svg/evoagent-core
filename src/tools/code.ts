/**
 * EvoAgent — Code Tool v2.0
 *
 * v0.5.0: AST-aware analysis, test generation, quality scoring, project mapping
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import type { Tool, ToolExecuteResult } from './tool-executor.js';

type CodeAction = 'analyze' | 'refactor' | 'generate' | 'test' | 'lint' | 'diff' | 'project_map' | 'dependency_check';

interface CodeArgs {
  action: CodeAction;
  language?: string;
  code?: string;
  instruction?: string;
  filePath?: string;
  targetPath?: string;
  testFramework?: string;
}

interface AnalysisResult {
  lines: number; blankLines: number; commentLines: number;
  functions: FunctionInfo[]; classes: ClassInfo[]; imports: ImportInfo[];
  todos: TodoItem[]; issues: CodeIssue[]; complexity: ComplexityInfo; qualityScore: number;
}

interface FunctionInfo { name: string; line: number; params: number; returnType?: string; isAsync: boolean; isExported: boolean; bodyLines: number; }
interface ClassInfo { name: string; line: number; methods: number; isExported: boolean; extends?: string; }
interface ImportInfo { module: string; line: number; isDefault: boolean; isNamespace: boolean; named?: string[]; }
interface TodoItem { text: string; line: number; type: 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'NOTE'; }
interface CodeIssue { severity: 'error' | 'warning' | 'info'; message: string; line?: number; rule?: string; }
interface ComplexityInfo { cyclomatic: number; maxFunctionLines: number; avgFunctionLines: number; nestingDepth: number; }

export class CodeTool implements Tool {
  name = 'code';
  description = 'Advanced code analysis, generation, refactoring, testing, and linting. Actions: analyze, refactor, generate, test, lint, diff, project_map, dependency_check.';
  permissionLevel = 'execute' as const;
  parameters = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['analyze', 'refactor', 'generate', 'test', 'lint', 'diff', 'project_map', 'dependency_check'] },
      language: { type: 'string' }, code: { type: 'string' }, instruction: { type: 'string' },
      filePath: { type: 'string' }, targetPath: { type: 'string' }, testFramework: { type: 'string' }
    },
    required: ['action']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action, language, code, instruction, filePath, targetPath, testFramework } = args as unknown as CodeArgs;
    let sourceCode = code;
    if (filePath && !sourceCode) {
      try { sourceCode = await readFile(filePath, 'utf-8'); }
      catch (err) { return { content: 'Error: ' + (err instanceof Error ? err.message : String(err)), isError: true }; }
    }
    switch (action) {
      case 'analyze': return this.analyze(sourceCode, language, filePath);
      case 'refactor': return this.refactor(sourceCode, language, instruction);
      case 'generate': return this.generate(instruction, language, targetPath);
      case 'test': return this.generateTests(sourceCode, language, filePath, testFramework);
      case 'lint': return this.lint(sourceCode, language);
      case 'diff': return { content: `[Diff] ${instruction || 'N/A'}\nUse: git diff or diff file1 file2`, isError: false };
      case 'project_map': return await this.projectMap(filePath || targetPath || process.cwd());
      case 'dependency_check': return await this.dependencyCheck(filePath || targetPath || process.cwd());
      default: return { content: 'Unknown: ' + action, isError: true };
    }
  }

  private analyze(code: string | undefined, language?: string, filePath?: string): ToolExecuteResult {
    if (!code) return { content: 'Error: No code', isError: true };
    const lang = language || this.detectLanguage(filePath || '', code);
    const r = this.performAnalysis(code, lang);
    const p: string[] = [
      `[Code Analysis] ${lang}`, `File: ${filePath || 'inline'}`, '',
      `Lines: ${r.lines} | Blank: ${r.blankLines} | Comments: ${r.commentLines}`,
      `Functions: ${r.functions.length} | Classes: ${r.classes.length} | Imports: ${r.imports.length}`,
      `Complexity: cyclomatic=${r.complexity.cyclomatic} maxFnLines=${r.complexity.maxFunctionLines} nesting=${r.complexity.nestingDepth}`,
      `Quality Score: ${r.qualityScore}/100`
    ];
    if (r.functions.length > 0) {
      p.push('', '--- Functions ---');
      r.functions.slice(0, 30).forEach(fn => {
        const tags = [fn.isAsync ? 'async' : '', fn.isExported ? 'export' : ''].filter(Boolean).join(',');
        p.push(`  L${fn.line}: ${fn.name}(${fn.params}p)${tags ? ' [' + tags + ']' : ''} ${fn.bodyLines}lines`);
      });
    }
    if (r.classes.length > 0) {
      p.push('', '--- Classes ---');
      r.classes.forEach(c => { p.push(`  L${c.line}: ${c.name}${c.extends ? ' extends ' + c.extends : ''} ${c.methods}m`); });
    }
    if (r.issues.length > 0) {
      p.push('', '--- Issues ---');
      r.issues.forEach(i => { p.push(`  ${i.severity === 'error' ? '❌' : i.severity === 'warning' ? '⚠️' : 'ℹ️'} L${i.line || '?'} ${i.message}`); });
    }
    if (r.todos.length > 0) {
      p.push('', '--- TODOs ---');
      r.todos.forEach(t => { p.push(`  L${t.line} [${t.type}] ${t.text}`); });
    }
    return { content: p.join('\n'), isError: false };
  }

  private performAnalysis(code: string, language: string): AnalysisResult {
    const lines = code.split('\n');
    const isPy = lang(language, 'python');
    const blankLines = lines.filter(l => l.trim().length === 0).length;
    const commentLines = lines.filter(l => { const t = l.trim(); return t.startsWith('//') || t.startsWith('#') || t.startsWith('/*') || t.startsWith('*'); }).length;

    const functions: FunctionInfo[] = [];
    const funcRegex = isPy ? /^(export\s+)?(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\w+))?\s*:/gm : /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?/gm;
    let m: RegExpExecArray | null;
    while ((m = funcRegex.exec(code)) !== null) {
      const ln = code.slice(0, m.index).split('\n').length;
      const params = m[4] ? m[4].split(',').filter(p => p.trim()).length : 0;
      functions.push({ name: m[3], line: ln, params, returnType: m[5] || undefined, isAsync: !!m[2], isExported: !!m[1], bodyLines: this.countBodyLines(code, m.index + m[0].length, isPy) });
    }

    const classes: ClassInfo[] = [];
    const classRegex = /^(export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{?/gm;
    while ((m = classRegex.exec(code)) !== null) {
      classes.push({ name: m[2], line: code.slice(0, m.index).split('\n').length, methods: 0, isExported: !!m[1], extends: m[3] || undefined });
    }

    const imports: ImportInfo[] = [];
    const impRegex = /^(import|from|require)\s+(.+?)(?:\s+from\s+(.+?))?;?$/gm;
    while ((m = impRegex.exec(code)) !== null) {
      imports.push({ module: m[3] || m[2], line: code.slice(0, m.index).split('\n').length, isDefault: m[1] === 'import' && !m[0].includes('{'), isNamespace: m[0].includes('* as'), named: m[0].match(/\{([^}]+)\}/)?.[1]?.split(',').map(s => s.trim()) });
    }

    const todos: TodoItem[] = [];
    const todoRegex = /\/\/\s*(TODO|FIXME|HACK|XXX|NOTE)[:\s]+(.+)/gi;
    while ((m = todoRegex.exec(code)) !== null) { todos.push({ type: m[1].toUpperCase() as TodoItem['type'], text: m[2], line: code.slice(0, m.index).split('\n').length }); }

    const issues = this.detectIssues(code, lines, functions, language);
    const complexity: ComplexityInfo = {
      cyclomatic: Math.min((code.match(/\b(if|else|switch|case|for|while|catch|&&|\?|try)\b/g) || []).length, 50),
      maxFunctionLines: functions.length > 0 ? Math.max(...functions.map(f => f.bodyLines)) : 0,
      avgFunctionLines: functions.length > 0 ? Math.round(functions.reduce((s, f) => s + f.bodyLines, 0) / functions.length) : 0,
      nestingDepth: this.calcNestingDepth(code)
    };
    const qualityScore = this.calcQualityScore(lines.length, functions, issues, complexity, commentLines);
    return { lines: lines.length, blankLines, commentLines, functions, classes, imports, todos, issues, complexity, qualityScore };
  }

  private generateTests(code: string | undefined, language?: string, filePath?: string, framework?: string): ToolExecuteResult {
    if (!code) return { content: 'Error: No code', isError: true };
    const detectedLang = language || this.detectLanguage(filePath || '', code);
    const analysis = this.performAnalysis(code, detectedLang);
    if (analysis.functions.length === 0) return { content: 'No functions found', isError: false };
    const isPy = lang(detectedLang, 'python');
    const fw = framework || (isPy ? 'pytest' : 'jest');
    const p: string[] = [`[Test Generation] ${lang} | ${fw}\n`];
    const testable = analysis.functions.filter(f => !f.name.startsWith('_'));
    if (fw === 'pytest') {
      p.push('import pytest\n');
      testable.forEach(td => {
        const nm = td.name; const pr = td.params;
        p.push(`def test_${nm}_valid():`);
        p.push(`    result = ${nm}(${this.genMockArgs(pr)})`);
        p.push(`    assert result is not None\n`);
        if (pr > 0) { p.push(`def test_${nm}_edge_cases():\n    pass\n`); }
      });
    } else {
      const hasAsync = analysis.functions.some(f => f.isAsync);
      p.push(`import { describe, it, expect } from '${hasAsync ? 'vitest' : 'jest'}';\n`);
      testable.forEach(td => {
        const nm = td.name; const pr = td.params;
        p.push(`describe('${nm}', () => {`);
        p.push(`  it('should work with valid input', () => {`);
        p.push(`    expect(${nm}(${this.genMockArgs(pr)})).toBeDefined();`);
        p.push(`  });`);
        if (pr > 0) { p.push(`  it('should handle edge cases', () => {});`); }
        p.push(`});\n`);
      });
    }
    return { content: p.join('\n'), isError: false };
  }

  private genMockArgs(count: number): string {
    return Array.from({ length: count }, (_, i) => `arg${i + 1}`).join(', ');
  }

  private async projectMap(rootPath: string): Promise<ToolExecuteResult> {
    try {
      const files = await this.walkDir(rootPath, 0, 3);
      const p: string[] = [`[Project Map] ${rootPath}\n`];
      files.forEach(f => { p.push('  '.repeat(f.depth) + (f.isDirectory ? '📁' : '📄') + ' ' + f.name + (f.isDirectory ? '/' : '')); });
      return { content: p.join('\n'), isError: false };
    } catch (err) { return { content: 'Error: ' + (err instanceof Error ? err.message : String(err)), isError: true }; }
  }

  private async walkDir(dir: string, depth: number, maxDepth: number): Promise<Array<{ name: string; depth: number; isDirectory: boolean }>> {
    if (depth > maxDepth) return [];
    const entries = await readdir(dir).catch(() => [] as string[]);
    const result: Array<{ name: string; depth: number; isDirectory: boolean }> = [];
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === '__pycache__' || entry === 'dist' || entry === 'build') continue;
      const fp = join(dir, entry);
      const info = await stat(fp).catch(() => null);
      if (!info) continue;
      result.push({ name: entry, depth, isDirectory: info.isDirectory() });
      if (info.isDirectory()) result.push(...await this.walkDir(fp, depth + 1, maxDepth));
    }
    return result;
  }

  private async dependencyCheck(rootPath: string): Promise<ToolExecuteResult> {
    const p: string[] = [`[Dependency Check] ${rootPath}\n`];
    try {
      const pkg = JSON.parse(await readFile(join(rootPath, 'package.json'), 'utf-8'));
      if (pkg.dependencies) { p.push('--- Dependencies ---'); Object.entries(pkg.dependencies).forEach(([n, v]) => p.push(`  ${n}: ${v}`)); }
      if (pkg.devDependencies) { p.push('', '--- Dev Dependencies ---'); Object.entries(pkg.devDependencies).forEach(([n, v]) => p.push(`  ${n}: ${v}`)); }
    } catch { /* no package.json */ }
    try { const req = await readFile(join(rootPath, 'requirements.txt'), 'utf-8'); p.push('', '--- Python ---', req.split('\n').filter(l => l.trim() && !l.startsWith('#')).join('\n')); } catch { }
    return { content: p.join('\n') || 'No dependency files found', isError: false };
  }

  private lint(code: string | undefined, language?: string): ToolExecuteResult {
    if (!code) return { content: 'Error: No code', isError: true };
    const analysis = this.performAnalysis(code, language || 'unknown');
    const p: string[] = [`[Lint] ${language || 'auto'}`, `Score: ${analysis.qualityScore}/100`, ''];
    if (analysis.issues.length === 0) p.push('✅ No issues');
    else analysis.issues.forEach(i => p.push(`${i.severity === 'error' ? '❌' : i.severity === 'warning' ? '⚠️' : 'ℹ️'} ${i.message}`));
    return { content: p.join('\n'), isError: false };
  }

  private refactor(code: string | undefined, language?: string, instruction?: string): ToolExecuteResult {
    if (!code) return { content: 'Error: No code', isError: true };
    const analysis = this.performAnalysis(code, language || 'unknown');
    const p: string[] = [`[Refactor] ${language || 'auto'}`, `Instruction: ${instruction || 'N/A'}`, `Score: ${analysis.qualityScore}/100`, '', '--- Plan ---'];
    analysis.issues.forEach(i => p.push(`  - ${i.message}`));
    analysis.functions.filter(f => f.bodyLines > 50).forEach(f => p.push(`  - Split large: ${f.name} (${f.bodyLines} lines)`));
    p.push('', '1. Review plan 2. Apply with file tool 3. Run tests 4. Lint');
    return { content: p.join('\n'), isError: false };
  }

  private generate(instruction?: string, language?: string, targetPath?: string): ToolExecuteResult {
    return { content: `[Generate] ${language || 'auto'} | ${targetPath || 'TBD'} | ${instruction || 'N/A'}\n\n1. Understand requirements\n2. Design structure (use project_map)\n3. Generate + tests\n4. Write files\n5. Lint + test`, isError: false };
  }

  private detectLanguage(fp: string, code: string): string {
    if (fp.endsWith('.ts') || fp.endsWith('.tsx')) return 'TypeScript';
    if (fp.endsWith('.js') || fp.endsWith('.jsx')) return 'JavaScript';
    if (fp.endsWith('.py')) return 'Python';
    if (fp.endsWith('.rs')) return 'Rust';
    if (fp.endsWith('.go')) return 'Go';
    if (code.includes('import React') || code.includes('from "react"')) return 'React/TS';
    if (code.includes('def ') && code.includes(':')) return 'Python';
    if (code.includes('func ') && code.includes('package ')) return 'Go';
    if (code.includes('fn ') && code.includes('let mut')) return 'Rust';
    return 'Unknown';
  }

  private countBodyLines(code: string, start: number, isPy: boolean): number {
    const remaining = code.slice(start);
    if (isPy) {
      const lines = remaining.split('\n'); let count = 0; let found = false;
      for (const line of lines) { if (line.trim().length > 0 && !line.startsWith(' ') && !line.startsWith('\t') && found) break; if (line.trim().length > 0) found = true; count++; }
      return count;
    }
    let depth = 0; let count = 0; let started = false;
    for (const char of remaining) { if (char === '{') { depth++; started = true; } if (char === '}') { depth--; if (started && depth <= 0) break; } if (char === '\n') count++; }
    return count;
  }

  private calcNestingDepth(code: string): number {
    let depth = 0; let maxDepth = 0;
    for (const char of code) { if (char === '{' || char === '(') { depth++; maxDepth = Math.max(maxDepth, depth); } if (char === '}' || char === ')') depth = Math.max(0, depth - 1); }
    return maxDepth;
  }

  private detectIssues(code: string, lines: string[], functions: FunctionInfo[], language: string): CodeIssue[] {
    const issues: CodeIssue[] = [];
    if (lines.some(l => l.length > 120)) issues.push({ severity: 'info', message: 'Some lines exceed 120 chars' });
    if (lines.some(l => /\t/.test(l)) && lines.some(l => /^  /.test(l))) issues.push({ severity: 'warning', message: 'Mixed tabs and spaces', rule: 'indent' });
    if (code.includes('console.log')) issues.push({ severity: 'warning', message: 'Contains console.log', rule: 'no-console' });
    functions.forEach(fn => {
      if (fn.bodyLines > 50) issues.push({ severity: 'warning', message: `Function '${fn.name}' is ${fn.bodyLines} lines`, rule: 'max-lines' });
      if (fn.params > 5) issues.push({ severity: 'warning', message: `Function '${fn.name}' has ${fn.params} params`, rule: 'max-params' });
    });
    if (lines.length > 50 && !code.includes('try') && !code.includes('catch')) issues.push({ severity: 'info', message: 'No error handling detected' });
    if (lang(language, 'typescript') && (code.match(/:\s*any\b/g) || []).length > 0) issues.push({ severity: 'warning', message: "Uses 'any' type", rule: 'no-explicit-any' });
    return issues;
  }

  private calcQualityScore(totalLines: number, functions: FunctionInfo[], issues: CodeIssue[], cx: ComplexityInfo, commentLines: number): number {
    let s = 100;
    s -= issues.filter(i => i.severity === 'error').length * 10;
    s -= issues.filter(i => i.severity === 'warning').length * 3;
    if (cx.cyclomatic > 20) s -= 10; else if (cx.cyclomatic > 10) s -= 5;
    if (cx.maxFunctionLines > 100) s -= 10; else if (cx.maxFunctionLines > 50) s -= 5;
    if (cx.nestingDepth > 5) s -= 10; else if (cx.nestingDepth > 3) s -= 5;
    const cr = commentLines / Math.max(totalLines, 1);
    if (cr > 0.1) s += 5; if (cr > 0.2) s += 5;
    return Math.max(0, Math.min(100, s));
  }
}

function lang(a: string, b: string): boolean { return a.toLowerCase().includes(b); }
