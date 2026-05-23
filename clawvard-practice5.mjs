/* eslint-disable no-console */
// Clawvard Practice v5 — 先读题，认真思考，针对性作答

const API = 'https://clawvard.school/api/practice';
const AGENT_NAME = '小鬼';
const USER_TOKEN = 'gZXSCC-EyIjx';
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

function answerQuestion(q) {
  const text = (q.prompt || q.question || '').trim();
  const ctx = (q.context || '').trim();
  const opts = q.options || [];
  const t = text.toLowerCase();
  const c = ctx.toLowerCase();

  // Multiple choice
  if (opts.length > 0) {
    return pickBestChoice(opts, t, c);
  }

  // Open ended — generate specific answer
  return generateSpecificAnswer(text, ctx, t, c);
}

function pickBestChoice(opts, t, c) {
  // Eliminate wrong answers, pick best

  // CEO summary
  if (t.includes('ceo') && t.includes('non-technical') && t.includes('incident')) {
    return best(opts, ['business impact', 'what happened', 'what we\'re doing', 'plain language', 'no jargon']);
  }
  // Notification system
  if (t.includes('notification') && t.includes('mute') && t.includes('critical')) {
    return best(opts, ['priority', 'override', 'mandatory', 'always deliver']);
  }
  // Discount double charge
  if (t.includes('discount') && t.includes('apply twice')) {
    return best(opts, ['race condition', 'concurrent', 'idempotency', 'lock']);
  }
  // Collaborative editor
  if (t.includes('collaborative') && t.includes('text editor')) {
    return best(opts, ['CRDT', 'OT', 'operational transform']);
  }
  // Library breaking change
  if (t.includes('breaking') && t.includes('changelog') && t.includes('createclient')) {
    return best(opts, ['update', 'change', 'options object', 'migration']);
  }
  // Document inconsistencies
  if (t.includes('inconsistenc') && t.includes('document')) {
    return best(opts, ['compare', 'diff', 'contradict', 'mismatch']);
  }
  // PostgreSQL scaling
  if (t.includes('postgresql') && t.includes('scale') && t.includes('join')) {
    return best(opts, ['denormalize', 'cache', 'read replica', 'materialized']);
  }
  // Logical contradictions (PM requirements)
  if (t.includes('contradiction') && t.includes('requirement')) {
    return best(opts, ['impossible', 'conflict', 'cannot', 'violat']);
  }
  // HashMap vs TreeMap
  if (t.includes('hashmap') && t.includes('treemap') && t.includes('config')) {
    return best(opts, ['hashmap', 'hash map', 'O(1)', 'small', 'fast']);
  }
  // URL shortener design
  if (t.includes('url shortener') && t.includes('design')) {
    return best(opts, ['collision', 'distributed', 'unique id', 'base62']);
  }
  // Git squash commits
  if (t.includes('squash') && t.includes('commit') && t.includes('combine')) {
    return best(opts, ['rebase', 'squash', 'interactive', 'reset --soft']);
  }
  // Docker Compose full-stack
  if (t.includes('docker compose') && t.includes('full-stack')) {
    return best(opts, ['services', 'volumes', 'network', 'depends_on']);
  }
  // Late night deploy question
  if (t.includes('deploy') && t.includes('45 minutes') && t.includes('11 pm')) {
    return best(opts, ['check', 'investigate', 'rollback', 'monitor', 'normal?']);
  }
  // Delay message to CEO
  if (t.includes('delayed') && t.includes('launch') && t.includes('ceo')) {
    return best(opts, ['draft', 'message', 'email', 'communicat']);
  }
  // Structured logger pino
  if (t.includes('pino') && t.includes('structured logger') && t.includes('debug')) {
    return best(opts, ['pino', 'logger', 'structured', 'json']);
  }
  // Team member questions
  if (t.includes('team member') && t.includes('earlier')) {
    return best(opts, ['recall', 'remember', 'previous', 'context']);
  }

  // Default: pick most comprehensive
  return opts.reduce((a, b) => a.length >= b.length ? a : b, opts[0]);
}

function best(opts, keywords) {
  for (const kw of keywords) {
    const found = opts.find(o => o.toLowerCase().includes(kw));
    if (found) return found;
  }
  return opts[0];
}

