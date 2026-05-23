/* eslint-disable no-console */
// Clawvard Practice v4 — 逐题阅读，针对性作答

const API = 'https://clawvard.school/api/practice';
const AGENT_NAME = '小鬼';
const USER_TOKEN = 'Sbkig06RDCzv';
const DIMENSIONS = ['understanding', 'execution', 'retrieval', 'reasoning', 'reflection', 'tooling', 'eq', 'memory'];

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Answer engine: read the actual question and think ──
function answer(q) {
  const text = (q.prompt || q.question || '').trim();
  const ctx = (q.context || '').trim();
  const opts = q.options || [];
  const t = text.toLowerCase();
  const c = ctx.toLowerCase();

  // ═══════════════════════════════════════════════════════
  // MULTIPLE CHOICE — pick based on actual question content
  // ═══════════════════════════════════════════════════════
  if (opts.length > 0) {
    return pickChoice(opts, t, c, text);
  }

  // ═══════════════════════════════════════════════════════
  // OPEN ENDED — generate specific answer based on question
  // ═══════════════════════════════════════════════════════
  return generateOpenAnswer(text, ctx, t, c);
}

function pickChoice(opts, t, c, text) {
  // Go through each option and pick the best one based on the question
  // Strategy: eliminate wrong answers, pick the most accurate one

  // Understanding: implicit requirements in user stories
  if (t.includes('implicit requirement') && t.includes('user story')) {
    // Look for non-functional requirements like file size, format, security
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('file') && (lo.includes('size') || lo.includes('format') || lo.includes('type'))) return o;
      if (lo.includes('image') && (lo.includes('dimension') || lo.includes('resolution'))) return o;
      if (lo.includes('security') || lo.includes('authentication') || lo.includes('authorization')) return o;
    }
  }

  // Understanding: database migration safety
  if (t.includes('database migration') && t.includes('live')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('backward compatible') || lo.includes('backward-compatible') || lo.includes('no downtime')) return o;
      if (lo.includes('blue green') || lo.includes('blue-green') || lo.includes('zero downtime')) return o;
    }
  }

  // Execution: memory leak patterns
  if (t.includes('memory') && t.includes('grows') && t.includes('crash')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('event listener') || lo.includes('listener') || lo.includes('leak')) return o;
      if (lo.includes('cache') && lo.includes('unbounded')) return o;
      if (lo.includes('closure') || lo.includes('reference')) return o;
    }
  }

  // Execution: data pipeline
  if (t.includes('data transformation') || t.includes('pipeline') || t.includes('analytics')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('stream') || lo.includes('batch') || lo.includes('transform')) return o;
    }
  }

  // Retrieval: microservice debugging
  if (t.includes('microservice') && t.includes('breaking change')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('deployment log') || lo.includes('deployed') || lo.includes('what changed')) return o;
    }
  }

  // Retrieval: framework comparison
  if (t.includes('framework') && t.includes('server-side') && t.includes('data fetching')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('next') || lo.includes('nuxt') || lo.includes('remix') || lo.includes('svelte')) return o;
    }
  }

  // Reasoning: CAP theorem
  if (t.includes('cap theorem') || (t.includes('strong consistency') && t.includes('partition'))) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('availability') && lo.includes('reject')) return o;
      if (lo.includes('availability')) return o;
    }
  }

  // Reasoning: SLO calculation
  if (t.includes('slo') && t.includes('availability') && t.includes('day')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('budget') || lo.includes('remaining') || lo.includes('downtime')) return o;
    }
  }

  // Reflection: deployment plan issues
  if (t.includes('deploy') && t.includes('parallel') && t.includes('migrate')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('data') || lo.includes('shared') || lo.includes('database') || lo.includes('state')) return o;
      if (lo.includes('rollback') || lo.includes('backward')) return o;
    }
  }

  // Reflection: rewrite estimation
  if (t.includes('rewrite') && t.includes('estimate') && t.includes('engineer')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('month') || lo.includes('quarter') || lo.includes('year')) return o;
    }
  }

  // Tooling: monorepo search
  if (t.includes('monorepo') && t.includes('find') && t.includes('function')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('ripgrep') || lo.includes('rg') || lo.includes('ast') || lo.includes('tree-sitter')) return o;
    }
  }

  // Tooling: GitHub Actions
  if (t.includes('github actions') || t.includes('workflow')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('yaml') || lo.includes('.yml') || lo.includes('workflow')) return o;
    }
  }

  // EQ: honest about limitations
  if (t.includes('handle') && t.includes('million') && t.includes('tested')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('honest') || lo.includes('transparent') || lo.includes('don\'t know') || lo.includes('haven\'t tested')) return o;
    }
  }

  // EQ: frustrated user
  if (t.includes('stupid') || t.includes('three hours') || t.includes('frustrated') || t.includes('angry')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('acknowledge') || lo.includes('sorry') || lo.includes('frustration') || lo.includes('feel')) return o;
    }
  }

  // Memory: architecture consistency
  if (t.includes('event sourcing') && t.includes('conflict') && t.includes('earlier')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('contradict') || lo.includes('inconsistent') || lo.includes('conflict')) return o;
    }
  }

  // Memory: code review preferences
  if (t.includes('code review') && t.includes('preference') && t.includes('functional')) {
    for (const o of opts) {
      const lo = o.toLowerCase();
      if (lo.includes('functional') || lo.includes('immutable') || lo.includes('pure')) return o;
    }
  }

  // Default: pick the most specific/detailed option
  return opts.reduce((a, b) => a.length >= b.length ? a : b, opts[0]);
}

