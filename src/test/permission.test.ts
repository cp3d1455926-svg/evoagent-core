import { describe, it, expect } from 'vitest';
import { DefaultPermissionSystem } from '../core/permission.js';

describe('DefaultPermissionSystem', () => {
  it('bypass mode allows everything', async () => {
    const ps = new DefaultPermissionSystem({ mode: 'bypass' });
    expect(await ps.check('bash', {})).toBe(true);
    expect(await ps.check('delete', {})).toBe(true);
    expect(await ps.check('deploy', {})).toBe(true);
  });

  it('plan mode blocks write tools', async () => {
    const ps = new DefaultPermissionSystem({ mode: 'plan' });
    expect(await ps.check('bash', {})).toBe(false);
    expect(await ps.check('write', {})).toBe(false);
    expect(await ps.check('read', {})).toBe(true);
    expect(await ps.check('search', {})).toBe(true);
  });

  it('approvelist mode only allows whitelisted tools', async () => {
    const ps = new DefaultPermissionSystem({ mode: 'approvelist', allowedTools: ['read', 'search'] });
    expect(await ps.check('read', {})).toBe(true);
    expect(await ps.check('search', {})).toBe(true);
    expect(await ps.check('bash', {})).toBe(false);
  });

  it('escalate mode blocks high-risk tools', async () => {
    const ps = new DefaultPermissionSystem({ mode: 'escalate' });
    expect(await ps.check('delete', {})).toBe(false);
    expect(await ps.check('deploy', {})).toBe(false);
    expect(await ps.check('bash', {})).toBe(false);
    expect(await ps.check('read', {})).toBe(true);
  });

  it('auto mode uses risk scoring', async () => {
    const ps = new DefaultPermissionSystem({ mode: 'auto' });
    expect(await ps.check('read', {})).toBe(true);
    expect(await ps.check('search', {})).toBe(true);
    expect(await ps.check('bash', {})).toBe(false); // risk 0.7 >= 0.7
  });

  it('sandbox mode allows all', async () => {
    const ps = new DefaultPermissionSystem({ mode: 'sandbox' });
    expect(await ps.check('bash', {})).toBe(true);
    expect(await ps.check('delete', {})).toBe(true);
  });

  it('setMode changes mode', async () => {
    const ps = new DefaultPermissionSystem({ mode: 'bypass' });
    expect(ps.getMode()).toBe('bypass');
    ps.setMode('plan');
    expect(ps.getMode()).toBe('plan');
    expect(await ps.check('bash', {})).toBe(false);
  });
});
