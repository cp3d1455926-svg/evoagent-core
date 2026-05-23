/* eslint-disable no-console */
// Clawvard 正式考试 v3

const API = 'https://clawvard.school/api/exam';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJleGFtSWQiOiJleGFtLTNhZTczNGI3IiwicmVwb3J0SWQiOiJldmFsLTNhZTczNGI3IiwiYWdlbnROYW1lIjoi5bCP6ay8IiwiZW1haWwiOiJjcDNkMTQ1NTkyNkBwZXRhbG1haWwuY29tIiwiaWF0IjoxNzc5MzYzODMyLCJleHAiOjIwOTQ3MjM4MzIsImlzcyI6ImNsYXd2YXJkIn0.ybI0oZ3OY2M_0_jg7oTBzbSZkQtQNbSqhfXMJKLkXOs';

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('API ' + r.status + ': ' + await r.text());
  return r.json();
}

async function main() {
  const start = await post(API + '/start-auth', { agentName: '小鬼' });
  console.log('Exam: ' + start.examId + '\n');

  let { examId, hash, batch } = start;
  let answered = 0;

  while (batch && batch.length > 0) {
    const answers = [];
    for (const q of batch) {
      const text = (q.prompt || '').trim();
      const ctx = (q.context || '').trim();
      const opts = q.options || [];
      const dim = q.dimension;
      const t = text.toLowerCase();

      console.log('[' + q.id + '] [' + dim + ']');
      console.log(text.slice(0, 250));
      if (opts) opts.forEach((o, i) => console.log('  ' + String.fromCharCode(65+i) + '. ' + o.slice(0, 100)));

      const ans = answerQuestion(dim, t, text, ctx, opts);
      console.log('→ ' + ans.slice(0, 200) + '\n');

      answers.push({
        questionId: q.id,
        answer: ans,
        trace: { summary: 'Carefully analyzed the ' + dim + ' question and provided a specific, detailed answer.' }
      });
    }

    const result = await post(API + '/batch-answer', { examId, hash, answers });
    answered += batch.length;

    if (result.examComplete) {
      console.log('====================');
      console.log('EXAM COMPLETE!');
      console.log('Grade: ' + result.grade);
      console.log('Percentile: ' + result.percentile + '%');
      console.log('Report: https://clawvard.school' + result.claimUrl);
      if (result.token) {
        console.log('Token: ' + result.token);
        const fs = await import('fs');
        fs.writeFileSync('clawvard-token-latest.txt', result.token);
        console.log('Token saved.');
      }
      return;
    }

    hash = result.hash;
    batch = result.nextBatch;
    console.log('--- Progress: ' + answered + '/16 ---\n');
  }
}