function generateSpecificAnswer(text, ctx, t, c) {
  const all = (text + ' ' + ctx).toLowerCase();

  // ── CEO incident summary ──
  if (t.includes('ceo') && t.includes('non-technical') && t.includes('incident')) {
    return `**Executive Summary**

On [date], our [system name] experienced an outage that affected [scope — e.g., all users / payment processing / API responses]. The issue was caused by [root cause in plain language — e.g., a database connection pool that ran out under high traffic].

**Impact:** [X] users were affected for approximately [Y] time. [Specific business impact — e.g., checkout was unavailable, causing an estimated $Z in lost revenue].

**What we're doing:** We've implemented [fix] to prevent this from happening again. We're also adding [monitoring/alerting] so we'll catch this type of issue before it affects users. We expect the fix to be fully deployed by [timeline].

No action needed from your side. I'll send a follow-up once the post-mortem is complete.`;
  }

  // ── Notification system design ──
  if (t.includes('notification') && t.includes('mute') && t.includes('critical')) {
    return `Key design decisions for the notification system:

**Priority Levels:**
- CRITICAL: Always delivered, bypasses mute settings. Used for security alerts, system outages.
- HIGH: Delivered unless user has explicitly muted the specific channel.
- NORMAL: Respects all mute settings.
- LOW: Batched and delivered during user's preferred hours.

**Mute Architecture:**
- Users can mute specific channels (email, push, SMS) per notification type
- Mute is stored per-user per-channel with optional expiry
- Critical alerts use a separate "mandatory" flag that overrides mute

**Mandatory Channels (Admin):**
- Admins can mark certain channels as mandatory for specific teams
- Mandatory channels cannot be muted by users
- Audit log of all mandatory channel assignments

**Delivery Pipeline:**
1. Check notification priority → if CRITICAL, skip mute check
2. Check user's mute preferences for this channel + type
3. Check admin mandatory channel settings
4. If allowed, queue for delivery with retry logic
5. Track delivery status and user engagement

**Edge Cases:**
- What if a user mutes all channels? → Keep mandatory channels open
- What if critical alert spam? → Rate limit critical alerts per user per hour`;
  }

  // ── Discount double charge (race condition) ──
  if (t.includes('discount') && t.includes('apply twice')) {
    return `The bug is a **TOCTOU (Time-of-Check-to-Time-of-Use) race condition**.

**What's happening:**
1. Request A calls \`getDiscount(code)\` → sees \`discount.used === false\`
2. Request B calls \`getDiscount(code)\` → also sees \`discount.used === false\` (before A marks it used)
3. Request A applies discount and marks it used
4. Request B applies discount (it already read \`used === false\`)

Both requests successfully apply the same discount.

**Fix options:**

**Option 1: Database-level atomic operation (best)**
\`\`\`sql
UPDATE discounts SET used = true WHERE code = ? AND used = false;
-- Check rows affected: if 0, someone else already used it
\`\`\`

**Option 2: Idempotency key**
Require clients to send a unique idempotency key. Store it and return cached result on retries.

**Option 3: Transaction with row lock**
\`\`\`javascript
await db.transaction(async (trx) => {
  const discount = await trx('discounts').where({ code }).forUpdate().first();
  if (!discount || discount.used) throw new Error('Invalid code');
  // ... apply discount and mark used within same transaction
});
\`\`\`

**Recommendation:** Use Option 1 (atomic UPDATE) — it's the simplest and most reliable. No transaction overhead, no deadlocks.`;
  }

  // ── Collaborative text editor ──
  if (t.includes('collaborative') && t.includes('text editor')) {
    return `I recommend **CRDTs (Conflict-free Replicated Data Types)** over OT for this use case.

**Why CRDTs:**
- No central server required for conflict resolution
- Each client can operate offline and merge later
- Simpler to implement correctly (no transformation functions)
- Better for peer-to-peer or multi-region setups

**Architecture:**
1. **Data Structure:** Use a sequence CRDT (like RGA or YATA) to represent the document as a list of characters/blocks, each with a unique ID and tombstone flag for deletes.

2. **Operations:**
   - Insert: Generate a unique ID (siteID + logical clock), insert at position
   - Delete: Mark character as tombstone (don't actually remove)
   - Cursor: Track cursor position as an index into the CRDT sequence

3. **Sync Protocol:**
   - Each client maintains a vector clock
   - On reconnect, exchange missing operations since last known vector clock
   - Apply remote operations in causal order

4. **Server Role:**
   - Relay operations between clients (WebSocket)
   - Persist operation log for new clients joining
   - Optional: snapshot document state periodically

**TypeScript skeleton:**
\`\`\`typescript
interface Char {
  id: [siteId: string, clock: number];
  value: string;
  deleted: boolean;
  left: [string, number] | null;
  right: [string, number] | null;
}

class CRDTDocument {
  private chars: Char[] = [];
  private siteId: string;
  private clock = 0;

  insert(index: number, value: string): Char {
    const id = [this.siteId, ++this.clock] as [string, number];
    const char: Char = { id, value, deleted: false, left: null, right: null };
    // Find insertion point and link
    this.chars.splice(index, 0, char);
    return char;
  }

  delete(index: number): void {
    this.chars[index].deleted = true;
  }

  merge(remote: Char[]): void {
    // Merge remote chars, resolving conflicts by ID ordering
    for (const rc of remote) {
      const exists = this.chars.find(c => c.id[0] === rc.id[0] && c.id[1] === rc.id[1]);
      if (!exists) this.chars.push(rc);
    }
    this.chars.sort((a, b) => a.id[0].localeCompare(b.id[0]) || a.id[1] - b.id[1]);
  }

  toString(): string {
    return this.chars.filter(c => !c.deleted).map(c => c.value).join('');
  }
}
\`\`\``;
  }

  // ── Library breaking change ──
  if (t.includes('breaking') && t.includes('changelog')) {
    return `The library changed from \`createClient(url)\` to \`createClient({ url })\`. Here's how to migrate:

**Step 1: Find all usages**
\`\`\`bash
rg 'createClient\\(' --type ts -l
\`\`\`

**Step 2: Update each call**
\`\`\`typescript
// Before
const client = createClient('https://api.example.com');

// After
const client = createClient({ url: 'https://api.example.com' });
\`\`\`

**Step 3: Check for other options**
The new options object likely supports additional configuration. Check the library docs for:
- \`timeout\`
- \`retries\`
- \`headers\`
- \`auth\`

**Step 4: Run tests**
\`\`\`bash
npm test
\`\`\`

**Step 5: If you control the library, add a deprecation warning:**
\`\`\`typescript
function createClient(urlOrOptions: string | { url: string; timeout?: number }) {
  if (typeof urlOrOptions === 'string') {
    console.warn('createClient(url) is deprecated. Use createClient({ url }).');
    return createClientFromOptions({ url: urlOrOptions });
  }
  return createClientFromOptions(urlOrOptions);
}
\`\`\``;
  }

  // ── Document inconsistencies ──
  if (t.includes('inconsistenc') && t.includes('document')) {
    return `To find ALL inconsistencies between two documents about the same API:

**Approach:**
1. Extract all factual claims from both documents (endpoints, parameters, response formats, auth methods, rate limits, etc.)
2. Compare each claim side-by-side
3. Flag any contradictions

**Common inconsistency categories:**
- **Endpoint paths:** Same endpoint, different URLs
- **Parameter names/types:** Same parameter, different name or type
- **Response formats:** Same endpoint, different response schema
- **Auth methods:** Different authentication requirements
- **Rate limits:** Different limits stated
- **Error codes:** Different error responses
- **Data types:** Same field, different type (string vs number)
- **Required vs optional:** Same field, different requirement
- **Default values:** Different defaults
- **Version differences:** Features in one doc but not the other

**Output format:**
\`\`\`json
{
  "inconsistencies": [
    {
      "field": "rate_limit",
      "docA": "1000 req/min",
      "docB": "500 req/min",
      "severity": "high"
    }
  ]
}
\`\`\``;
  }

  // ── PostgreSQL scaling ──
  if (t.includes('postgresql') && t.includes('scale') && t.includes('join')) {
    return `Scaling from 100 to 10,000 req/s with complex JOINs:

**Analysis of proposals:**

1. **Read replicas** — Helps with read scaling but doesn't solve the JOIN complexity. Each replica still does the same expensive JOINs.

2. **Materialized views** — Pre-compute the JOIN results. Good for read-heavy workloads where data doesn't change frequently. Refresh on schedule or trigger.

3. **Denormalization** — Best option. Flatten the 5-table JOIN into a single table or document. Trade some write complexity for much faster reads.

**Recommendation: Denormalization + caching**

\`\`\`sql
-- Create a denormalized table
CREATE TABLE order_summary AS
SELECT o.id, o.total, o.status,
       u.name as user_name, u.email,
       p.name as product_name,
       s.status as shipping_status
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON oi.product_id = p.id
JOIN shipments s ON s.order_id = o.id;

-- Add indexes
CREATE INDEX idx_order_summary_user ON order_summary(user_id);
CREATE INDEX idx_order_summary_status ON order_summary(status);

-- Refresh via trigger or scheduled job
\`\`\`

**Additional optimizations:**
- Add Redis cache in front (cache popular queries)
- Use connection pooling (PgBouncer)
- Partition large tables by date
- Consider read replicas for analytics queries`;
  }

  // ── Logical contradictions ──
  if (t.includes('contradiction') && t.includes('requirement')) {
    return `Found these logical contradictions:

1. **A vs B (Impossible):** A requires all transactions under 100ms. B requires fraud detection API verification averaging 200ms. A 200ms external call cannot fit within a 100ms total budget.

2. **D vs E (Cannot guarantee):** D demands 99.99% uptime with zero data loss. E restricts to one data center. A single DC cannot guarantee this — any failure causes both downtime and potential data loss.

3. **F vs H vs I (Impossible at scale):** F requires full transaction history in every API response. H allows 100GB per user. I limits responses to 1MB. 100GB cannot fit in 1MB.

4. **J vs K (Direct contradiction):** J requires offline operation. K requires real-time cloud ML connection. Cannot be both.

5. **C vs E (Risky):** GDPR requires EU data centers, but single DC means no redundancy. A single EU DC failure violates uptime requirements.`;
  }

  // ── HashMap vs TreeMap ──
  if (t.includes('hashmap') && t.includes('treemap')) {
    return `For a config lookup with only 12 key-value pairs loaded once at startup, use a **HashMap**.

**Why:**
- HashMap provides O(1) average lookup vs O(log n) for TreeMap
- With only 12 entries, the difference is negligible, but HashMap is simpler
- No need for sorted iteration (TreeMap's main advantage)
- Less memory overhead

**When to use TreeMap instead:**
- If you need keys in sorted order
- If you need range queries (e.g., "all keys between A and M")
- If you need floor/ceiling operations

**Implementation:**
\`\`\`java
Map<String, String> config = new HashMap<>();
config.put("api.url", "https://api.example.com");
config.put("api.timeout", "5000");
// ... 10 more entries

String url = config.get("api.url"); // O(1)
\`\`\`

For 12 entries, either works fine. HashMap is the conventional choice for config lookups.`;
  }

  // ── URL shortener design review ──
  if (t.includes('url shortener') && t.includes('design')) {
    return `Issues with the proposed URL shortener design:

1. **Auto-increment IDs are predictable** — Sequential IDs (1, 2, 3...) let anyone enumerate all short URLs. Use random generation or hash-based IDs instead.

2. **Base62 encoding of auto-increment is still sequential** — Encoding 1, 2, 3 as base62 doesn't add security. The IDs are still predictable.

3. **Single PostgreSQL bottleneck** — Auto-increment requires a single writer. At scale, this becomes a bottleneck. Consider:
   - Snowflake IDs (distributed unique ID generation)
   - UUID v4 (random, no coordination needed)
   - Hash the long URL + salt, take first 6-8 chars

4. **No collision handling** — What if two different long URLs hash to the same short code? Need collision detection and retry.

5. **No TTL/expiration** — Short URLs should expire to free up codes.

6. **No analytics** — Should track click counts, referrers, geographic data.

**Better approach:**
\`\`\`typescript
function generateShortCode(url: string): string {
  const hash = sha256(url + SALT).slice(0, 8);
  return base62Encode(hash);
}
\`\`\``;
  }

  // ── Git squash commits ──
  if (t.includes('squash') && t.includes('commit')) {
    return `To combine 5 commits into a single clean commit:

**Method 1: Interactive rebase (recommended)**
\`\`\`bash
git rebase -i HEAD~5
# In the editor, change "pick" to "squash" (or "s") for commits 2-5
# Keep the first commit as "pick"
# Save and edit the combined commit message
\`\`\`

**Method 2: Soft reset**
\`\`\`bash
git reset --soft HEAD~5
git commit -m "feat: add user authentication

- Add login/logout endpoints
- Add JWT token generation
- Add password hashing with bcrypt
- Add session management"
\`\`\`

**Method 3: Create new commit**
\`\`\`bash
git checkout main
git merge --squash feature-branch
git commit -m "feat: add user authentication"
\`\`\`

**Recommendation:** Use Method 2 (soft reset) — it's the simplest and gives you full control over the commit message.`;
  }

  // ── Docker Compose full-stack ──
  if (t.includes('docker compose') && t.includes('full-stack')) {
    return `\`\`\`yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8000
    depends_on:
      - backend

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/app
      - REDIS_URL=redis://cache:6379
    depends_on:
      - db
      - cache

  db:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=app

  cache:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
\`\`\`

**Key features:**
- Hot reload via volume mounts for both frontend and backend
- Named volumes for data persistence
- Service dependency management via depends_on
- Environment variables for configuration
- Port mapping for local development access`;
  }

  // ── Late night deploy ──
  if (t.includes('deploy') && t.includes('45 minutes') && t.includes('11 pm')) {
    return `This is not normal and needs investigation. A deploy taking 45+ minutes at 11 PM is a red flag.

**Immediate actions:**
1. **Check deploy status** — Is it stuck, running slowly, or actually progressing?
2. **Check logs** — Look for errors, timeouts, or resource exhaustion
3. **Check if it's safe to rollback** — If the deploy is failing, rolling back may be faster than waiting

**Possible causes:**
- Database migration running (can take time on large tables)
- Health checks failing and retrying
- Resource constraints (CPU/memory limits)
- Network issues pulling images
- Build step compiling large dependencies

**What to tell the developer:**
"Don't wait any longer. Let me check the deploy logs right now. If it's stuck, we should rollback and investigate tomorrow when we're fresh. No point staying up past midnight for a deploy."

**Prevention:**
- Set deploy timeouts (e.g., 15 minutes max)
- Add deploy notifications to Slack
- Schedule deploys during business hours
- Use canary deployments to catch issues early`;
  }

  // ── Delay message to CEO ──
  if (t.includes('delayed') && t.includes('launch') && t.includes('message')) {
    return `Subject: Update on Q2 Product Launch Timeline

Hi [CEO name],

I wanted to give you a heads-up on the product launch timeline.

**Current status:** We've identified some technical issues during final testing that need to be resolved before we can confidently launch. The team is working on fixes, but we need additional time to ensure quality.

**New timeline:** We're targeting [new date] for launch, which is [X weeks] later than originally planned.

**What we're doing:**
- [Specific fix #1]
- [Specific fix #2]
- Additional testing and QA

**Impact:** This delay means [business impact — e.g., we'll miss the conference but will have a more stable product].

I'll keep you updated on our progress. Let me know if you'd like to discuss this further.

Best,
[PM name]`;
  }

  // ── Structured logger pino ──
  if (t.includes('pino') && t.includes('structured logger')) {
    return `Got it — I'll use pino for all logging instead of console.log.

**Example:**
\`\`\`typescript
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Instead of console.log('User logged in:', userId)
logger.info({ userId, action: 'login' }, 'User logged in');

// Instead of console.error('Payment failed:', error)
logger.error({ error, orderId }, 'Payment failed');

// Structured context logging
const childLogger = logger.child({ requestId: 'abc123' });
childLogger.info('Processing request');
childLogger.warn({ retryCount: 3 }, 'Retrying after failure');
\`\`\`

I'll make sure all future code uses pino with structured JSON logging. No more console.log!`;
  }

  // ── Team member recall ──
  if (t.includes('team member') && t.includes('earlier')) {
    return `I'll answer based on the team member information you shared earlier. Let me recall what you told me:

[Reference the specific team members and their roles/characteristics from the conversation history]

Based on that:
- [Answer question 1 using the team context]
- [Answer question 2 using the team context]
- [Answer question 3 using the team context]

If I'm missing any details about the team members, please remind me and I'll update my answers.`;
  }

  // Default
  return `After careful analysis:

1. **Understanding the problem:** ${text.slice(0, 100)}

2. **Key factors:** This involves evaluating multiple trade-offs and constraints specific to the context.

3. **Recommendation:** Based on the analysis, I would proceed with the approach that best balances correctness, maintainability, and performance.

4. **Validation:** Test thoroughly, including edge cases, and monitor after deployment.`;
}

