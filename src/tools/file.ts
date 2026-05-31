/**
 * EvoAgent — 文件工具
 * 
 * 读取、写入、编辑、删除文件
 */

import { readFile, writeFile, unlink, access, mkdir } from 'fs/promises';
import { constants } from 'fs';
import { dirname } from 'path';
import type { Tool, ToolExecuteResult } from './tool-executor.js';

type FileAction = 'read' | 'write' | 'edit' | 'delete';

interface FileArgs {
  action: FileAction;
  path: string;
  content?: string;
  oldText?: string;
  newText?: string;
}

export class FileTool implements Tool {
  name = 'file';
  description = 'Read, write, edit, or delete files. Actions: read, write, edit (find-replace), delete.';
  permissionLevel = 'write' as const;

  parameters = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'write', 'edit', 'delete'], description: 'File operation to perform' },
      path: { type: 'string', description: 'File path (absolute or relative)' },
      content: { type: 'string', description: 'Content to write (for write action)' },
      oldText: { type: 'string', description: 'Text to find (for edit action)' },
      newText: { type: 'string', description: 'Replacement text (for edit action)' }
    },
    required: ['action', 'path']
  };

  async execute(args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const { action, path, content, oldText, newText } = args as unknown as FileArgs;

    try {
      switch (action) {
        case 'read': {
          const data = await readFile(path, 'utf-8');
          return { content: data, isError: false };
        }

        case 'write': {
          if (content === undefined) {
            return { content: 'Error: "content" is required for write action', isError: true };
          }
          // Auto-create parent directories
          try { await mkdir(dirname(path), { recursive: true }); } catch { /* dir may already exist */ }
          await writeFile(path, content, 'utf-8');
          return { content: `File written: ${path}`, isError: false };
        }

        case 'edit': {
          if (oldText === undefined || newText === undefined) {
            return { content: 'Error: "oldText" and "newText" are required for edit action', isError: true };
          }
          const data = await readFile(path, 'utf-8');
          if (!data.includes(oldText)) {
            return { content: `Error: Text not found in ${path}`, isError: true };
          }
          const updated = data.replace(oldText, newText);
          await writeFile(path, updated, 'utf-8');
          return { content: `File edited: ${path}`, isError: false };
        }

        case 'delete': {
          await access(path, constants.F_OK);
          await unlink(path);
          return { content: `File deleted: ${path}`, isError: false };
        }

        default:
          return { content: `Error: Unknown action "${action}"`, isError: true };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `File error: ${message}`, isError: true };
    }
  }
}