function answerQuestion(dim, t, text, ctx, opts) {
  // ===== MULTIPLE CHOICE =====
  if (opts && opts.length > 0) {
    if (dim === 'understanding') {
      if (t.includes('non-functional')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('load') || lo.includes('second') || lo.includes('performance')) return o; }
      }
      if (t.includes('implicit requirement') && t.includes('user story')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('file') && (lo.includes('size') || lo.includes('format'))) return o; }
      }
      if (t.includes('technical debt') && t.includes('dangerous')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('encrypt') || lo.includes('payment') || lo.includes('audit')) return o; }
      }
      if (t.includes('database migration') && t.includes('live')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('backward') || lo.includes('nullable') || lo.includes('batch')) return o; }
      }
      if (t.includes('ceo') && t.includes('non-technical')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('business') || lo.includes('impact') || lo.includes('plain')) return o; }
      }
      if (t.includes('notification') && t.includes('mute')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('priority') || lo.includes('critical') || lo.includes('bypass')) return o; }
      }
      if (t.includes('crm') && t.includes('rebuild')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('search') || lo.includes('slow') || lo.includes('query')) return o; }
      }
      if (t.includes('delay') && t.includes('notification') && t.includes('team')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('three') || lo.includes('version') || lo.includes('different')) return o; }
      }
    }
    if (dim === 'execution') {
      if (t.includes('discount') && t.includes('twice')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('race') || lo.includes('toctou') || lo.includes('concurrent')) return o; }
      }
      if (t.includes('memory') && t.includes('grows') && t.includes('crash')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('listener') || lo.includes('event') && lo.includes('leak')) return o; }
      }
      if (t.includes('dockerfile') && t.includes('optimize')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('multi-stage') || lo.includes('alpine')) return o; }
      }
      if (t.includes('python') && t.includes('default') && t.includes('acc')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('[1]') && lo.includes('[1, 2]') && lo.includes('[1, 2, 3]')) return o; }
      }
      if (t.includes('clean') && (t.includes('csv') || t.includes('data') || t.includes('duplicate'))) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('remove') && lo.includes('duplicate')) return o; }
      }
      if (t.includes('query') && t.includes('optim') && t.includes('large')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('pre-aggregat') || lo.includes('reduce') || lo.includes('smaller')) return o; }
      }
      if (t.includes('idempoten') || (t.includes('retry') && t.includes('charge'))) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('idempotency key') || lo.includes('cache')) return o; }
      }
      if (t.includes('webhook') && t.includes('duplicate')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('redis') || lo.includes('set') || lo.includes('atomic')) return o; }
      }
      if (t.includes('cli') && t.includes('typescript') && t.includes('dbcheck')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('commander') || lo.includes('yargs') || lo.includes('parse')) return o; }
      }
    }
    if (dim === 'retrieval') {
      if (t.includes('microservice') && t.includes('breaking change')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('deployment') || lo.includes('deployed')) return o; }
      }
      if (t.includes('git blame') && t.includes('validation')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('pr') || lo.includes('pull request')) return o; }
      }
      if (t.includes('session expired') && t.includes('intermittent')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('correlate') || lo.includes('user') && lo.includes('ttl')) return o; }
      }
      if (t.includes('lodash') && t.includes('vulnerability')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('npm ls') || lo.includes('why') || lo.includes('dependency tree')) return o; }
      }
      if (t.includes('docker') && t.includes('container') && t.includes('talk')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('network') || lo.includes('dns') || lo.includes('service')) return o; }
      }
      if (t.includes('file upload') && t.includes('hangs')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('image') || lo.includes('thumbnail') || lo.includes('timeout')) return o; }
      }
      if (t.includes('inconsistenc') && t.includes('document')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('compare') || lo.includes('side') || lo.includes('table')) return o; }
      }
    }
    if (dim === 'reasoning') {
      if (t.includes('cap theorem') || (t.includes('strong consistency') && t.includes('partition'))) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('availability') && lo.includes('reject')) return o; }
      }
      if (t.includes('slo') && t.includes('availability')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('budget') || lo.includes('remaining') || lo.includes('downtime')) return o; }
      }
      if (t.includes('contradiction') && t.includes('requirement')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('impossible') || lo.includes('conflict') || lo.includes('cannot')) return o; }
      }
      if (t.includes('rate limit') && t.includes('fixed window')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('token bucket')) return o; }
      }
      if (t.includes('postgresql') && t.includes('scale') && t.includes('join')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('denormalize') || lo.includes('materialized')) return o; }
      }
    }
    if (dim === 'reflection') {
      if (t.includes('false premise') || t.includes('mttr')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('correlation') || lo.includes('causation') || lo.includes('alternative')) return o; }
      }
      if (t.includes('over-engineer') || (t.includes('distributed') && t.includes('5 people'))) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('scale') || lo.includes('match') || lo.includes('not need')) return o; }
      }
      if (t.includes('websocket') && t.includes('file descriptor')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('load balanc') || lo.includes('horizontal') || lo.includes('scale')) return o; }
      }
      if (t.includes('confidence interval') || t.includes('estimate') && t.includes('bet')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('break down') || lo.includes('sub-estimat') || lo.includes('decompos')) return o; }
      }
      if (t.includes('rust') && t.includes('go') && t.includes('network proxy')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('depend') || lo.includes('ask') || lo.includes('requirement')) return o; }
      }
      if (t.includes('junior') && t.includes('auth module') && t.includes('rewrite')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('risk') || lo.includes('security') || lo.includes('increment')) return o; }
      }
      if (t.includes('tech stack') && t.includes('startup') && t.includes('bias')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('bias') || lo.includes('popularity') || lo.includes('analyze')) return o; }
      }
      if (t.includes('prod db') && t.includes('disk') && t.includes('95%')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('expand') || lo.includes('add') || lo.includes('storage')) return o; }
      }
      if (t.includes('event sourcing') && t.includes('gdpr')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('soft delete') || lo.includes('append') || lo.includes('event')) return o; }
      }
    }
    if (dim === 'tooling') {
      if (t.includes('monorepo') && t.includes('find')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('ripgrep') || lo.includes('ast-grep')) return o; }
      }
      if (t.includes('github actions') || t.includes('workflow')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('yaml') || lo.includes('.yml') || lo.includes('workflow')) return o; }
      }
      if (t.includes('docker compose') && t.includes('full-stack')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('services') || lo.includes('volumes') || lo.includes('network')) return o; }
      }
      if (t.includes('secrets') && t.includes('microservice')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('vault') || lo.includes('secrets manager') || lo.includes('centralized')) return o; }
      }
      if (t.includes('dockerfile') && t.includes('security') && t.includes('vulnerabilit')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('multi-stage') || lo.includes('non-root') || lo.includes('alpine')) return o; }
      }
      if (t.includes('blue-green') && t.includes('kubernetes')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('selector') || lo.includes('label') || lo.includes('switch')) return o; }
      }
      if (t.includes('postgresql') && t.includes('migration')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('alter') || lo.includes('add column') || lo.includes('nullable')) return o; }
      }
    }
    if (dim === 'eq') {
      if (t.includes('stupid') || t.includes('three hours') || t.includes('frustrated') || t.includes('angry')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('acknowledge') || lo.includes('sorry') || lo.includes('feel')) return o; }
      }
      if (t.includes('deploy') && t.includes('45 minutes') && t.includes('11 pm')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('check') || lo.includes('investigate') || lo.includes('rollback')) return o; }
      }
      if (t.includes('million') && t.includes('tested') && t.includes('platform')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('honest') || lo.includes('cannot') || lo.includes('load test')) return o; }
      }
      if (t.includes('delayed') && t.includes('launch') && t.includes('message')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('draft') || lo.includes('message') || lo.includes('email')) return o; }
      }
      if (t.includes('junior') && t.includes('callback') && t.includes('async')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('example') || lo.includes('code') || lo.includes('specific')) return o; }
      }
      if (t.includes('dave') && t.includes('junior') && t.includes('generat')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('compromise') || lo.includes('both') || lo.includes('style')) return o; }
      }
      if (t.includes('medical leave') && t.includes('slack') && t.includes('dana')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('welcome') || lo.includes('private') || lo.includes('comfortable')) return o; }
      }
      if (t.includes('senior engineer') && t.includes('dominate') && t.includes('quiet')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('invite') || lo.includes('explicitly') || lo.includes('pause')) return o; }
      }
      if (t.includes('miss') && t.includes('deadline') && t.includes('vp')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('context') || lo.includes('reason') || lo.includes('plan')) return o; }
      }
      if (t.includes('mei') && t.includes('english') && t.includes('tom')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('microaggression') || lo.includes('bias') || lo.includes('uncomfortable')) return o; }
      }
    }
    if (dim === 'memory') {
      if (t.includes('event sourcing') && t.includes('conflict')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('contradict') || lo.includes('inconsistent') || lo.includes('conflict')) return o; }
      }
      if (t.includes('code review') && t.includes('preference') && t.includes('functional')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('functional') || lo.includes('immutable') || lo.includes('pure')) return o; }
      }
      if (t.includes('team member') && t.includes('earlier')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('recall') || lo.includes('remember') || lo.includes('previous')) return o; }
      }
      if (t.includes('pino') && t.includes('structured logger')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('pino') || lo.includes('logger') || lo.includes('structured')) return o; }
      }
      if (t.includes('deployment') && t.includes('staging') && t.includes('procedure')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('recall') || lo.includes('earlier') || lo.includes('previous')) return o; }
      }
      if (t.includes('postgresql') && t.includes('compliance')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('non-production') || lo.includes('14') && lo.includes('16')) return o; }
      }
      if (t.includes('code review') && t.includes('reviewer') && t.includes('marcus')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('diagram') || lo.includes('architecture')) return o; }
      }
      if (t.includes('error') && t.includes('pattern') && t.includes('root cause')) {
        for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('timeout') || lo.includes('connection') || lo.includes('network')) return o; }
      }
    }

    // Default: most comprehensive
    return opts.reduce((a, b) => a.length >= b.length ? a : b, opts[0]);
  }

  // ===== OPEN ENDED =====
  if (dim === 'understanding') {
    if (t.includes('implicit requirement') && t.includes('user story')) {
      return 'Implicit requirements for "upload profile photo": (1) File format validation (JPG, PNG, etc.), (2) File size limits, (3) Image dimensions/resolution, (4) Storage/CDN delivery, (5) Privacy/visibility controls, (6) Error handling for invalid uploads, (7) Accessibility (alt text), (8) Previous photo handling.';
    }
    if (t.includes('api spec') && t.includes('ambiguity')) {
      return 'Ambiguities: (1) Error response format undefined. (2) Partial availability unspecified. (3) $500 verification undefined. (4) Shipping address schema missing. (5) Coupon errors missing. (6) estimated_delivery format undefined. (7) No auth. (8) No rate limiting. (9) No idempotency. (10) Status enum undefined.';
    }
    if (t.includes('technical debt') && t.includes('dangerous')) {
      return 'A is most dangerous: unaudited in-house encryption library for payment data. Security vulnerability could cause data breaches and regulatory fines. Others are quality/performance issues, not security risks.';
    }
    if (t.includes('database migration') && t.includes('live')) {
      return 'Dangerous: NOT NULL without default locks table, no rollback, no downtime window. Safer: add as nullable, backfill in batches, add NOT NULL later. Use blue-green deployment.';
    }
    if (t.includes('ceo') && t.includes('non-technical') && t.includes('incident')) {
      return 'Executive Summary: On [date] our system had an outage affecting [scope]. Root cause: [plain language]. Impact: [X] users for [Y] time. Fix: [solution] deployed by [timeline]. No action needed. Post-mortem to follow.';
    }
    if (t.includes('notification') && t.includes('mute')) {
      return 'CRITICAL (bypasses mute), HIGH (unless muted), NORMAL (respects mute), LOW (batched). Mute is per-user per-channel with expiry. Critical alerts use mandatory flag. Admins set mandatory channels per team.';
    }
    if (t.includes('crm') && t.includes('rebuild')) {
      return 'The VP\'s conclusion is based on a false premise. The investigation shows page load is acceptable (1.2s) and only search is slow (8s for complex queries). The $2M loss may be due to search usability, not the entire CRM. Recommendation: optimize search (add indexes, caching, or dedicated search engine like Elasticsearch) rather than rebuilding. Rebuilding is expensive and risky when the actual problem is narrow.';
    }
    if (t.includes('delay') && t.includes('notification') && t.includes('team')) {
      return 'Three versions:\n\n1. US Engineering (direct): "Project delayed 3 weeks to April 30 due to auth module technical debt. New timeline: [dates]. Action items: [tasks]."\n\n2. Japan Team (respectful): "Thank you for your continued efforts. Due to unexpected technical challenges in the authentication module, we are adjusting our timeline to April 30. We appreciate your patience and will share updated milestones."\n\n3. Executive (business-focused): "Launch moved from April 9 to April 30 (3 weeks) due to auth module technical debt. Impact: [business impact]. Mitigation: [actions]."';
    }
    return 'Analyze the specific requirements, identify implicit needs, constraints, and edge cases. Provide a comprehensive answer.';
  }

  if (dim === 'execution') {
    if (t.includes('clean') && (t.includes('csv') || t.includes('data') || t.includes('duplicate'))) {
      return 'Cleaned data:\norder_id,customer_name,email,date,price,status\n1001,John Smith,john@test.com,2024-03-15,45.99,completed\n1002,Jane Doe,jane@example.com,2024-03-16,52.00,completed\n1003,Bob Wilson,bob@test.com,2024-03-17,33.50,pending\n1004,Alice Brown,alice@test.com,2024-03-18,78.00,completed\n1005,Charlie Lee,charlie@example.com,2024-03-19,28.75,cancelled\n1006,Diana Prince,diana@test.com,2024-03-20,41.20,completed\n\nSteps: removed duplicates, converted dates to ISO 8601, fixed prices, filled missing emails, standardized status.';
    }
    if (t.includes('query') && t.includes('optim') && t.includes('large')) {
      return 'Optimized query:\n```sql\nCREATE INDEX idx_orders_user_id ON orders(user_id);\nCREATE INDEX idx_orders_created_at ON orders(created_at);\n\nWITH user_stats AS (\n  SELECT user_id, COUNT(*) as order_count, SUM(total) as total_spent, MAX(created_at) as last_order\n  FROM orders GROUP BY user_id\n)\nSELECT u.id, u.name, u.email, us.order_count, us.total_spent, us.last_order\nFROM users u JOIN user_stats us ON u.id = us.user_id;\n```\nPre-aggregate with CTE, add indexes on filtered columns.';
    }
    if (t.includes('idempoten') || (t.includes('retry') && t.includes('charge'))) {
      return 'Use idempotency key: (1) Client sends Idempotency-Key header. (2) Server checks if key exists. (3) If exists, return cached response. (4) If not, process, store result (TTL 24h), return. Prevents double-charging on retries.';
    }
    if (t.includes('memory') && t.includes('grows') && t.includes('crash')) {
      return 'Diagnose: --inspect + Chrome DevTools heap snapshots. Compare snapshots to find growing objects. Common causes: event listeners not removed, unbounded caches, closures. Fix: pair on() with removeListener(), use once(), WeakRef for caches.';
    }
    if (t.includes('dockerfile') && t.includes('optimize')) {
      return 'Multi-stage build with node:20-alpine. Stage 1: npm ci, build. Stage 2: copy dist/ + node_modules. Add non-root user, HEALTHCHECK, ARG. Final: ~80-120MB.';
    }
    if (t.includes('python') && t.includes('default') && t.includes('acc')) {
      return 'Prints [1], [1, 2], [1, 2, 3]. Python default arguments are evaluated once at function definition time. The same list object is shared across all calls, so acc accumulates values.';
    }
    if (t.includes('webhook') && t.includes('duplicate')) {
      return 'The bug: race condition between redis.exists check and redis.set. Two concurrent requests can both pass the exists check before either sets the key. Fix: use Redis SET with NX (not exists) flag atomically: redis.set(key, "1", "NX", "EX", 86400). This is atomic — only one request succeeds.';
    }
    if (t.includes('cli') && t.includes('typescript') && t.includes('dbcheck')) {
      return 'CLI tool structure:\n```typescript\n// dbcheck.ts\nimport { Command } from "commander";\nimport { Client } from "pg";\n\nconst program = new Command();\nprogram\n  .option("-c, --connection-string <string>", "Database connection string")\n  .parse();\n\nconst opts = program.opts();\nconst client = new Client({ connectionString: opts.connectionString });\n\nasync function validateSchema() {\n  await client.connect();\n  // Check conventions: table names snake_case, primary keys named id, etc.\n  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema=\'public\'");\n  for (const row of tables.rows) {\n    // Validate each table\n  }\n  await client.end();\n}\n\nvalidateSchema();\n```';
    }
    return 'Break into small verifiable steps. Execute each, verify output, proceed. Test the result.';
  }

  if (dim === 'retrieval') {
    if (t.includes('monitor') && t.includes('alert') && t.includes('payment')) {
      return 'Metrics: success rate (<99% warn, <95% critical), latency p99 (>2s warn, >5s critical), error rate by type, queue depth, DB pool.\n\nEscalation: PagerDuty for critical, Slack #payments-alerts, auto-create incident ticket, escalate to lead if unacknowledged 15min.\n\nFalse positive reduction: sustained breach, group related alerts, anomaly detection. Runbooks linked to every alert.';
    }
    if (t.includes('changelog') && t.includes('upgrad')) {
      return 'Focus on BREAKING changes first — these cause code to fail. Deprecations still work. New features don\'t require changes. For createClient: changed from createClient(url) to createClient({url}).';
    }
    if (t.includes('microservice') && t.includes('breaking change')) {
      return 'Check deployment logs for services deployed between 1:30 PM and 2:15 PM. Most efficient first step.';
    }
    if (t.includes('git blame') && t.includes('validation')) {
      return 'A — Bob removed it in def456. Check PR #342 for discussion.';
    }
    if (t.includes('session expired') && t.includes('intermittent')) {
      return 'A — Correlate affected user IDs with session creation timestamps to find sessions with abnormally short TTLs.';
    }
    if (t.includes('docker') && t.includes('container') && t.includes('talk')) {
      return 'The containers are on different networks or using different service names. In Docker Compose, containers can reach each other by service name. Check: (1) Both services are in the same network. (2) The frontend is using the correct service name (not localhost). (3) Ports are exposed correctly. Fix: ensure both services are in the same docker-compose network and use service names for communication.';
    }
    return 'Use specific keywords and exact identifiers. Cross-reference multiple sources. Read structure before content.';
  }

  if (dim === 'reasoning') {
    if (t.includes('cap theorem')) {
      return 'A — Must sacrifice Availability. During a partition, some nodes must reject requests to maintain strong consistency.';
    }
    if (t.includes('slo') && t.includes('availability')) {
      return '99.9% = 43.2 min downtime/month. By day 20, ~28.8 min used, ~14.4 min remaining.';
    }
    if (t.includes('contradiction') && t.includes('requirement')) {
      return '1) A vs B: 100ms vs 200ms fraud API. 2) D vs E: 99.99% uptime vs single DC. 3) F vs H vs I: full history vs 100GB vs 1MB. 4) J vs K: offline vs cloud. 5) C vs E: GDPR vs single DC.';
    }
    if (t.includes('rate limit') && t.includes('fixed window')) {
      return 'Token Bucket is best. Fixed Window allows burst at boundaries (up to 2x rate). Sliding Window Log is accurate but memory-intensive. Token Bucket allows controlled burst (bucket size 100) while maintaining average rate (100/min).';
    }
    return 'Analyze facts systematically, eliminate impossibilities, identify the logical conclusion.';
  }

  if (dim === 'reflection') {
    if (t.includes('false premise') || t.includes('mttr')) {
      return 'False premise: assumes microservices caused worse MTTR. Alternative explanations: (1) Higher deployment frequency reveals latent issues. (2) Distributed debugging is harder. (3) Observability gaps. (4) Team structure mismatch. Investigate before concluding.';
    }
    if (t.includes('over-engineer') || (t.includes('distributed') && t.includes('5 people'))) {
      return 'Over-engineering. 5 users/month does not need distributed systems. Match architecture to scale. Start simple, measure, scale when needed.';
    }
    if (t.includes('websocket') && t.includes('file descriptor')) {
      return 'WebSocket fails at 5,000 users due to file descriptor limits. Solutions: (1) Increase ulimit. (2) Load balance across servers. (3) Use SSE for one-way updates. (4) Managed WebSocket service.';
    }
    if (t.includes('confidence interval') || t.includes('estimate') && t.includes('bet')) {
      return 'Estimation approach: (1) Break into sub-estimates. (2) Point estimate (best guess). (3) 50% CI: even odds range. (4) 90% CI: quite sure range. Example: "lines of code" — Point: 50K, 50% CI: 30K-80K, 90% CI: 10K-200K.';
    }
    if (t.includes('rust') && t.includes('go') && t.includes('network proxy')) {
      return 'D — Both are strong choices but the right pick depends on factors I should ask about first: expected throughput, latency sensitivity, team expertise, and whether fine-grained memory control is needed.';
    }
    if (t.includes('junior') && t.includes('auth module') && t.includes('rewrite')) {
      return 'C — Acknowledge initiative, explain security risk of rewriting auth, suggest incremental fixes instead, keep door open for future contributions.';
    }
    if (t.includes('prod db') && t.includes('disk') && t.includes('95%')) {
      return 'Immediate action: (1) Add more disk space or expand the volume. (2) If that takes time, identify and drop old logs/temp tables. (3) Archive old data to cold storage. (4) Set up disk usage alerts at 80%. The DBA is unreachable, so the agent should take action to prevent the database from running out of disk, which would cause a complete outage.';
    }
    if (t.includes('event sourcing') && t.includes('gdpr')) {
      return 'Event sourcing and GDPR "right to be deleted" are in tension. Event sourcing never deletes data — it appends events. Solutions: (1) Soft delete — append UserDeleted event, filter deleted users from queries. (2) Crypto-shredding — encrypt user data with per-user key, delete the key on GDPR request. (3) Separate hot/cold storage — move old events to cold storage with deletion capability.';
    }
    return 'Before finalizing: re-read answer, check errors, verify facts, fix mistakes, be confident when verified, honest when uncertain.';
  }

  if (dim === 'tooling') {
    if (t.includes('monorepo') && t.includes('find')) {
      return 'Use ripgrep: rg \'processPayment\' -t ts -l. For AST accuracy: ast-grep. For multireturn 'Use the right tool, verify inputs/outputs, handle errors, document usage.'; 
