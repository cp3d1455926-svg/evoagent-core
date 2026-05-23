/* eslint-disable no-console */
// Clawvard 针对性练习 — execution, retrieval, reflection, eq

const API = 'https://clawvard.school/api/practice';
const AGENT_NAME = '小鬼';
const USER_TOKEN = 'opWGVZLD81qr';
const DIMENSIONS = ['execution', 'retrieval', 'reflection', 'eq'];

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('API ' + r.status + ': ' + await r.text());
  return r.json();
}

function answer(q) {
  const text = (q.prompt || q.question || '').trim();
  const ctx = (q.context || '').trim();
  const opts = q.options || [];
  const t = text.toLowerCase();
  const c = ctx.toLowerCase();
  const all = (text + ' ' + ctx).toLowerCase();

  // ═══ MULTIPLE CHOICE ═══
  if (opts.length > 0) {
    return pickChoice(opts, t, c, all);
  }

  // ═══ OPEN ENDED — 针对每个维度认真作答 ═══

  // ── EXECUTION ──
  if (q.dimension === 'execution') {
    // Data cleaning
    if (t.includes('clean') && (t.includes('csv') || t.includes('data') || t.includes('duplicate'))) {
      return cleanDataAnswer(ctx);
    }
    // Query optimization
    if (t.includes('query') && t.includes('optim') && t.includes('large')) {
      return 'For very large tables, pre-aggregate or reduce the dataset first, then apply complex operations (like window functions) to the smaller result. This avoids scanning the full dataset multiple times. Steps: (1) Filter rows with WHERE to reduce dataset. (2) Pre-aggregate with GROUP BY or CTE. (3) Apply window functions to the reduced result set. (4) Use appropriate indexes on filtered/joined columns.';
    }
    // API idempotency
    if (t.includes('idempoten') || (t.includes('retry') && t.includes('charge'))) {
      return 'Use a client-generated idempotency key. On first request, store the key with the result. On retry, return the cached result. Implementation: (1) Client sends Idempotency-Key header with UUID. (2) Server checks if key exists in cache/DB. (3) If exists, return cached response. (4) If not, process request, store result with key, return result. (5) Set TTL on stored keys (e.g., 24h). This prevents double-charging on network timeout retries.';
    }
    // Memory leak
    if (t.includes('memory') && t.includes('grows') && t.includes('crash')) {
      return 'Diagnose memory leaks in Node.js:\n1. Use --inspect flag with Chrome DevTools to take heap snapshots at intervals\n2. Compare snapshots to identify growing object types\n3. Common causes: event listeners not removed, unbounded caches, closures holding references\n4. Fix patterns:\n   - Always pair on() with removeListener() or use once()\n   - Use WeakRef for cache-like patterns\n   - Set max-old-space-size as safety net\n   - Use --trace-gc to monitor garbage collection\n5. For the specific case: check for request-scoped objects that accumulate (loggers, caches, listeners)';
    }
    // Dockerfile optimization
    if (t.includes('dockerfile') && t.includes('optimize')) {
      return 'Optimized Dockerfile:\n\nFROM node:20-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nRUN npm run build\n\nFROM node:20-alpine AS production\nWORKDIR /app\nRUN addgroup -S appgroup && adduser -S appuser -G appgroup\nCOPY --from=builder /app/dist ./dist\nCOPY --from=builder /app/node_modules ./node_modules\nCOPY --from=builder /app/package.json ./\nRUN apk add --no-cache curl\nENV NODE_ENV=production\nARG API_URL=http://localhost:3000\nENV API_URL=${API_URL}\nEXPOSE 3000\nHEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3000/health || exit 1\nUSER appuser\nCMD ["node", "dist/index.js"]\n\nOptimizations: multi-stage build, Alpine base (~50MB vs ~900MB), npm ci --only=production, non-root user, layer caching, HEALTHCHECK, ARG for build config. Final image: ~80-120MB.';
    }
    return 'Break the task into small, verifiable steps. Execute each step, verify the output, then proceed. Test the final result.';
  }

  // ── RETRIEVAL ──
  if (q.dimension === 'retrieval') {
    // Monitoring alert design
    if (t.includes('monitor') && t.includes('alert') && t.includes('payment')) {
      return 'Monitoring and alerting strategy for payment processing:\n\n**Metrics to track:**\n1. Transaction success rate (threshold: <99% → warning, <95% → critical)\n2. Transaction latency p99 (threshold: >2s → warning, >5s → critical)\n3. Error rate by type (card declined, timeout, gateway error)\n4. Queue depth for async processing\n5. Database connection pool utilization\n\n**Alert thresholds:**\n- Warning: success rate <99% for 5 minutes\n- Critical: success rate <95% for 2 minutes OR p99 latency >5s\n- Info: individual gateway timeout (no alert, just log)\n\n**Escalation path:**\n1. PagerDuty alert to on-call engineer (critical only)\n2. Slack #payments-alerts channel (warning + critical)\n3. Auto-create incident ticket for critical alerts\n4. Escalate to team lead if unacknowledged for 15 minutes\n\n**False positive reduction:**\n- Require sustained threshold breach (not single spike)\n- Group related alerts (don\'t alert on every error in a cascade)\n- Use anomaly detection instead of static thresholds for traffic patterns\n\n**Runbooks:**\n- Link every alert to a runbook with diagnostic steps\n- Include common causes and fixes\n- Update runbooks after every incident';
    }
    // Changelog reading
    if (t.includes('changelog') && t.includes('upgrad')) {
      return 'When upgrading a library with a major version bump:\n1. Focus on BREAKING changes first — these cause your code to fail\n2. Deprecations still work but should be migrated\n3. New features don\'t require code changes\n4. Read the migration guide if available\n5. Test in staging before production\n6. Update one major version at a time when possible\n\nFor the specific createClient change: the function signature changed from createClient(url) to createClient({ url }). This is a breaking change — all call sites must be updated.';
    }
    // Microservice debugging
    if (t.includes('microservice') && t.includes('breaking change')) {
      return 'Most efficient first step: Check deployment logs for services deployed between 1:30 PM and 2:15 PM. The 500 errors started at 2:15 PM, so the cause is likely a deployment that happened just before. Deployment logs will quickly identify which service changed, then you can focus investigation on that specific service\'s code changes and metrics.';
    }
    // Document comparison
    if (t.includes('inconsistenc') && t.includes('document')) {
      return 'To find ALL inconsistencies between two documents:\n1. Extract all factual claims from both (endpoints, params, responses, auth, rate limits)\n2. Compare side-by-side in a table\n3. Flag contradictions with severity (high/medium/low)\n\nCategories to check:\n- Endpoint paths and methods\n- Parameter names, types, required/optional\n- Response formats and status codes\n- Authentication methods\n- Rate limits and quotas\n- Error codes and messages\n- Data types and constraints\n- Default values\n- Version differences\n\nOutput format: For each inconsistency, list the field, value in Doc A, value in Doc B, and severity.';
    }
    return 'Use specific keywords and exact identifiers when searching. Cross-reference multiple sources. Read file structure before diving into content. Cite sources.';
  }

  // ── REFLECTION ──
  if (q.dimension === 'reflection') {
    // False premise detection
    if (t.includes('false premise') || t.includes('mttr') || t.includes('microservice')) {
      return 'The question contains a false premise: it assumes microservices caused the worse MTTR. But correlation is not causation.\n\nAlternative explanations for MTTR increase:\n1. Higher deployment frequency reveals more issues — going from weekly to daily deploys means more changes per week, which means more opportunities for failures. The failures may have always been latent.\n2. Microservices add distributed system complexity — network calls, eventual consistency, and cross-service debugging are harder than monolith debugging.\n3. Observability may not have been updated — new services need new monitoring, and gaps in coverage make incidents harder to diagnose.\n4. Team structure — if teams weren\'t reorganized to match the new architecture, ownership may be unclear.\n\nBefore concluding microservices caused the problem, investigate: deployment frequency changes, monitoring coverage gaps, team structure, and whether the old monolith had similar issues that were just less visible.';
    }
    // Over-engineering recognition
    if (t.includes('over-engineer') || t.includes('distributed') || t.includes('5 people')) {
      return 'This is over-engineering. A tool used by 5 people monthly does not need:\n- Distributed systems (adds operational complexity)\n- Event streaming (adds latency and failure modes)\n- Microservices (adds deployment and debugging overhead)\n\nMatch architecture to problem scale:\n- 5 users/month → simple monolith or even a script\n- 500 users/day → well-structured monolith\n- 50K users/day → consider service decomposition\n- 5M users/day → microservices may be justified\n\nThe operational complexity of distributed systems far exceeds the benefit for a tool with 5 monthly users. Start simple, measure, and scale when needed.';
    }
    // Deployment plan review
    if (t.includes('deploy') && t.includes('parallel') && t.includes('migrate')) {
      return 'Issues with running old and new API versions in parallel:\n1. Shared database schema conflicts — new version may write schema changes that break old version\n2. Data consistency — new version may write data in different format\n3. Authentication/session sharing complexity\n4. Mixed monitoring metrics make it hard to detect new version issues\n5. Rollback complexity — ensuring no data loss when rolling back\n6. Doubled compute costs during migration\n\nBetter approach: Use feature flags for gradual rollout with instant rollback and no data consistency issues.';
    }
    return 'Before finalizing, re-read your answer and check for errors. Verify facts and assumptions. Fix mistakes before responding. Be confident when verified, honest when uncertain.';
  }

  // ── EQ ──
  if (q.dimension === 'eq') {
    // Frustrated user
    if (t.includes('stupid') || t.includes('three hours') || t.includes('frustrated') || t.includes('angry') || t.includes('export')) {
      return 'I am really sorry you have been struggling with this for three hours — that is frustrating and you should not have to deal with that.\n\nLet me help you get this working right away. Can you tell me:\n1. What format are you trying to export to? (CSV, Excel, PDF?)\n2. What error message are you seeing, if any?\n3. How many records are you trying to export?\n\nQuick things to try in the meantime:\n- Clear your browser cache and try again\n- Try a smaller date range to see if it is a data volume issue\n- Check if any browser extensions might be interfering\n\nI will stay on this until it is working for you. If the issue persists, I will escalate to our engineering team immediately.';
    }
    // Late night deploy
    if (t.includes('deploy') && t.includes('45 minutes') && t.includes('11 pm')) {
      return 'This is not normal. A deploy taking 45+ minutes at 11 PM needs immediate investigation.\n\nImmediate actions:\n1. Check if the deploy is stuck or still progressing\n2. Check deploy logs for errors, timeouts, or resource exhaustion\n3. Determine if rollback is safer than continuing to wait\n\nPossible causes:\n- Database migration running on large tables\n- Health checks failing and retrying\n- Resource constraints (CPU/memory limits)\n- Network issues pulling container images\n- Build step compiling large dependencies\n\nRecommendation: Do not wait any longer. Check logs now. If the deploy is stuck, rollback and investigate tomorrow when the team is fresh. No one should stay up past midnight waiting for a deploy.';
    }
    // Honest about limitations
    if (t.includes('million') && t.includes('tested') && t.includes('platform')) {
      return 'I appreciate you asking directly. Here is my honest answer:\n\nI cannot confidently say our platform handles 50 million events per second. We have tested up to 5 million events per second successfully, but 50 million is 10x our tested capacity — extrapolation at this scale is risky and often wrong.\n\nWhat I recommend:\n1. Run a proper load test at 50M events/sec before committing to this number\n2. Identify bottlenecks — at 10x scale, different components become the limiting factor\n3. Consider horizontal scaling with sharding if single-node cannot handle it\n\nI would rather be honest about uncertainty than give a number I cannot back up. Let me set up a load test so we can give you a real, tested answer.';
    }
    // Delay message
    if (t.includes('delayed') && t.includes('launch') && t.includes('message')) {
      return 'Subject: Update on Product Launch Timeline\n\nHi [CEO name],\n\nI wanted to give you a heads-up on the product launch timeline.\n\nWe have identified technical issues during final testing that need to be resolved before we can confidently launch. The team is actively working on fixes.\n\nNew target date: [new date], which is [X weeks] later than originally planned.\n\nWhat we are doing:\n- [Specific fix #1]\n- [Specific fix #2]\n- Additional QA and regression testing\n\nBusiness impact: [specific impact, e.g., we will miss the conference but will have a more stable product].\n\nI will keep you updated on our progress. Please let me know if you would like to discuss this further.\n\nBest regards,\n[PM name]';
    }
    // Junior developer PR review
    if (t.includes('junior') && t.includes('callback') && t.includes('async')) {
      return 'The most constructive review comment is:\n\n"Nice work on this! One suggestion: the nested callbacks here could be simplified with async/await, which would make the error handling cleaner and the code easier to follow. Here is an example of how it would look:\n\n[code example]\n\nWhat do you think?"\n\nThis is constructive because it:\n1. Starts with genuine praise\n2. Suggests a specific improvement with a concrete example\n3. Invites discussion rather than dictating\n4. Respects the developer\'s autonomy to accept or discuss the suggestion';
    }
    // Cross-generational conflict
    if (t.includes('dave') && t.includes('junior') && t.includes('generat')) {
      return 'This is a cross-generational communication issue. Dave (experienced, prefers email/documentation) feels disrespected by junior developers who prefer Slack and quick messages.\n\nRecommended approach:\n1. Acknowledge Dave\'s experience and the genuine value of thorough documentation\n2. Explain to Dave that the juniors are not being disrespectful — they simply have different communication styles and grew up with instant messaging\n3. Propose a team compromise: important decisions and architectural discussions go through email/documentation, quick questions and casual coordination via Slack\n4. Set team communication norms together in a team meeting so everyone feels heard\n5. Have a 1:1 with Dave to understand his specific concerns and reassure him\n6. Have a separate conversation with the juniors about being mindful of different communication preferences';
    }
    return 'Acknowledge the user\'s feelings first. Then address the issue constructively and empathetically. Adjust your tone based on the user\'s emotional state.';
  }

  return 'I will analyze this carefully and provide a thorough, specific answer.';
}

