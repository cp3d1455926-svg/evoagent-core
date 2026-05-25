# EvoAgent

> 融合 OpenClaw 架构、Hermes 记忆系统与 Claude Code 代码能力的 AI Agent

## 安装

```bash
npm install evoagent-core@0.3.0
```

可选依赖（用于 SQLite 持久化）：
```bash
npm install better-sqlite3
```

## 快速开始

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
import { AgentLoop, OpenAIClient, MemorySystem, ToolExecutor, DefaultPermissionSystem, ContextCompressor, FailoverClient, createAgent } from 'evoagent/core';

// 方式一：手动组装
const agent = new AgentLoop({
  llm: new OpenAIClient({ apiKey: 'sk-...', model: 'gpt-4o' }),
  memory: new MemorySystem(),
  permissions: new DefaultPermissionSystem({ mode: 'auto' }),
  tools: new ToolExecutor(),
  compressor: new ContextCompressor({ maxTokens: 100000, softThreshold: 0.8 }),
  maxIterations: 20,
  thinkingMode: false,
  maxRetries: 3,
  retryDelayMs: 1000,
});

const result = await agent.run('你的任务', tools, '系统提示词', (chunk) => {
  process.stdout.write(chunk);
});

// 方式二：使用工厂函数（推荐）
const agent2 = createAgent({
  model: 'LongCat-2.0-Preview',
  thinking: false,
  permissionMode: 'auto',
  fallbacks: [
    { provider: 'openai', apiKey: 'sk-backup...', model: 'gpt-4o-mini' },
  ],
});

// 方式三：多模型 Failover
const failoverLLM = new FailoverClient({
  primary: { provider: 'openai', apiKey: 'sk-...', model: 'gpt-4o' },
  fallbacks: [
    { provider: 'openai', apiKey: 'sk-backup...', model: 'gpt-4o-mini' },
  ],
});
```

## 架构

```
┌─────────────────────────────────────────────────┐
│                  EvoAgent                       │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  CLI     │  │ Gateway  │  │  MCP     │      │
│  │ (终端)   │  │ (HTTP/WS)│  │ Server   │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       │              │              │            │
│  ┌────▼──────────────▼──────────────▼─────┐     │
│  │           Agent Loop (核心循环)         │     │
│  │  输入→上下文→LLM→工具→输出→记忆固化    │     │
│  └────┬──────────────────────────────┬────┘     │
│       │                              │          │
│  ┌────▼─────┐  ┌──────────┐  ┌─────▼─────┐    │
│  │ 记忆系统 │  │ 工具系统 │  │ 权限系统  │    │
│  │ 四层     │  │ 7种内置  │  │ 七模式    │    │
│  └──────────┘  └──────────┘  └───────────┘    │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │           LLM 客户端层                   │   │
│  │  Anthropic │ OpenAI │ LongCat │ Failover│   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## 特性

### 🔄 Agent Loop
参考 Claude Code 的核心控制循环，支持：
- 流式输出（SSE）
- 工具调用并行执行
- 指数退避重试
- 最大迭代次数限制

### 🧠 四层记忆系统
| 层级 | 类 | 说明 |
|------|-----|------|
| 短期 | `WorkingMemory` | 滑动窗口，重要性标记，自动裁剪 |
| 长期 | `LongTermMemory` | TF-IDF 语义检索，中英文支持 |
| 技能 | `SkillMemory` | 可复用操作模板库，自动学习 |
| 事件 | `EpisodicMemory` | 带时间戳日志，SQLite 持久化 |

### 🔧 内置工具
| 工具 | 说明 | 权限 |
|------|------|------|
| `bash` | Shell 命令执行 | execute |
| `file` | 文件读写编辑删除 | write |
| `code` | 代码分析/重构/生成/检测 | execute |
| `web` | 网页搜索(DuckDuckGo)/抓取 | network |
| `git` | Git 操作 | write |
| `mcp` | MCP 工具调用 | execute |

### 🔐 七种权限模式
- `default` — 写操作需确认
- `bypass` — 全部自动批准
- `plan` — 只读模式
- `auto` — 基于风险评分自动决策
- `sandbox` — 沙箱执行
- `approvelist` — 白名单机制
- `escalate` — 高风险操作升级人工

### 🌐 多渠道
- **CLI** — 终端交互式/单次任务
- **Gateway** — HTTP REST + WebSocket + Web 仪表台
- **MCP** — MCP 协议，兼容 Claude Desktop/Cursor
- **飞书** — WebSocket 长连接（开发中）

## 配置

### 方式一：交互式向导（推荐）

```bash
evoagent setup
```

向导会引导你配置：
1. **LLM 提供商** — provider、model、API key、base URL
2. **飞书渠道** — App ID、App Secret、DM/群聊策略
3. **记忆设置** — 长期记忆后端、事件存储、技能自动学习
4. **权限模式** — default/bypass/plan/auto
5. **高级选项** — 最大迭代次数、思考模式、日志级别

配置保存到 `~/.evoagent/config.yaml`。

### 方式二：环境变量

```bash
export OPENAI_API_KEY="sk-..."
export LONGCAT_API_KEY="..."
export FEISHU_APP_ID="cli_xxx"
export FEISHU_APP_SECRET="xxx"
```

### 方式三：代码配置

```typescript
import { createAgent } from 'evoagent/core';

const agent = createAgent({
  model: 'gpt-4o',
  permissionMode: 'auto',
  maxIterations: 50,
  thinking: false,
  fallbacks: [
    { provider: 'openai', apiKey: 'sk-backup...', model: 'gpt-4o-mini' },
  ],
});
```

### 飞书配置说明

1. 在 [飞书开放平台](https://open.feishu.cn/app) 创建自建应用
2. 获取 App ID 和 App Secret
3. 开启机器人能力
4. 配置权限（im:message:receive_v1、im:message:send_as_bot 等）
5. 发布应用

```yaml
# ~/.evoagent/config.yaml
channels:
  feishu:
    enabled: true
    appId: cli_xxxxxxxxxx
    appSecret: xxxxxxxxxxxxxxxx
    domain: feishu           # 国内飞书用 feishu，海外 Lark 用 lark
    dmPolicy: pairing        # open/pairing/allowlist/disabled
    groupPolicy: open        # open/allowlist/disabled
    requireMention: true     # 群聊中是否需要 @机器人 才触发
```

### 记忆迁移

从其他 Agent 系统导入记忆：

```typescript
import { MemoryImporter } from 'evoagent/importer';

// 从 OpenClaw 工作区迁移
await MemoryImporter.fromOpenClaw('~/.openclaw/workspace', agent.memory);

// 从 mem0 迁移
await MemoryImporter.fromMem0({ apiKey: '...', userId: '...' }, agent.memory);

// 从 JSON 文件迁移
await MemoryImporter.fromJSON('./memories.json', agent.memory);

// 从 SQLite 迁移
await MemoryImporter.fromSQLite('./old-agent.db', agent.memory);

// 从 CSV 迁移
await MemoryImporter.fromCSV('./memories.csv', agent.memory);
```

## 许可证

MIT
