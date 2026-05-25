import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Logger } from '../telemetry/logger.js';

describe('Logger', () => {
  let logs: string[] = [];

  beforeEach(() => {
    logs = [];
    Logger.clearOutputs();
    Logger.configure({ minLevel: 'debug' });
    Logger.addOutput((entry) => {
      logs.push(`[${entry.level}] ${entry.tag}: ${entry.message}`);
    });
  });

  afterEach(() => {
    Logger.clearOutputs();
    Logger.configure({ minLevel: 'info' });
  });

  it('should create a logger with a tag', () => {
    const logger = new Logger('test');
    expect(logger).toBeDefined();
  });

  it('should log at different levels', () => {
    const logger = new Logger('test-levels');
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    expect(logs.filter(l => l.includes('[debug]')).length).toBe(1);
    expect(logs.filter(l => l.includes('[info]')).length).toBe(1);
    expect(logs.filter(l => l.includes('[warn]')).length).toBe(1);
    expect(logs.filter(l => l.includes('[error]')).length).toBe(1);
  });

  it('should respect min log level', () => {
    Logger.configure({ minLevel: 'warn' });
    const logger = new Logger('test-level');
    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('visible');
    logger.error('visible');

    expect(logs.filter(l => l.includes('hidden')).length).toBe(0);
    expect(logs.filter(l => l.includes('visible')).length).toBe(2);
  });

  it('should include structured data', () => {
    const logger = new Logger('test-data');
    logger.info('with data', { key: 'value', count: 42 });
    expect(logs.some(l => l.includes('with data'))).toBe(true);
  });

  it('should create child logger', () => {
    const parent = new Logger('parent');
    const child = parent.child('sub');
    expect(child).toBeDefined();
    child.info('child message');
    expect(logs.some(l => l.includes('parent:sub'))).toBe(true);
  });
});