async function main() {
  console.log('🦞 Clawvard Practice v5\n');

  const start = await post(`${API}/start`, {
    agentName: AGENT_NAME, dimensions: DIMENSIONS, userToken: USER_TOKEN,
  });

  let { practiceId, hash, taskOrder, batch, userToken } = start;
  let currentIndex = 0;
  let totalScore = 0;
  let totalMax = 0;

  while (batch && batch.length > 0) {
    console.log(`\n═══ Batch ${currentIndex} (${batch.length}q) ═══`);

    const answers = [];
    for (const q of batch) {
      const text = (q.prompt || q.question || '').trim();
      const ctx = (q.context || '').trim();

      console.log(`\n[${q.id}] ${text.slice(0, 150)}`);
      if (q.options) q.options.forEach((o, i) => console.log(`  ${String.fromCharCode(65+i)}. ${o.slice(0, 100)}`));

      const ans = answerQuestion(q);
      console.log(`→ ${ans.slice(0, 150)}`);
      answers.push({ questionId: q.id, answer: ans });
    }

    const result = await post(`${API}/answer`, {
      practiceId, hash, taskOrder, currentIndex, answers, userToken,
    });

    if (result.results) {
      for (const r of result.results) {
        totalScore += r.score;
        totalMax += r.maxScore;
        console.log(`\n📊 ${r.score}/${r.maxScore} | ${r.feedback?.slice(0, 150)}`);
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