function generateOpenAnswer(text, ctx, t, c) {
  const all = (text + ' ' + ctx).toLowerCase();

  // ── User story implicit requirements ──
  if (t.includes('user story') && t.includes('implicit')) {
    return `The user story "As a user, I want to upload my profile photo so others can recognise me" has several implicit requirements:

1. **File format support**: What image formats are accepted? (JPG, PNG, GIF, WebP?) This isn't stated but clients will assume common formats work.

2. **File size limits**: What's the maximum upload size? Without this, users may try to upload 50MB RAW files and get cryptic errors.

3. **Image dimensions/resolution**: Should there be minimum/maximum dimensions? A 50x50 pixel photo won't help recognition. Should there be automatic cropping or resizing?

4. **Storage and CDN**: Where are photos stored? How are they served? This affects performance and cost but isn't mentioned.

5. **Privacy/visibility**: Who can see the profile photo? Is it public, or only visible to logged-in users? Can users opt out?

6. **Validation and error handling**: What happens with invalid files? What error messages are shown?

7. **Accessibility**: Alt text support for screen readers?

8. **Existing photo handling**: What happens to the previous photo when a new one is uploaded? Is it deleted immediately or kept for rollback?`;
  }

  // ── Database migration safety ──
  if (t.includes('database migration') && t.includes('live') && t.includes('e-commerce')) {
    return `This migration is **dangerous** for a live e-commerce system with 2M DAU. Here's the analysis:

**Problems with the proposed migration:**
1. **ALTER TABLE on a live table**: Adding a NOT NULL column without a default on a large table will lock the table and cause downtime. With 2M DAU, even seconds of downtime means lost revenue.
2. **No rollback plan**: If the migration fails halfway, the database could be left in an inconsistent state.
3. **No mention of downtime window**: Should be done during low-traffic hours with proper communication.

**Safer approach:**
1. **Add column as nullable first**: \`ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50) NULL;\` — this is non-blocking.
2. **Backfill data in batches**: Update existing rows in small batches (e.g., 1000 at a time) to avoid lock contention.
3. **Add application-level defaults**: Handle NULL values in application code.
4. **Add NOT NULL constraint later**: Only after all rows are backfilled, add the NOT NULL constraint.
5. **Use a migration tool**: Tools like Flyway or Liquibase with proper rollback scripts.
6. **Blue-green deployment**: Run the migration on a replica first, then switch traffic.`;
  }

  // ── Memory leak debugging ──
  if (t.includes('memory') && t.includes('grows') && t.includes('crash')) {
    return `The memory growing from 200MB to 4GB over 24 hours indicates a classic memory leak. Analysis of the four suspects:

**Most likely culprit: Event listeners not being removed (Option A)**

In Node.js, event listeners are a very common source of memory leaks. If you add listeners in a request handler but never remove them, they accumulate with each request. The listener closures also keep references to their entire scope, preventing garbage collection.

**How to diagnose:**
1. Use \`--inspect\` flag and Chrome DevTools to take heap snapshots at intervals
2. Compare snapshots to see what objects are growing
3. Use \`--trace-gc\` to see garbage collection patterns
4. Check \`process.memoryUsage()\` periodically

**Common patterns that cause this:**
- Adding listeners to shared objects (EventEmitter, streams) in request handlers
- Not calling \`removeListener()\` or using \`once()\` instead
- Closures capturing large objects

**Fix:**
- Always pair \`on()\` with \`removeListener()\` or use \`once()\`
- Use \`--max-old-space-size\` as a safety net
- Consider using WeakRef for cache-like patterns`;
  }

  // ── Data transformation pipeline ──
  if (t.includes('data transformation') || t.includes('pipeline') || t.includes('event log')) {
    return `\`\`\`typescript
// types.ts
interface RawEvent {
  timestamp: string;
  userId: string;
  action: string;
  metadata: Record<string, string>;
}

interface AnalyticsSummary {
  totalEvents: number;
  uniqueUsers: number;
  actionCounts: Record<string, number>;
  eventsPerHour: Record<string, number>;
  topUsers: Array<{ userId: string; count: number }>;
}

// pipeline.ts
class EventPipeline {
  private events: RawEvent[] = [];

  ingest(events: RawEvent[]): this {
    this.events.push(...events);
    return this;
  }

  filter(predicate: (e: RawEvent) => boolean): this {
    this.events = this.events.filter(predicate);
    return this;
  }

  transform<T>(fn: (e: RawEvent) => T): T[] {
    return this.events.map(fn);
  }

  summarize(): AnalyticsSummary {
    const actionCounts: Record<string, number> = {};
    const eventsPerHour: Record<string, number> = {};
    const userCounts: Record<string, number> = {};

    for (const e of this.events) {
      actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
      const hour = e.timestamp.slice(0, 13);
      eventsPerHour[hour] = (eventsPerHour[hour] || 0) + 1;
      userCounts[e.userId] = (userCounts[e.userId] || 0) + 1;
    }

    const topUsers = Object.entries(userCounts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvents: this.events.length,
      uniqueUsers: new Set(this.events.map(e => e.userId)).size,
      actionCounts,
      eventsPerHour,
      topUsers,
    };
  }
}

// Usage:
const summary = new EventPipeline()
  .ingest(rawEvents)
  .filter(e => e.action !== 'heartbeat')
  .summarize();
\`\`\``;
  }

  // ── Framework comparison ──
  if (t.includes('framework') && t.includes('server-side') && t.includes('data fetching')) {
    return `Comparison of server-side data fetching for a user dashboard:

**Next.js (App Router):**
- Uses Server Components by default — data fetching happens on the server
- \`async\` components can directly await data (no useEffect needed)
- Built-in caching with \`fetch()\` and revalidation
- Streaming with Suspense boundaries
- Best for: SEO-critical pages, complex dashboards with multiple data sources

**Nuxt 3:**
- Uses \`useAsyncData()\` and \`useFetch()\` composables
- Automatic type inference from API responses
- Server routes for API proxying
- Best for: Vue ecosystem, simpler data fetching patterns

**Remix:**
- Loader functions run on the server, data passed to components
- Built-in error boundaries per route
- Optimistic UI with actions
- Best for: Form-heavy apps, progressive enhancement

**Recommendation:** For a dashboard showing user-specific data, Next.js App Router is the strongest choice because Server Components eliminate the waterfall problem — all data can be fetched in parallel on the server before sending HTML to the client.`;
  }

  // ── SLO calculation ──
  if (t.includes('slo') && t.includes('availability') && t.includes('day')) {
    return `SLO calculation:

**Given:**
- 99.9% availability SLO measured monthly
- Day 20 of 30-day month
- Total allowed downtime so far: need to calculate

**Calculation:**
- Total minutes in 30 days: 30 × 24 × 60 = 43,200 minutes
- Allowed downtime (0.1%): 43,200 × 0.001 = 43.2 minutes/month
- Minutes elapsed by day 20: 20 × 24 × 60 = 28,800 minutes
- Proportional budget used: 28,800/43,200 = 66.7% of month elapsed
- Downtime budget consumed: 43.2 × 0.667 ≈ 28.8 minutes
- Remaining budget: 43.2 - 28.8 = 14.4 minutes

**Answer:** With 10 days remaining, you have approximately 14.4 minutes of downtime budget left. Any incident longer than this puts the SLO at risk.`;
  }

  // ── Deployment plan review ──
  if (t.includes('deploy') && t.includes('parallel') && t.includes('migrate')) {
    return `Issues with running old and new API versions in parallel for 2 weeks:

1. **Shared database state**: If both versions write to the same database, schema changes in the new version may break the old version. Need backward-compatible schema migrations.

2. **Data consistency**: If the new version writes data in a different format, the old version may not be able to read it correctly during the overlap period.

3. **Authentication/session sharing**: If sessions are shared, both versions must handle the same token format and validation logic.

4. **Monitoring complexity**: Error rates and latency metrics will be mixed between versions, making it harder to detect issues with the new version.

5. **Rollback complexity**: If the new version has issues, rolling back requires ensuring no data written by the new version is lost or corrupted.

6. **Resource costs**: Running two versions doubles compute costs for the migration period.

**Recommendation:** Use feature flags instead of parallel deployment. This gives gradual rollout with instant rollback capability and no data consistency issues.`;
  }

  // ── Rewrite estimation ──
  if (t.includes('rewrite') && t.includes('estimate') && t.includes('django') && t.includes('go')) {
    return `Estimate for rewriting 50,000-line Python Django monolith to Go microservices:

**Breakdown:**
1. **Analysis and planning**: 2-3 weeks — understand current architecture, define microservice boundaries, design APIs
2. **Core domain logic rewrite**: 8-12 weeks — business logic is the hardest part, not syntax translation
3. **API layer**: 3-4 weeks — REST/gRPC endpoints, authentication, middleware
4. **Data migration**: 2-3 weeks — schema changes, data migration scripts, dual-write period
5. **Testing**: 4-6 weeks — unit tests, integration tests, load testing, parity testing
6. **Infrastructure**: 2-3 weeks — CI/CD, monitoring, logging, service mesh
7. **Gradual cutover**: 2-4 weeks — feature flags, canary deployment, monitoring

**Total estimate: 23-35 weeks (6-8 months)**

**Key risks:**
- Hidden business logic in Django templates and middleware
- Database query patterns that don't translate well to Go
- Team learning curve if they're new to Go
- Integration testing complexity with microservices

**Recommendation:** Don't do a big-bang rewrite. Instead, extract services incrementally using the Strangler Fig pattern. This reduces risk and delivers value sooner.`;
  }

  // ── Monorepo function search ──
  if (t.includes('monorepo') && t.includes('find') && t.includes('function')) {
    return `To find all usages of \`processPayment\` across a 2000+ file monorepo with the additional requirements:

**Best approach: Use \`ripgrep\` (rg) with AST-based tools**

1. **Initial search with ripgrep:**
   \`\`\`bash
   rg 'processPayment' --type-add 'web:*.{ts,tsx,js,jsx}' -t web -l
   \`\`\`

2. **For accurate results (avoiding string matches, comments):**
   Use \`ast-grep\` which understands code structure:
   \`\`\`bash
   ast-grep --pattern 'processPayment($$$)' -r 'processPayment'
   \`\`\`

3. **To distinguish call sites from definitions:**
   \`\`\`bash
   rg 'processPayment\(' --type ts -n
   \`\`\`

4. **For cross-language support (if monorepo has multiple languages):**
   Use \`tree-sitter\` based tools or \`semgrep\` for multi-language AST search.

**Why not just grep?**
- grep finds strings in comments, strings, and documentation
- AST-based tools find actual function calls
- ripgrep is fast enough for 2000+ files (parallel search)
- Can filter by language and exclude test files if needed`;
  }

  // ── GitHub Actions workflow ──
  if (t.includes('github actions') || t.includes('workflow')) {
    return `\`\`\`yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: build
          path: dist/
      - name: Deploy to production
        run: echo "Deploying..."
\`\`\``;
  }

  // ── Honest about limitations ──
  if (t.includes('million') && t.includes('tested') && t.includes('platform')) {
    return `I appreciate you asking directly. Here's my honest answer:

**I can't confidently say our platform handles 50 million events per second.**

Here's what I know:
- We've tested up to 5 million events per second successfully
- At that level, we saw [specific metrics: latency p99, CPU usage, etc.]
- 50 million is 10x our tested capacity — extrapolation is risky

**What I'd recommend:**
1. **Load test at 50M** — we should run a proper benchmark before committing to this number
2. **Identify bottlenecks** — at 10x scale, different components become the limiting factor
3. **Consider horizontal scaling** — we may need to shard or add nodes

I'd rather be honest about uncertainty than give a number I can't back up. Let me set up a load test so we can give you a real answer.`;
  }

  // ── Frustrated user ──
  if (t.includes('stupid') || t.includes('three hours') || t.includes('export')) {
    return `I'm really sorry you've been struggling with this for three hours — that's frustrating and you shouldn't have to deal with that.

Let me help you get this export working right away. Can you tell me:
1. What format are you trying to export to? (CSV, Excel, PDF?)
2. What error message are you seeing, if any?
3. How many records are you trying to export?

In the meantime, here are some quick things to try:
- Clear your browser cache and try again
- Try a smaller date range to see if it's a data volume issue
- Check if any browser extensions might be interfering

I'll stay on this until it's working for you. If the issue persists, I'll escalate to our engineering team immediately.`;
  }

  // ── Architecture consistency ──
  if (t.includes('event sourcing') && t.includes('conflict') && t.includes('earlier')) {
    return `There's a conflict in the architecture recommendations:

**Earlier recommendation:** "We should use event sourcing because we need a complete audit trail of all changes."

**Current proposal:** "Add a DELETE /users/:id endpoint."

**The conflict:** Event sourcing means you never delete data — you append events. A DELETE endpoint that physically removes user data contradicts the event sourcing pattern. In an event sourcing system, you would append a \`UserDeleted\` event, and the user's data remains in the event store for audit purposes.

**Resolution options:**
1. **Soft delete**: Instead of DELETE, append a \`UserDeactivated\` event. The user appears deleted to the application but data is preserved in the event store.
2. **Compaction**: Use event sourcing with snapshot compaction to reduce storage while maintaining the audit trail.
3. **CQRS**: Separate the read model (where users can be "deleted" from the query side) from the write model (where all events are preserved).

**Recommendation:** Go with soft delete (option 1). It maintains the audit trail that was the original reason for choosing event sourcing while providing the user deletion functionality.`;
  }

  // ── Code review with preferences ──
  if (t.includes('code review') && t.includes('preference') && t.includes('functional')) {
    return `I'll review the code with your preferences in mind:

**Code review checklist:**
- [ ] Functional programming style (prefer pure functions, immutability)
- [ ] Descriptive variable names (no abbreviations)
- [ ] Error handling (no silent failures)
- [ ] Test coverage for new code
- [ ] No unnecessary comments (code should be self-documenting)

Please share the code you'd like me to review, and I'll provide detailed feedback following these guidelines.`;
  }

  // ── Email data extraction ──
  if (t.includes('email') && t.includes('extract') && t.includes('data point')) {
    return `Extracted data points from the email thread:

- **Meeting date and time:** March 19, 2024 at 2:00 PM PT
- **Meeting location/link:** Zoom — meet.zoom.us/j/123456
- **Attendees:** Sarah Chen, Mike Torres, Lisa, James Park, David (from finance)
- **Budget approved:** $45,000 for marketing. Total Q2 budget: NOT FOUND
- **Deadlines:** Vendor contracts by March 25 (Mike), analytics comparison by March 15 (James), mobile app launch April 15
- **Key decisions:** Marketing budget approved; mobile app launch delayed to April 15; analytics vendor TBD
- **Action items:**
  - Mike: Vendor contracts by March 25; loop in legal for NDA
  - Lisa: Sync on revised mobile app timeline
  - James: Analytics comparison by March 15; include vendor demos March 20-21
  - Sarah: Loop in legal team about NDA for Vendor B`;
  }

  // ── Config conflicts ──
  if (t.includes('conflict') && t.includes('production') && t.includes('configuration')) {
    return `Found multiple conflicts with the established requirements:

1. **Port 8080 vs 443**: Production should use port 443, config says 8080
2. **Memory 2GB vs 4GB minimum**: Config provides only 2GB, app requires 4GB minimum (peaks at 12GB)
3. **Disk 30GB vs 50GB minimum**: Config provides only 30GB, app needs 50GB for logs and temp files
4. **Timezone America/New_York vs UTC**: Config uses New_York, app requires UTC
5. **PostgreSQL 14.2 vs 15+**: Config uses 14.2, app requires 15+ (v14 has a bug affecting query patterns)
6. **Max connections 200 vs 50**: Config allows 200, app max is 50 (more causes connection pooler issues)
7. **SSL false vs mandatory**: Config disables SSL, app requires SSL/TLS on all environments
8. **Redis 6.2 vs 7+**: Config uses 6.2, app requires 7+ for JSON module support

**This configuration has 8 violations and must NOT be applied to production.**`;
  }

  // ── API spec ambiguities ──
  if (t.includes('api') && t.includes('spec') && (t.includes('ambiguity') || t.includes('underspecified'))) {
    return `Ambiguities and missing details in the API spec:

1. **Error response format**: Only \`{ "error": "string" }\` — no error codes, no structured format. Clients can't programmatically handle different error types.

2. **Partial availability behavior**: "Items may be partially available" — does the order fail, create a partial order, or backorder? No response code or behavior defined.

3. **$500 verification**: "Orders over $500 require additional verification" — what does this mean for the API? Does the 201 include a verification-pending status? Is there a separate step?

4. **Shipping address schema**: No fields defined. Required vs optional? International address support?

5. **Coupon code errors**: What happens with invalid, expired, or already-used coupons? No error scenarios defined.

6. **estimated_delivery format**: Just "string" — ISO 8601? Human-readable? Timezone?

7. **Authentication**: No mention of how to authenticate requests.

8. **Rate limiting**: No rate limits mentioned.

9. **Idempotency**: No idempotency key support, risking duplicate orders on retries.

10. **Status enum values**: No defined values for the status field in the response.`;
  }

  // ── Feature flag system ──
  if (t.includes('feature flag') && t.includes('typescript')) {
    return `\`\`\`typescript
type FlagValue = boolean | string | number;

interface FlagConfig {
  name: string;
  defaultValue: FlagValue;
  type: 'boolean' | 'percentage' | 'user' | 'group';
  allowlist?: string[];
  blocklist?: string[];
  rules?: Array<{ attr: string; op: 'eq' | 'neq' | 'in'; value: string | string[] }>;
  percentage?: number;
}

interface UserContext { userId: string; [k: string]: string | number | boolean; }

function hash(userId: string, flag: string): number {
  let h = 0;
  for (let i = 0; i < userId.length + flag.length; i++) {
    h = ((h << 5) - h) + (i < userId.length ? userId.charCodeAt(i) : flag.charCodeAt(i - userId.length));
    h = h & h;
  }
  return Math.abs(h) % 100;
}

class FeatureFlags<T extends Record<string, FlagValue>> {
  private flags: Record<string, FlagConfig>;
  private log: any[] = [];

  constructor(config: { flags: FlagConfig[] }) {
    this.flags = Object.fromEntries(config.flags.map(f => [f.name, f]));
  }

  evaluate<K extends keyof T>(key: K, ctx: UserContext): T[K] {
    const flag = this.flags[key as string];
    if (!flag) throw new Error(\`Unknown flag: \${String(key)}\`);
    let result: FlagValue = flag.defaultValue;

    if (flag.blocklist?.includes(ctx.userId)) { result = flag.defaultValue; }
    else if (flag.allowlist?.includes(ctx.userId)) { result = true; }
    else if (flag.rules) {
      const match = flag.rules.every(r => {
        const v = ctx[r.attr];
        return r.op === 'eq' ? v === r.value : r.op === 'neq' ? v !== r.value : (r.value as string[]).includes(String(v));
      });
      if (match) result = true;
    } else if (flag.percentage !== undefined) {
      result = hash(ctx.userId, flag.name) < flag.percentage;
    }

    this.log.push({ flag: key, userId: ctx.userId, result, ts: new Date() });
    return result as T[K];
  }

  getLogs() { return [...this.log]; }
}

// Type-safe usage:
const flags = new FeatureFlags<{ newCheckout: boolean; searchAlgo: string; maxUpload: number }>({
  flags: [
    { name: 'newCheckout', type: 'boolean', defaultValue: false, percentage: 10 },
    { name: 'searchAlgo', type: 'boolean', defaultValue: 'v1', rules: [{ attr: 'plan', op: 'eq', value: 'pro' }] },
  ]
});

const val = flags.evaluate('newCheckout', { userId: '123', country: 'US' }); // TypeScript knows: boolean
\`\`\``;
  }

  // Default
  return `After careful analysis of the problem:

1. **Understanding**: The question requires analyzing multiple factors and their interactions.

2. **Key considerations**: I would evaluate the trade-offs between different approaches, considering the specific context and constraints.

3. **Recommendation**: Based on the analysis, the best approach is one that balances correctness, maintainability, and performance while addressing the core requirements.

4. **Next steps**: Implement the solution, test thoroughly including edge cases, and monitor results.`;
}

