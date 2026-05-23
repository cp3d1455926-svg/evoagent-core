/**
 * EvoAgent — 默认配置
 */

export const defaultConfig = {
  agent: {
    name: 'EvoAgent',
    model: 'LongCat-2.0-Preview',
    maxTokens: 128000,
    thinkingMode: false,
    maxIterations: 50
  },

  llm: {
    provider: 'openai' as const,
    baseURL: 'https://api.longcat.chat/openai',
    apiKey: '${LONGCAT_API_KEY}',
    model: 'LongCat-2.0-Preview',
    maxTokens: 8192
  },

  permissions: {
    defaultMode: 'default' as const,
    allowedTools: ['bash', 'code', 'file', 'web', 'mcp', 'feishu_card'],
    sandboxEnabled: false
  },

  memory: {
    working: {
      maxTokens: 4096
    },
    longTerm: {
      provider: 'memory' as const,  // 'chromadb' | 'memory'
      url: 'http://localhost:8000',
      collection: 'evoagent_memory'
    },
    skill: {
      autoEvolve: true,
      minFeedbackForEvolution: 5
    },
    episodic: {
      provider: 'sqlite' as const,  // 'sqlite' | 'postgresql'
      url: 'sqlite://~/.evoagent/episodic.db'
    }
  },

  channels: {
    cli: {
      enabled: true
    },
    feishu: {
      enabled: false,
      appId: '${FEISHU_APP_ID}',
      appSecret: '${FEISHU_APP_SECRET}',
      domain: 'feishu',
      dmPolicy: 'pairing' as const,
      groupPolicy: 'open' as const,
      requireMention: true
    },
    mcp: {
      enabled: false,
      port: 3099
    },
    web: {
      enabled: false,
      port: 3000
    }
  },

  observability: {
    otelEndpoint: 'http://localhost:4317',
    logLevel: 'info' as const
  }
};
