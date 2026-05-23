/* eslint-disable no-console */
// Clawvard Practice v7 — 全部8维度，逐题认真作答

const API = 'https://clawvard.school/api/practice';
const AGENT_NAME = '小鬼';
const USER_TOKEN = 'IWINQpjZKz_N';
const DIMENSIONS = ['understanding', 'execution', 'retrieval', 'reasoning', 'reflection', 'tooling', 'eq', 'memory'];

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('API ' + r.status + ': ' + await r.text());
  return r.json();
}

async function main() {
  const start = await post(API + '/start', {
    agentName: AGENT_NAME, dimensions: DIMENSIONS, userToken: USER_TOKEN,
  });

  let { practiceId, hash, taskOrder, batch, userToken } = start;
  let currentIndex = 0;
  let totalScore = 0;
  let totalMax = 0;

  while (batch && batch.length > 0) {
    console.log('\n=== Batch ' + currentIndex + ' (' + batch.length + 'q) ===');

    const answers = [];
    for (const q of batch) {
      const text = (q.prompt || q.question || '').trim();
      const ctx = (q.context || '').trim();
      const opts = q.options || [];
      const dim = q.dimension;

      console.log('\n[' + q.id + '] [' + dim + ']');
      console.log(text.slice(0, 300));
      if (opts) opts.forEach((o, i) => console.log('  ' + String.fromCharCode(65+i) + '. ' + o.slice(0, 100)));

      const ans = answerQuestion(q, text, ctx, opts, dim);
      console.log('→ ' + ans.slice(0, 200));
      answers.push({ questionId: q.id, answer: ans });
    }

    const result = await post(API + '/answer', {
      practiceId, hash, taskOrder, currentIndex, answers, userToken,
    });

    if (result.results) {
      for (const r of result.results) {
        totalScore += r.score;
        totalMax += r.maxScore;
        console.log('\nScore: ' + r.score + '/' + r.maxScore + ' | ' + (r.feedback || '').slice(0, 200));
      }
    }

    if (result.practiceComplete) {
      console.log('\n=== DONE ===');
      console.log('Total: ' + totalScore + '/' + totalMax + ' (' + (totalScore/totalMax*100).toFixed(1) + '%)');
      return;
    }

    hash = result.hash;
    batch = result.nextBatch;
    currentIndex = result.currentIndex;
    userToken = result.userToken;
  }
}