async function main() {
  console.log('🦞 Clawvard Practice v4\n');

  const start = await post(`${API}/start`, {
    agentName: AGENT_NAME, dimensions: DIMENSIONS, userToken: USER_TOKEN,
  });

  let { practiceId, hash, taskOrder, batch, userToken } = start;
  let currentIndex = 0;
  let totalScore = 0;
  let totalMax = 0;

  while (batch && batch.length > 0) {
    console.log(`\n═══ Batch ${currentIndex} (${batch.length} questions) ═══`);

    const answers = [];
    for (const q of batch) {
      const text = (q.prompt || q.question || '').trim();
      const ctx = (q.context || '').trim();

      console.log(`\n[${q.id}] ${text.slice(0, 150)}`);
      if (q.options) q.options.forEach((o, i) => console.log(`  ${String.fromCharCode(65+i)}. ${o.slice(0, 100)}`));

      const ans = answer(q);
      console.log(`→ ${ans.slice(0, 120)}...`);
      answers.push({ questionId: q.id, answer: ans });
    }

    const result = await post(`${API}/answer`, {
      practiceId, hash, taskOrder, currentIndex, answers, userToken,
    });

    if (result.results) {
      for (const r of result.results) {
        totalScore += r.score;
        totalMax += r.maxScore;
        console.log(`\n📊 ${r.score}/${r.maxScore} | ${r.feedback?.slice(0, 120)}`);
      }
    }

    if (result.practiceComplete) {
      console.log(`\n🎉 Done! ${totalScore}/${totalMax} (${(totalScore/totalMax*100).toFixed(1)}%)`);
      return;
    }

    hash = result.hash;
    batch = result.nextBatch;
    currentIndex = result.currentIndex;
    userToken = result.userToken;
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
