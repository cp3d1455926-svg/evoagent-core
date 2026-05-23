# EvoAgent

> 融合 OpenClaw 架构、Hermes 记忆系统与 Claude Code 代码能力的 AI Agent

## 安装

```bash
npm install @evoagent/core
```

## 使用

### 命令行

```bash
# 交互式会话
evoagent

# 单次任务
evoagent -p "帮我写一个排序算法"

# 启动网关 + Web 仪表台
evoagent gateway --port 3000

# 查看状态
evoagent status
```

### 编程调用

```typescript
import { AgentLoop, OpenAIClient, MemorySystem, ToolExecutor, DefaultPermissionSystem, ContextCompressor } from '@evoagent/core';

const agent = new AgentLoop({
  llm: new OpenAIClient({ apiKey: 'sk-...', model: 'gpt-4o' }),
  memory: new MemorySystem(),
  permissions: new DefaultPermissionSystem({ mode: 'auto' }),
  tools: new ToolExecutor(),
  compressor: new ContextCompressor({ maxTokens: 100000, softThreshold: 0.8 }),
  maxIterations: 20,
  thinkingMode: false,
});

const result = await agent.run('你的任务', tools, '系统提示词', (chunk) => {
  process.stdout.write(chunk);
});
```

## 特性

- 🔄 **Agent Loop** — 参考 Claude Code 的核心控制循环
- 🧠 **记忆系统** — 短期/长期/情景/技能四层记忆
- 🔧 **工具系统** — bash、file、code、web、git、mcp 内置工具
- 🔐 **权限控制** — bypass/plan/approvelist/escalate/auto/sandbox 六种模式
- 📦 **上下文压缩** — 自动压缩超长上下文
- 🌐 **多渠道** — CLI / 飞书 / MCP / Web 网关

## 许可证

MIT