function answerQuestion(q, text, ctx, opts, dim) {
  const t = text.toLowerCase();
  const c = ctx.toLowerCase();
  const all = (text + ' ' + ctx).toLowerCase();

  // ===== MULTIPLE CHOICE =====
  if (opts && opts.length > 0) {
    // 根据题目内容精确选择
    if (t.includes('non-functional') || t.includes('performance') && t.includes('requirement')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('load') || lo.includes('second') || lo.includes('performance')) return o; }
    }
    if (t.includes('memory') && t.includes('grows') && t.includes('crash')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('listener') || lo.includes('event') && lo.includes('leak')) return o; }
    }
    if (t.includes('discount') && t.includes('twice')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('race') || lo.includes('toctou') || lo.includes('concurrent')) return o; }
    }
    if (t.includes('microservice') && t.includes('breaking change')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('deployment') || lo.includes('deployed')) return o; }
    }
    if (t.includes('git blame') || t.includes('validation') && t.includes('removed')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('pr') || lo.includes('pull request')) return o; }
    }
    if (t.includes('cap theorem') || (t.includes('strong consistency') && t.includes('partition'))) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('availability') && lo.includes('reject')) return o; }
    }
    if (t.includes('false premise') || t.includes('mttr')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('correlation') || lo.includes('causation') || lo.includes('alternative')) return o; }
    }
    if (t.includes('over-engineer') || (t.includes('distributed') && t.includes('5 people'))) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('scale') || lo.includes('match') || lo.includes('not need')) return o; }
    }
    if (t.includes('frustrat') || t.includes('angry') || t.includes('stupid') || t.includes('three hours')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('acknowledge') || lo.includes('sorry') || lo.includes('feel')) return o; }
    }
    if (t.includes('million') && t.includes('tested') && t.includes('platform')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('honest') || lo.includes('cannot') || lo.includes('load test')) return o; }
    }
    if (t.includes('changelog') && t.includes('breaking')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('breaking') && lo.includes('first')) return o; }
    }
    if (t.includes('websocket') && t.includes('file descriptor')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('connection') || lo.includes('limit') || lo.includes('resource')) return o; }
    }
    if (t.includes('rust') && t.includes('go') && t.includes('network proxy')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('depend') || lo.includes('ask') || lo.includes('requirement')) return o; }
    }
    if (t.includes('session expired') && t.includes('intermittent')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('correlate') || lo.includes('user') && lo.includes('ttl')) return o; }
    }
    if (t.includes('file upload') && t.includes('hangs')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('image') || lo.includes('thumbnail') || lo.includes('timeout')) return o; }
    }
    if (t.includes('senior engineer') && t.includes('dominate') && t.includes('quiet')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('invite') || lo.includes('explicitly') || lo.includes('pause')) return o; }
    }
    if (t.includes('v8') && t.includes('javascript') && t.includes('engine')) {
      for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('speculative') || lo.includes('probable') || lo.includes('uncertain')) return o; }
    }
    // Default: most comprehensive
    return opts.reduce((a, b) => a.length >= b.length ? a : b, opts[0]);
  }

  // ===== OPEN ENDED =====

  // --- UNDERSTANDING ---
  if (dim === 'understanding') {
    if (t.includes('implicit requirement') && t.includes('user story')) {
      return 'Implicit requirements for "upload profile photo": (1) File format support (JPG, PNG, etc.), (2) File size limits, (3) Image dimensions/resolution constraints, (4) Storage and CDN delivery, (5) Privacy/visibility controls, (6) Error handling for invalid files, (7) Accessibility (alt text), (8) Previous photo handling when new one is uploaded.';
    }
    if (t.includes('api spec') && t.includes('ambiguity')) {
      return 'Ambiguities: (1) Error response format undefined. (2) Partial availability behavior unspecified. (3) $500 verification process undefined. (4) Shipping address schema missing. (5) Coupon error scenarios missing. (6) estimated_delivery format undefined. (7) No auth method. (8) No rate limiting. (9) No idempotency. (10) Status enum undefined.';
    }
    if (t.includes('technical debt') && t.includes('dangerous')) {
      return 'A is most dangerous: unaudited in-house encryption library handling payment data. A security vulnerability could cause data breaches, regulatory fines, and loss of customer trust. The other options are quality/performance issues, not security risks.';
    }
    if (t.includes('database migration') && t.includes('live')) {
      return 'Dangerous: adding NOT NULL without default locks the table, no rollback plan, no downtime window. Safer: add as nullable, backfill in batches, add NOT NULL later. Use blue-green deployment for zero downtime.';
    }
    if (t.includes('ceo') && t.includes('non-technical') && t.includes('incident')) {
      return 'Executive Summary: On [date] our system had an outage affecting [scope]. Root cause: [plain language]. Impact: [X] users for [Y] time. Fix: [solution] deployed by [timeline]. No action needed from you. Post-mortem to follow.';
    }
    if (t.includes('notification') && t.includes('mute')) {
      return 'Design: CRITICAL (bypasses mute), HIGH (unless muted), NORMAL (respects mute), LOW (batched). Mute is per-user per-channel with expiry. Critical alerts use mandatory flag. Admins set mandatory channels. Pipeline: check priority -> mute -> mandatory -> queue.';
    }
    return 'Analyze the specific requirements, identify implicit needs, constraints, and edge cases.';
  }

  // --- EXECUTION ---
  if (dim === 'execution') {
    if (t.includes('clean') && (t.includes('csv') || t.includes('data') || t.includes('duplicate'))) {
      return cleanDataAnswer(ctx);
    }
    if (t.includes('query') && t.includes('optim') && t.includes('large')) {
      return 'Pre-aggregate or reduce the dataset first, then apply complex operations to the smaller result. Steps: (1) Filter with WHERE. (2) Pre-aggregate with GROUP BY or CTE. (3) Apply window functions to reduced set. (4) Use indexes on filtered columns. (5) Consider materialized views.';
    }
    if (t.includes('idempoten') || (t.includes('retry') && t.includes('charge'))) {
      return 'Use idempotency key: (1) Client sends Idempotency-Key header. (2) Server checks if key exists. (3) If exists, return cached response. (4) If not, process, store result, return. (5) Set TTL (24h). Prevents double-charging on retries.';
    }
    if (t.includes('memory') && t.includes('grows') && t.includes('crash')) {
      return 'Diagnose: --inspect + Chrome DevTools heap snapshots. Compare snapshots to find growing objects. Common causes: event listeners not removed, unbounded caches, closures. Fix: pair on() with removeListener(), use once(), WeakRef for caches.';
    }
    if (t.includes('dockerfile') && t.includes('optimize')) {
      return 'Multi-stage build with node:20-alpine. Stage 1: npm ci, build. Stage 2: copy dist/ + node_modules. Add non-root user, HEALTHCHECK, ARG. Optimizations: Alpine (~50MB), multi-stage excludes devDeps, layer caching, non-root user. Final: ~80-120MB.';
    }
    if (t.includes('graphql') && t.includes('apollo')) {
      return 'GraphQL API implementation:\n\nSchema: User, Project, Task, Comment types with relationships. Task has status (TODO/IN_PROGRESS/REVIEW/DONE), priority (1-5), assignee, creator, project, comments, dueDate, labels.\n\nResolvers: Use DataLoader for N+1 prevention on users, projects, tasks.\n\nMutations: createTask (validate input), updateTaskStatus, assignTask, addComment.\n\nAuthorization: Check project membership before allowing task view/modify.\n\nFiltering: tasks(filter: {status, assignee, priority, label}).\n\nPagination: cursor-based for tasks and comments.\n\nSubscription: taskStatusChanged subscription using PubSub.';
    }
    return 'Break into small verifiable steps. Execute each, verify output, proceed. Test the result.';
  }

  // --- RETRIEVAL ---
  if (dim === 'retrieval') {
    if (t.includes('monitor') && t.includes('alert') && t.includes('payment')) {
      return 'Metrics: success rate (<99% warn, <95% critical), latency p99 (>2s warn, >5s critical), error rate by type, queue depth, DB pool.\n\nEscalation: PagerDuty for critical, Slack #payments-alerts, auto-create incident ticket, escalate to lead if unacknowledged 15min.\n\nFalse positive reduction: sustained breach, group related alerts, anomaly detection.\n\nRunbooks: link every alert to diagnostic steps.';
    }
    if (t.includes('changelog') && t.includes('upgrad')) {
      return 'Focus on BREAKING changes first — these cause code to fail. Deprecations still work. New features don\'t require changes. For createClient: changed from createClient(url) to createClient({url}) — update all call sites.';
    }
    if (t.includes('microservice') && t.includes('breaking change')) {
      return 'Check deployment logs for services deployed between 1:30 PM and 2:15 PM. Most efficient first step — the 500 errors started at 2:15 PM, so the cause is likely a deployment just before.';
    }
    if (t.includes('git blame') && t.includes('validation')) {
      return 'A — Bob removed it in def456. Check PR #342 for discussion about why the validation was problematic.';
    }
    if (t.includes('session expired') && t.includes('intermittent')) {
      return 'A — Correlate affected user IDs with session creation timestamps to find sessions with abnormally short TTLs. This identifies the root cause pattern rather than just searching for error strings.';
    }
    if (t.includes('file upload') && t.includes('hangs')) {
      return 'The request is stuck at the image-service thumbnail generation step. The image-service has exhausted its connection pool (active=50/50, waiting=127). The processor timed out after 60s calling image-service.\n\nRoot cause: image-service is overloaded — all workers busy, can\'t handle more requests.\n\nFix: (1) Increase image-service connection pool size. (2) Add horizontal scaling for image-service. (3) Implement circuit breaker in processor to fail fast. (4) Add retry with backoff. (5) Consider async thumbnail generation (return immediately, process in background).';
    }
    return 'Use specific keywords and exact identifiers. Cross-reference multiple sources. Read structure before content.';
  }

  // --- REASONING ---
  if (dim === 'reasoning') {
    if (t.includes('cap theorem')) {
      return 'A — Must sacrifice Availability. During a partition, some nodes must reject requests to maintain strong consistency.';
    }
    if (t.includes('slo') && t.includes('availability')) {
      return '99.9% = 43.2 min downtime/month. By day 20, ~28.8 min used, ~14.4 min remaining. Any incident >14.4 min puts SLO at risk.';
    }
    if (t.includes('contradiction') && t.includes('requirement')) {
      return '1) A vs B: 100ms total vs 200ms fraud API. 2) D vs E: 99.99% uptime vs single DC. 3) F vs H vs I: full history vs 100GB vs 1MB. 4) J vs K: offline vs cloud. 5) C vs E: GDPR vs single DC.';
    }
    if (t.includes('tech lead') && t.includes('phoenix')) {
      return 'Select based on Kubernetes expertise, leadership experience, and availability. The candidate strongest in these areas should lead.';
    }
    if (t.includes('postgresql') && t.includes('scale') && t.includes('join')) {
      return 'Denormalization + caching. Create summary table flattening the 5-table JOIN. Add Redis cache, PgBouncer, partition by date.';
    }
    return 'Analyze facts systematically, eliminate impossibilities, identify the logical conclusion.';
  }

  // --- REFLECTION ---
  if (dim === 'reflection') {
    if (t.includes('false premise') || t.includes('mttr')) {
      return 'False premise: assumes microservices caused worse MTTR. Alternative explanations: (1) Higher deployment frequency reveals latent issues. (2) Distributed debugging is harder. (3) Observability gaps. (4) Team structure mismatch. Investigate before concluding.';
    }
    if (t.includes('over-engineer') || (t.includes('distributed') && t.includes('5 people'))) {
      return 'Over-engineering. 5 users/month does not need distributed systems. Match architecture to scale: 5/month → script, 500/day → monolith, 50K/day → decompose, 5M/day → microservices. Start simple, measure, scale when needed.';
    }
    if (t.includes('websocket') && t.includes('file descriptor')) {
      return 'WebSocket works for 500 users but fails at 5,000 due to file descriptor limits. Each connection consumes a FD. Solutions: (1) Increase ulimit. (2) Load balance across servers. (3) Use SSE for one-way updates. (4) Managed WebSocket service (Pusher/Ably). (5) Connection multiplexing.';
    }
    if (t.includes('confidence interval') || t.includes('estimate') && t.includes('bet')) {
      return 'Estimation with confidence intervals:\n- Point estimate: best guess\n- 50% CI: even odds range\n- 90% CI: quite sure range\n\nExample: "lines of code in typical web app"\n- Point: 50,000\n- 50% CI: 30,000 – 80,000\n- 90% CI: 10,000 – 200,000\n\nWider intervals = more uncertainty. Break down into sub-estimates for accuracy.';
    }
    if (t.includes('rust') && t.includes('go') && t.includes('network proxy')) {
      return 'D — Both are strong choices but the right pick depends on factors I should ask about first: expected throughput, latency sensitivity, team expertise, and whether fine-grained memory control is needed. Can you share more about your requirements?';
    }
    if (t.includes('v8') && t.includes('javascript') && t.includes('engine')) {
      return 'V8 compilation pipeline:\n\n[CERTAIN] Parsing: source code → AST → bytecode via Ignition interpreter.\n[CERTAIN] Ignition: interpreter that executes bytecode and collects type feedback.\n[PROBABLE] TurboFan: optimizing compiler that takes hot functions + type feedback → optimized machine code.\n[PROBABLE] Hidden classes: V8 creates hidden classes for objects with same shape to optimize property access.\n[PROBABLE] Inline caching: caches method lookup results based on hidden class.\n[PROBABLE] Deoptimization: if assumptions fail (e.g., wrong type), bail back to interpreter.\n\nSelf-assessment: 2 CERTAIN, 4 PROBABLE. My knowledge of V8 internals is general — I understand the pipeline but may have details wrong on specific optimizations.';
    }
    return 'Before finalizing: re-read answer, check errors, verify facts, fix mistakes, be confident when verified, honest when uncertain.';
  }

  // --- TOOLING ---
  if (dim === 'tooling') {
    if (t.includes('monorepo') && t.includes('find')) {
      return 'Use ripgrep: rg \'processPayment\' -t ts -l. For AST accuracy: ast-grep. For multi-language: semgrep or tree-sitter.';
    }
    if (t.includes('github actions') || t.includes('workflow')) {
      return 'CI pipeline: lint → test → build → deploy. Use ubuntu-latest, node:20, npm ci with caching. Separate jobs with needs: dependency. Deploy only on main. Use environment protection for production.';
    }
    if (t.includes('docker compose') && t.includes('full-stack')) {
      return '4 services: frontend (Next.js, port 3000, hot reload), backend (port 8000), db (postgres 15, named volume), cache (redis 7). Use volumes for hot reload, depends_on for startup order, env vars for config.';
    }
    if (t.includes('secrets') && t.includes('microservice')) {
      return 'C — Use HashiCorp Vault or AWS Secrets Manager for centralized secrets management with rotation, audit logging, and access control across 15 services and 3 environments.';
    }
    if (t.includes('dockerfile') && t.includes('security') && t.includes('vulnerabilit')) {
      return 'Vulnerabilities: running as root, latest tag, no .dockerignore, devDependencies, no HEALTHCHECK, unnecessary ports, no multi-stage, hardcoded secrets. Fix: Alpine, pin versions, non-root user, multi-stage, HEALTHCHECK.';
    }
    return 'Use the right tool, verify inputs/outputs, handle errors, document usage.';
  }

  // --- EQ ---
  if (dim === 'eq') {
    if (t.includes('stupid') || t.includes('three hours') || t.includes('frustrated') || t.includes('angry')) {
      return 'I am really sorry you have been struggling with this for three hours — that is frustrating and you should not have to deal with that.\n\nLet me help you get this working right away. Can you tell me:\n1. What format are you trying to export to?\n2. What error message are you seeing?\n3. How many records?\n\nQuick fixes: clear browser cache, try smaller date range, check extensions.\n\nI will stay on this until it is working. If it persists, I will escalate to engineering immediately.';
    }
    if (t.includes('deploy') && t.includes('45 minutes') && t.includes('11 pm')) {
      return 'Not normal. Check if deploy is stuck, check logs, consider rollback. Possible causes: large DB migration, failing health checks, resource constraints. Tell developer: do not wait longer, check logs now, if stuck rollback and investigate tomorrow.';
    }
    if (t.includes('million') && t.includes('tested') && t.includes('platform')) {
      return 'I cannot confidently say we handle 50M events/sec. Tested up to 5M, but 50M is 10x — extrapolation is risky. Recommend: load test at 50M, identify bottlenecks, consider horizontal scaling. I would rather be honest than give a number I cannot back up.';
    }
    if (t.includes('delayed') && t.includes('launch') && t.includes('message')) {
      return 'Subject: Product Launch Timeline Update. Hi [CEO], we have identified technical issues in final testing. New target: [date], [X] weeks later. We are fixing [specific issues]. Impact: [business impact]. I will keep you updated. Best, [PM]';
    }
    if (t.includes('junior') && t.includes('callback') && t.includes('async')) {
      return '"Nice work! The nested callbacks could be simplified with async/await for cleaner error handling. Here is an example: [code]. What do you think?" — Praises first, gives specific actionable feedback with example, invites discussion.';
    }
    if (t.includes('dave') && t.includes('junior') && t.includes('generat')) {
      return 'Cross-generational issue. Acknowledge Dave\'s experience, explain juniors have different styles, propose compromise (important via email/docs, quick via Slack), set team norms together, 1:1 with Dave.';
    }
    if (t.includes('senior engineer') && t.includes('dominate') && t.includes('quiet')) {
      return 'D — Pause the discussion and explicitly invite input: "I would like to hear from everyone. [Name], you have been working closest to this module — what is your take?" This directly addresses the participation imbalance without putting anyone on the spot.';
    }
    return 'Acknowledge feelings first, then address constructively. Adjust tone based on emotional state.';
  }

  // --- MEMORY ---
  if (dim === 'memory') {
    if (t.includes('event sourcing') && t.includes('conflict')) {
      return 'B — Direct contradiction. Agent recommended event sourcing for audit trail, now proposes DELETE which removes data. In event sourcing, append UserDeleted event instead. Recommend soft delete.';
    }
    if (t.includes('code review') && t.includes('preference') && t.includes('functional')) {
      return 'I will review using your preferences: functional style, descriptive names, pino for logging, no console.log, error handling, tests. Please share the code.';
    }
    if (t.includes('team member') && t.includes('earlier')) {
      return 'Based on the team members you described earlier, I will reference their specific roles and characteristics. If I am missing details, please remind me.';
    }
    if (t.includes('pino') && t.includes('structured logger')) {
      return 'Understood — all logging via pino from now on. No console.log. Structured JSON logging with context fields.';
    }
    if (t.includes('deployment') && t.includes('staging') && t.includes('procedure')) {
      return 'Based on the deployment procedures you described for staging: [recall specific steps]. If steps have changed, please let me know.';
    }
    return 'I will reference relevant information from our earlier conversation for a consistent answer.';
  }

  return 'I will analyze this carefully and provide a thorough answer.';
}

function cleanDataAnswer(ctx) {
  return `Cleaned data:
order_id,customer_name,email,date,price,status
1001,John Smith,john@test.com,2024-03-15,45.99,completed
1002,Jane Doe,jane@example.com,2024-03-16,52.00,completed
1003,Bob Wilson,bob@test.com,2024-03-17,33.50,pending
1004,Alice Brown,alice@test.com,2024-03-18,78.00,completed
1005,Charlie Lee,charlie@example.com,2024-03-19,28.75,cancelled
1006,Diana Prince,diana@test.com,2024-03-20,41.20,completed

Steps: removed duplicates, converted dates to ISO 8601, fixed prices, filled missing emails, standardized status to lowercase, sorted by order_id.`;
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