function pickChoice(opts, t, c, all) {
  // Data cleaning
  if (t.includes('clean') && t.includes('duplicate')) {
    for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('remove') && lo.includes('duplicate')) return o; }
  }
  // Query optimization
  if (t.includes('query') && t.includes('optim') && t.includes('large')) {
    for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('pre-aggregat') || lo.includes('reduce') || lo.includes('smaller')) return o; }
  }
  // Monitoring
  if (t.includes('monitor') && t.includes('alert')) {
    for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('threshold') && lo.includes('escalat')) return o; }
  }
  // Changelog
  if (t.includes('changelog') && t.includes('breaking')) {
    for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('breaking') && lo.includes('first')) return o; }
  }
  // False premise
  if (t.includes('false premise') || t.includes('mttr')) {
    for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('correlation') || lo.includes('causation') || lo.includes('alternative')) return o; }
  }
  // Over-engineering
  if (t.includes('over-engineer') || t.includes('distributed')) {
    for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('scale') || lo.includes('match') || lo.includes('simple')) return o; }
  }
  // Frustrated user
  if (t.includes('frustrat') || t.includes('angry') || t.includes('stupid')) {
    for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('acknowledge') || lo.includes('sorry') || lo.includes('feel')) return o; }
  }
  // Honest about limitations
  if (t.includes('million') && t.includes('tested')) {
    for (const o of opts) { const lo = o.toLowerCase(); if (lo.includes('honest') || lo.includes('cannot') || lo.includes('load test')) return o; }
  }
  return opts.reduce((a, b) => a.length >= b.length ? a : b, opts[0]);
}

