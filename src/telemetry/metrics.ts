/**
 * EvoAgent — 指标收集系统
 *
 * 轻量级内存指标，用于：
 * - 监控 Agent Loop 性能
 * - 追踪工具调用统计
 * - 网关健康检查数据
 *
 * 生产环境可对接 OpenTelemetry / Prometheus
 */

export interface Counter {
  name: string;
  value: number;
  labels: Record<string, string>;
  lastUpdated: number;
}

export interface Histogram {
  name: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  buckets: Map<string, number>;  // e.g., "le_100ms" → count
  labels: Record<string, string>;
}

export interface Gauge {
  name: string;
  value: number;
  labels: Record<string, string>;
  lastUpdated: number;
}

export class MetricsCollector {
  private counters = new Map<string, Counter>();
  private histograms = new Map<string, Histogram>();
  private gauges = new Map<string, Gauge>();
  private static instance: MetricsCollector | null = null;

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /** 计数器：记录事件发生次数 */
  incrementCounter(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += value;
      existing.lastUpdated = Date.now();
    } else {
      this.counters.set(key, { name, value, labels, lastUpdated: Date.now() });
    }
  }

  /** 直方图：记录耗时分布 */
  recordDuration(name: string, durationMs: number, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const existing = this.histograms.get(key);
    if (existing) {
      existing.count++;
      existing.sum += durationMs;
      existing.min = Math.min(existing.min, durationMs);
      existing.max = Math.max(existing.max, durationMs);
    } else {
      this.histograms.set(key, {
        name,
        count: 1,
        sum: durationMs,
        min: durationMs,
        max: durationMs,
        buckets: new Map(),
        labels
      });
    }
  }

  /** 计时器：自动记录代码块耗时 */
  timer(name: string, labels: Record<string, string> = {}): { end: () => number } {
    const start = performance.now();
    return {
      end: () => {
        const duration = performance.now() - start;
        this.recordDuration(name, duration, labels);
        return duration;
      }
    };
  }

  /** 仪表盘：记录当前值 */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const existing = this.gauges.get(key);
    if (existing) {
      existing.value = value;
      existing.lastUpdated = Date.now();
    } else {
      this.gauges.set(key, { name, value, labels, lastUpdated: Date.now() });
    }
  }

  /** 获取所有指标快照 */
  snapshot(): {
    counters: Counter[];
    histograms: Histogram[];
    gauges: Gauge[];
    timestamp: number;
  } {
    return {
      counters: Array.from(this.counters.values()),
      histograms: Array.from(this.histograms.values()),
      gauges: Array.from(this.gauges.values()),
      timestamp: Date.now()
    };
  }

  /** 重置所有指标 */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  private key(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }
}

// ─── 预定义指标名称 ──────────────────────────────────

export const MetricNames = {
  // Agent Loop
  AGENT_ITERATIONS: 'evoagent.agent.iterations',
  AGENT_DURATION_MS: 'evoagent.agent.duration_ms',
  AGENT_ERRORS: 'evoagent.agent.errors',

  // LLM
  LLM_REQUESTS: 'evoagent.llm.requests',
  LLM_TOKENS_INPUT: 'evoagent.llm.tokens_input',
  LLM_TOKENS_OUTPUT: 'evoagent.llm.tokens_output',
  LLM_DURATION_MS: 'evoagent.llm.duration_ms',
  LLM_ERRORS: 'evoagent.llm.errors',
  LLM_RETRIES: 'evoagent.llm.retries',

  // Tools
  TOOL_CALLS: 'evoagent.tool.calls',
  TOOL_DURATION_MS: 'evoagent.tool.duration_ms',
  TOOL_ERRORS: 'evoagent.tool.errors',

  // Memory
  MEMORY_SEARCHES: 'evoagent.memory.searches',
  MEMORY_STORES: 'evoagent.memory.stores',

  // Gateway
  GATEWAY_REQUESTS: 'evoagent.gateway.requests',
  GATEWAY_WS_CONNECTIONS: 'evoagent.gateway.ws_connections',
  GATEWAY_SESSIONS: 'evoagent.gateway.sessions',
  GATEWAY_ERRORS: 'evoagent.gateway.errors'
} as const;
