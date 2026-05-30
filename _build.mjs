// Minimal build: compile just the changed files using tsx's internal transpiler
import { transformSync } from 'typescript';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';

const SRC = './src';
const OUT = './dist';

function compileDir(dir) {
  for (const entry of readdirSync(dir)) {
    const srcPath = join(dir, entry);
    const relPath = relative(SRC, srcPath);
    const outPath = join(OUT, relPath).replace(/\.ts$/, '.js');
    const outDts = outPath.replace(/\.js$/, '.d.ts');

    if (statSync(srcPath).isDirectory()) {
      mkdirSync(outPath.replace(/\.ts$/, ''), { recursive: true });
      compileDir(srcPath);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      const src = readFileSync(srcPath, 'utf-8');
      const result = transformSync(src, {
        target: 2022,
        module: 100, // NodeNext
        moduleResolution: 100,
        declaration: true,
        sourceMap: true,
        strict: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        paths: {},
      }, srcPath);

      // Write .js
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, result.outputText);

      // Write .d.ts if generated
      if (result.declarationText) {
        writeFileSync(outDts, result.declarationText);
      }

      console.log('  ✓', relPath);
    }
  }
}

console.log('Building...');
mkdirSync(OUT, { recursive: true });
compileDir(SRC);
console.log('Done.');
