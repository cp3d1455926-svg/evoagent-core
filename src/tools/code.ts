/**
 * EvoAgent — 代码工具
 * 
 * 代码分析、重构、生成
 */

import type { Tool, ToolExecuteResult } from './tool-executor.js';

interface CodeArgs {
  action: 'analyze' | 'refactor' | 'generate' | 'test';
  language: string;
  code?: string;
  instruction?: string;
  filePath?: string;
}

export class CodeTool implements Tool {
  name = 'code';
  description = 'Code analysis, refactoring, and generation. Actions: analyze, refactor, generate, test.';
  permissionLevel = 'execute' as const;

  parameters = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['analyze', 'refactor', 'generate', 'test'], description: 'Code operation' },
      language: { type: 'string', description: 'Programming language (e.g. typescript, python)' },
      code: { type: 'string', description: 'Source code to process' },
      instruction: { type: 'string', description: 'Natural language instruction for the operation' },
      filePath: { type: 'string', description: 'Path to source file (alternative to code param)' }
    },
    required: ['action', 'language']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action, language, code, instruction } = args as unknown as CodeArgs;

    // 这个工具主要是给 LLM 提供结构化的代码操作上下文
    // 实际代码操作由 LLM 通过 bash + file 工具完成
    switch (action) {
      case 'analyze':
        return {
          content: `[Code Analysis] Language: ${language}\n${instruction ? `Task: ${instruction}\n` : ''}${code ? `Code:\n${code}` : 'No code provided. Use file tool to read source files first.'}`,
          isError: false
        };

      case 'refactor':
        return {
          content: `[Refactor] Language: ${language}\nInstruction: ${instruction || 'No instruction provided'}\nPlan: 1) Read file with file tool 2) Apply changes with file edit 3) Verify with tests`,
          isError: false
        };

      case 'generate':
        return {
          content: `[Generate] Language: ${language}\nInstruction: ${instruction || 'No instruction provided'}\nPlan: 1) Generate code 2) Write with file tool 3) Test with bash tool`,
          isError: false
        };

      case 'test':
        return {
          content: `[Test] Language: ${language}\n${instruction ? `Test: ${instruction}` : 'Run project tests with: npm test / pytest / cargo test'}`,
          isError: false
        };

      default:
        return { content: `Unknown action: ${action}`, isError: true };
    }
  }
}
