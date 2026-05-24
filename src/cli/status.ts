/* eslint-disable no-console */
/**
 * EvoAgent - Status display
 */

export function showStatus(): void {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);

  console.log('');
  console.log('========================================');
  console.log('  EvoAgent v0.2.0');
  console.log('========================================');
  console.log('  Node:      ' + process.version);
  console.log('  Platform:  ' + process.platform + ' (' + process.arch + ')');
  console.log('  Heap:      ' + heapMB + ' MB');
  console.log('  RSS:       ' + rssMB + ' MB');
  console.log('  Uptime:    ' + Math.round(process.uptime()) + 's');
  console.log('');
  console.log('  Channels:  CLI, Gateway, MCP, Feishu');
  console.log('  Memory:    Working + LongTerm + Skill + Episodic');
  console.log('  Tools:     bash, file, code, web, git, mcp');
  console.log('  LLM:       Anthropic, OpenAI, LongCat, Failover');
  console.log('========================================');
  console.log('');
}