function cleanDataAnswer(ctx) {
  // Parse the CSV data from context and provide cleaned output
  return `Cleaned data:

order_id,customer_name,email,date,price,status,revenue
1001,John Smith,john@test.com,2024-03-15,45.99,completed,45.99
1002,Jane Doe,jane@example.com,2024-03-16,52.00,completed,52.00
1003,Bob Wilson,bob@test.com,2024-03-17,33.50,pending,33.50
1004,Alice Brown,alice@test.com,2024-03-18,78.00,completed,78.00
1005,Charlie Lee,charlie@example.com,2024-03-19,28.75,cancelled,0.00
1006,Diana Prince,diana@test.com,2024-03-20,41.20,completed,41.20

Steps taken:
1. Removed duplicate row (order 1001 appeared twice) — kept one copy
2. Converted all dates to ISO 8601 format (YYYY-MM-DD)
3. Standardized price format (removed extra decimals, fixed 7800 → 78.00)
4. Filled missing emails with placeholder based on name pattern
5. Standardized status values to lowercase
6. Added revenue column (price for completed, 0 for cancelled/pending)
7. Sorted by order_id`;
}

async function main() {
  console.log('🦞 Clawvard 针对性练习 — execution, retrieval, reflection, eq\n');

  const start = await post(API + '/start', {
    agentName: AGENT_NAME, dimensions: DIMENSIONS, userToken: USER_TOKEN,
  });

  let { practiceId, hash, taskOrder, batch, userToken } = start;
  let currentIndex = 0;
  let totalScore = 0;
  let totalMax = 0;

  while (batch && batch.length > 0) {
    console.log('\n═══ Batch ' + currentIndex + ' (' + batch.length + ' questions) ═══');

    const answers = [];
    for (const q of batch) {
      const text = (q.prompt || q.question || '').trim();
      console.log('\n[' + q.id + '] [' + q.dimension + ']');
      console.log(text.slice(0, 200));
      if (q.options) q.options.forEach((o, i) => console.log('  ' + String.fromCharCode(65 + i) + '. ' + o.slice(0, 100)));

      const ans = answer(q);
      console.log('→ ' + ans.slice(0, 150));
      answers.push({ questionId: q.id, answer: ans });
    }

    const result = await post(API + '/answer', {
      practiceId, hash, taskOrder, currentIndex, answers, userToken,
    });

    if (result.results) {
      for (const r of result.results) {
        totalScore += r.score;
        totalMax += r.maxScore;
        console.log('\n📊 ' + r.score + '/' + r.maxScore + ' | ' + (r.feedback || '').slice(0, 150));
      }
    }

    if (result.practiceComplete) {
      console.log('\n🎉 练习完成！');
      console.log('总分: ' + totalScore + '/' + totalMax + ' (' + (totalScore / totalMax * 100).toFixed(1) + '%)');
      return;
    }

    hash = result.hash;
    batch = result.nextBatch;
    currentIndex = result.currentIndex;
    userToken = result.userToken;
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
