import { execSync } from 'child_process';
const cmds = [
  'git add -A',
  'git commit -m "feat: v0.4.1 - esbuild build script + first-run setup wizard"',
  'git push origin master',
];
for (const cmd of cmds) {
  console.log(`> ${cmd}`);
  try {
    const out = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    if (out) console.log(out.trim());
  } catch (err) {
    console.error(err.stderr?.trim() || err.message);
    process.exit(1);
  }
}
console.log('Done.');
