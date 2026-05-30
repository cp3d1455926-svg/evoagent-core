#!/usr/bin/env node
/**
 * EvoAgent 构建脚本
 * 用 esbuild API 一次性打包所有 .ts 文件，输出到 dist/
 * 替代 tsc，避免 Windows 上 tsc 内存不足被 SIGKILL
 */

import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, writeFileSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const SRC = './src';
const OUT = './dist';

const EXT_DEPS = [
  'commander', 'express', 'ws', 'zod', 'yaml', 'chalk', 'react', 'ink',
  'open', 'hnswlib-node', 'redis', 'pg',
  '@anthropic-ai/sdk', '@larksuiteoapi/node-sdk', '@modelcontextprotocol/sdk',
  'chroma-js', 'rollup',
];

/** 收集所有 .ts 文件（排除 test 和 frontend） */
function collectEntries(dir, base = '', result = []) {
  for (const entry of readdirSync(dir)) {
    const srcPath = join(dir, entry);
    const relPath = base ? join(base, entry) : entry;
    if (statSync(srcPath).isDirectory()) {
      if (entry !== 'test') collectEntries(srcPath, relPath, result);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      if (relPath.includes('gateway/frontend')) continue;
      result.push(srcPath);
    }
  }
  return result;
}

/** 复制静态文件 */
function copyStatic() {
  const dir = join(SRC, 'gateway/frontend');
  if (!existsSync(dir)) return;
  const out = join(OUT, 'gateway/frontend');
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isFile()) {
      mkdirSync(out, { recursive: true });
      copyFileSync(p, join(out, f));
    }
  }
}

async function main() {
  console.log('🔨 Building EvoAgent...\n');

  const entries = collectEntries(SRC);
  console.log(`  ${entries.length} entry points\n`);

  // 一次性打包所有入口
  const result = await esbuild.build({
    entryPoints: entries,
    bundle: true,
    platform: 'node',
    outdir: OUT,
    outbase: SRC,
    format: 'esm',
    sourcemap: true,
    external: EXT_DEPS,
    logLevel: 'warning',
  });

  if (result.errors.length > 0) {
    for (const err of result.errors) console.error(err.text);
    process.exit(1);
  }

  console.log(`  ✓ ${entries.length} files bundled`);

  // 静态文件
  copyStatic();
  console.log('  ✓ Static files copied');

  // 生成精简 package.json
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
  const minimal = {
    name: pkg.name, version: pkg.version, description: pkg.description,
    type: pkg.type, main: pkg.main, bin: pkg.bin, files: pkg.files,
    dependencies: pkg.dependencies, engines: pkg.engines, license: pkg.license,
  };
  writeFileSync(join(OUT, 'package.json'), JSON.stringify(minimal, null, 2) + '\n');
  console.log('  ✓ package.json');

  console.log('\n✅ Build complete!\n');
}

main();
