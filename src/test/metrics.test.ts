import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector, MetricNames } from '../telemetry/metrics.js';

describe('MetricsCollector', () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  it('should be a singleton via getInstance', () => {
    const a = MetricsCollector.getInstance();
    const b = MetricsCollector.getInstance();
    expect(a).toBe(b);
  });

  it('should increment counter', () => {
    metrics.incrementCounter('test.counter', 1);
    metrics.incrementCounter('test.counter', 2);
    const snapshot = metrics.snapshot();
    const counter = snapshot.counters.find(c => c.name === 'test.counter');
    expect(counter).toBeDefined();
    expect(counter!.value).toBe(3);
  });

  it('should record duration', () => {
    metrics.recordDuration('test.duration', 100);
    metrics.recordDuration('test.duration', 200);
    const snapshot = metrics.snapshot();
    const hist = snapshot.histograms.find(h => h.name === 'test.duration');
    expect(hist).toBeDefined();
    expect(hist!.count).toBe(2);
    expect(hist!.sum).toBe(300);
    expect(hist!.min).toBe(100);
    expect(hist!.max).toBe(200);
  });

  it('should time a code block', () => {
    const timer = metrics.timer('test.timer');
    // Simulate some work
    const start = Date.now();
    while (Date.now() - start < 10) { /* busy wait */ }
    const duration = timer.end();
    expect(duration).toBeGreaterThan(0);

    const snapshot = metrics.snapshot();
    const hist = snapshot.histograms.find(h => h.name === 'test.timer');
    expect(hist).toBeDefined();
    expect(hist!.count).toBe(1);
  });

  it('should set gauge', () => {
    metrics.setGauge('test.gauge', 42);
    const snapshot = metrics.snapshot();
    const gauge = snapshot.gauges.find(g => g.name === 'test.gauge');
    expect(gauge).toBeDefined();
    expect(gauge!.value).toBe(42);
  });

  it('should reset all metrics', () => {
    metrics.incrementCounter('test', 1);
    metrics.setGauge('test', 1);
    metrics.recordDuration('test', 1);
    metrics.reset();

    const snapshot = metrics.snapshot();
    expect(snapshot.counters.length).toBe(0);
    expect(snapshot.gauges.length).toBe(0);
    expect(snapshot.histograms.length).toBe(0);
  });

  it('should support labels', () => {
    metrics.incrementCounter('test', 1, { tool: 'bash' });
    metrics.incrementCounter('test', 1, { tool: 'file' });
    const snapshot = metrics.snapshot();
    expect(snapshot.counters.length).toBe(2);
  });

  it('should have predefined metric names', () => {
    expect(MetricNames.AGENT_ITERATIONS).toBe('evoagent.agent.iterations');
    expect(MetricNames.LLM_REQUESTS).toBe('evoagent.llm.requests');
    expect(MetricNames.TOOL_CALLS).toBe('evoagent.tool.calls');
    expect(MetricNames.GATEWAY_REQUESTS).toBe('evoagent.gateway.requests');
  });
});
