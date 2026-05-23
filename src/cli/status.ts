/* eslint-disable no-console */
/**
 * EvoAgent — 状态查看
 */

export function showStatus(): void {
  console.log(`
╔═══════════════════════════════════════╗
║   🧬 EvoAgent Status                  ║
╠═══════════════════════════════════════╣
║   Version:    0.1.0                   ║
║   Status:     Development             ║
║   Node:       ${process.version}              ║
║   Platform:   ${process.platform}             ║
║   Memory:     ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB              ║
╚═══════════════════════════════════════╝
  `);
}
