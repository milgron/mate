> **Note**: This spec was the original architecture reference. The implementation
> chose **Telegram (grammy)** over WhatsApp-web.js for the messaging interface.
> The WhatsApp sections remain as reference for the architectural patterns and
> Pi Zero constraints analysis.

---

# Building a self-improving Claude agent: Pi Zero faces critical constraints

**The full stack is not viable on Raspberry Pi Zero.** WhatsApp-web.js requires **500MB-1GB RAM** for Chromium alone, while the Pi Zero's 512MB total system memory leaves only ~100-200MB after OS and Docker overhead. A **thin client architecture** where Pi Zero handles I/O while the agent runs on a capable server is the only practical path forward.

This guide covers complete implementation details for all requested components, with specific code patterns, library versions, and configurations—plus a realistic assessment of hardware constraints and recommended architectural alternatives.

---

## Claude Agent SDK delivers mature agent patterns

Two official TypeScript SDKs are available: **@anthropic-ai/sdk** (core Messages API) and **@anthropic-ai/claude-agent-sdk** (autonomous agents with built-in tools). The Agent SDK, formerly Claude Code SDK, provides production-ready patterns for long-running agent loops.

### Tool registration with betaZodTool

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers';
import { z } from 'zod';

const anthropic = new Anthropic();

const emailTool = betaZodTool({
  name: 'send_email',
  inputSchema: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  description: 'Send an email via Gmail API',
  run: async (input) => {
    const result = await gmailService.send(input);
    return `Email sent with ID: ${result.id}`;
  },
});

// toolRunner handles the full tool execution loop
const finalMessage = await anthropic.beta.messages.toolRunner({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 4096,
  messages: [{ role: 'user', content: 'Send a reminder email to alice@example.com' }],
  tools: [emailTool],
});
```

### Agent SDK for autonomous operation

```typescript
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

const mcpServer = createSdkMcpServer({
  name: 'agent-tools',
  version: '1.0.0',
  tools: [emailTool, calendarTool, whatsappTool],
});

async function runAgentLoop(task: string) {
  for await (const message of query({
    prompt: task,
    options: {
      model: 'claude-sonnet-4-5-20250929',
      maxTurns: 20,
      maxBudgetUsd: 5.0,
      mcpServers: { 'agent-tools': mcpServer },
      allowedTools: ['send_email', 'create_event', 'send_whatsapp'],
      hooks: {
        PreToolUse: [{
          matcher: '*',
          hooks: [async (input) => {
            auditLogger.info({ tool: input.tool_name, input: input.tool_input });
            return { decision: 'approve' };
          }]
        }]
      }
    }
  })) {
    if (message.type === 'result') {
      return {
        success: message.subtype === 'success',
        cost: message.total_cost_usd,
        usage: message.usage,
      };
    }
  }
}
```

Built-in retry handling uses automatic exponential backoff (default 2 retries). Override with `maxRetries: 5` in client options. Rate limit errors (429) and overload errors (529) are automatically retried; client errors (4xx) are not.

---

## WhatsApp-web.js demands resources Pi Zero cannot provide

The library launches WhatsApp Web in headless Chromium via Puppeteer, creating a **minimum 500MB-1GB RAM requirement** per session. Memory grows over time as WhatsApp Web caches messages. Fly.io documentation explicitly states "at least 1024MB RAM otherwise OOM kills will be common."

### Docker configuration for capable hardware

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium ffmpeg \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
```

### Optimized client initialization

```typescript
import { Client, LocalAuth } from 'whatsapp-web.js';

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'agent-session',
    dataPath: '/app/.wwebjs_auth'
  }),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',    // Critical for Docker
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-zygote',
      '--single-process',            // Reduces memory, less stable
      '--disable-accelerated-2d-canvas',
      '--memory-pressure-off'
    ]
  }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('WhatsApp connected'));
client.on('disconnected', async (reason) => {
  console.log('Disconnected:', reason);
  await client.initialize();  // Auto-reconnect
});
```

### Anti-ban best practices

WhatsApp bans approximately **2 million accounts monthly** for automation. Critical guidelines:

- **Account warming**: Wait 24 hours before connecting new numbers; don't automate for first 10 days
- **Message pacing**: Add 5-15 second random delays; max 1 message/minute; batch 50-100 messages with 10+ minute cooldowns
- **Content patterns**: Personalize messages, avoid promotional keywords ("free", "win"), aim for 30%+ response rate
- **Technical**: Server location should match SIM card country; text-only messages have 98% survival rate vs 85% for multimedia

**Remote browser (Browserless) is NOT supported** as of late 2025—the library requires local Puppeteer control.

---

## Pi Zero constraints make full-stack deployment impossible

The original Raspberry Pi Zero uses **ARMv6 (armhf)** which Docker does not officially support. The Pi Zero 2 W uses ARMv8 and works with standard ARM Docker images, but still faces severe resource constraints.

### Memory reality on 512MB systems

| Component | Memory Usage |
|-----------|-------------|
| Raspberry Pi OS Lite | 50-80MB |
| Docker daemon | 300-400MB |
| **Available for containers** | **~100-200MB** |

Even with `gpu_mem=16` in `/boot/config.txt` reclaiming 48MB from GPU allocation, headless Chromium alone requires **200-400MB minimum**—more than the entire remaining system memory.

### Node.js memory configuration

```bash
# Critical for Pi Zero - V8 defaults expect 1.5GB RAM
NODE_OPTIONS="--max-old-space-size=128" node app.js
```

### Swap configuration in `/etc/dphys-swapfile`

```
CONF_SWAPSIZE=1024
CONF_MAXSWAP=1024
```

Set `vm.swappiness=1` to minimize SD card writes. Use USB storage for swap to avoid wearing out SD cards.

### Thin client architecture is the viable path

Pi Zero excels as an I/O interface; heavy processing runs on a server:

```typescript
// Pi Zero: thin client forwarding messages
import axios from 'axios';
import Tailscale from 'tailscale';

async function forwardToAgent(message: WhatsAppMessage) {
  const response = await axios.post('http://agent-server.tailnet:3000/process', {
    from: message.from,
    body: message.body,
    timestamp: message.timestamp
  });
  return response.data;
}

// Server: full agent running with adequate resources
app.post('/process', async (req, res) => {
  const result = await runAgentLoop(req.body);
  res.json(result);
});
```

**Recommended setup**: Tailscale VPN (30-40 Mbps on Pi Zero WiFi) connecting to a VPS with 2GB+ RAM running the full stack.

---

## Gmail integration uses OAuth2 with googleapis

```typescript
import { google, gmail_v1, calendar_v3 } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URL
);

// Scopes for Gmail + Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar'
];

// Generate auth URL - use prompt: 'consent' to always get refresh_token
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES
});

// Token refresh handler
oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    // Store securely - only provided on first authorization!
    tokenStore.save(userId, tokens);
  }
});
```

### Email operations

```typescript
const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// Search and list
const listResult = await gmail.users.messages.list({
  userId: 'me',
  maxResults: 10,
  q: 'is:unread from:important@example.com after:2025/01/01'
});

// Send with attachment
async function sendEmail(to: string, subject: string, body: string, attachment?: Buffer) {
  const boundary = `boundary_${Date.now()}`;
  let message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    body,
  ];

  if (attachment) {
    message.push(
      `--${boundary}`,
      'Content-Type: application/octet-stream',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="file.pdf"',
      '',
      attachment.toString('base64')
    );
  }
  message.push(`--${boundary}--`);

  const raw = Buffer.from(message.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}
```

### Calendar integration shares the same OAuth flow

```typescript
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Create event with attendees
await calendar.events.insert({
  calendarId: 'primary',
  requestBody: {
    summary: 'Agent-scheduled meeting',
    start: { dateTime: '2025-01-15T10:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2025-01-15T11:00:00', timeZone: 'America/New_York' },
    attendees: [{ email: 'attendee@example.com' }],
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10']
  },
  sendUpdates: 'all'
});

// Check availability
const freeBusy = await calendar.freebusy.query({
  requestBody: {
    timeMin: new Date().toISOString(),
    timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    items: [{ id: 'primary' }]
  }
});
```

---

## Docker security hardens the production deployment

### Complete production Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN apk add --no-cache tini && apk upgrade --no-cache

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM base AS production
WORKDIR /app

RUN mkdir -p /app && chown -R node:node /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

USER node

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node healthcheck.js || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
```

### Docker Compose with full hardening

```yaml
version: "3.8"

services:
  agent:
    build: .
    user: "1000:1000"
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    tmpfs:
      - /tmp:size=64m,noexec,nosuid,nodev
    secrets:
      - anthropic_api_key
      - google_credentials
    environment:
      - NODE_ENV=production
      - ANTHROPIC_API_KEY_FILE=/run/secrets/anthropic_api_key
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
          pids: 100
    restart: unless-stopped
    networks:
      - agent-network

secrets:
  anthropic_api_key:
    file: ./secrets/anthropic_api_key.txt
  google_credentials:
    file: ./secrets/google_credentials.json

networks:
  agent-network:
    driver: bridge
```

### Graceful shutdown with connection draining

```typescript
import http from 'http';

const server = http.createServer(app);
const connections = new Set<any>();

server.on('connection', (conn) => {
  connections.add(conn);
  conn.on('close', () => connections.delete(conn));
});

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received, starting graceful shutdown...`);

  server.close(async () => {
    console.log('HTTP server closed');
    await db.end();
    await redis.quit();
    process.exit(0);
  });

  // Close idle keep-alive connections
  for (const conn of connections) conn.end();

  // Force close after timeout
  setTimeout(() => {
    for (const conn of connections) conn.destroy();
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### Secrets loading pattern supporting Docker secrets

```typescript
import fs from 'fs';
import path from 'path';

function loadSecret(name: string): string {
  // Check Docker secret file first
  const secretPath = path.join('/run/secrets', name);
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf8').trim();
  }
  // Fallback to environment variable
  const envName = name.toUpperCase().replace(/-/g, '_');
  const value = process.env[envName];
  if (!value) throw new Error(`Secret ${name} not found`);
  return value;
}

export const secrets = {
  anthropicApiKey: loadSecret('anthropic-api-key'),
  googleCredentials: JSON.parse(loadSecret('google-credentials')),
};
```

---

## Self-improvement architecture requires careful sandboxing

**Critical warning**: The vm2 library was **discontinued in July 2023** after 8 critical security advisories (CVSS 9.8-10). The maintainers stated the fundamental architecture cannot be fixed. Use **isolated-vm** instead.

### Sandboxed code execution with isolated-vm

```typescript
import ivm from 'isolated-vm';

async function executeSandboxed(untrustedCode: string, input: any) {
  const isolate = new ivm.Isolate({ memoryLimit: 128 });
  const context = await isolate.createContext();

  const jail = context.global;
  await jail.set('input', new ivm.ExternalCopy(input).copyInto());
  await jail.set('log', function(...args: any[]) { console.log('[sandbox]', ...args); });

  const script = await isolate.compileScript(`
    (function() {
      ${untrustedCode}
    })()
  `);

  try {
    const result = await script.run(context, { timeout: 5000 });
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    isolate.dispose();
  }
}
```

### Git-based rollback for code modifications

```typescript
import simpleGit from 'simple-git';
import { Project } from 'ts-morph';

async function safeModification(modifyFn: () => Promise<void>) {
  const git = simpleGit();
  const checkpoint = (await git.revparse(['HEAD'])).trim();

  try {
    // Perform modification
    await modifyFn();

    // Validate TypeScript compilation
    const project = new Project({ tsConfigFilePath: './tsconfig.json' });
    const diagnostics = project.getPreEmitDiagnostics();
    if (diagnostics.length > 0) {
      throw new Error(`TypeScript errors: ${diagnostics.map(d => d.getMessageText()).join(', ')}`);
    }

    // Commit changes
    await git.add('./*');
    await git.commit('AI self-modification', { '--author': '"Agent <agent@local>"' });

    return { success: true, commit: await git.revparse(['HEAD']) };
  } catch (error) {
    // Automatic rollback
    await git.reset(['--hard', checkpoint]);
    return { success: false, error, rolledBack: true };
  }
}
```

### PM2 process management with restart strategies

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'claude-agent',
    script: './dist/index.js',
    max_memory_restart: '450M',      // Restart before OOM
    exp_backoff_restart_delay: 100,   // Exponential backoff on crashes
    watch: ['dist'],                  // Hot reload on changes
    ignore_watch: ['node_modules', 'logs'],
    env: {
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=400'
    }
  }]
};
```

---

## Testing strategy with Vitest and MSW

### Vitest configuration for TypeScript

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/__mocks__/**'],
      thresholds: { functions: 80, branches: 70, lines: 80 }
    },
    include: ['**/*.test.ts'],
    setupFiles: ['./test/setup.ts']
  }
});
```

### MSW handlers for external service mocking

```typescript
// test/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: 'msg_mock_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Mocked Claude response' }],
      model: body.model,
      stop_reason: 'end_turn'
    });
  }),

  http.get('https://gmail.googleapis.com/gmail/v1/users/:userId/messages', () => {
    return HttpResponse.json({
      messages: [{ id: 'msg1', threadId: 'thread1' }]
    });
  })
];

// test/setup.ts
import { beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## Security implementations protect agent operations

### AES-256-GCM encryption for secrets at rest

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha512');
}

export function encrypt(plaintext: string, masterKey: string): EncryptedData {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    salt: salt.toString('base64')
  };
}

export function decrypt(encrypted: EncryptedData, masterKey: string): string {
  const salt = Buffer.from(encrypted.salt, 'base64');
  const key = deriveKey(masterKey, salt);
  const iv = Buffer.from(encrypted.iv, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));

  let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}
```

### Phone number whitelist with Zod validation

```typescript
import { z } from 'zod';

const PhoneNumberSchema = z.string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid E.164 phone number');

export class PhoneWhitelist {
  private whitelist: Set<string>;

  constructor(allowedNumbers: string[]) {
    this.whitelist = new Set(allowedNumbers.map(this.normalize));
  }

  private normalize(phone: string): string {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  isAllowed(phoneNumber: string): boolean {
    try {
      const normalized = this.normalize(phoneNumber);
      PhoneNumberSchema.parse(normalized);
      return this.whitelist.has(normalized);
    } catch {
      return false;
    }
  }
}
```

### Token bucket rate limiting

```typescript
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private capacity: number, private refillRate: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  consume(tokens: number = 1): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }
}

// Per-user rate limiter middleware
export function rateLimitMiddleware(limiter: Map<string, TokenBucket>, config: { capacity: number, refillRate: number }) {
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    if (!limiter.has(userId)) {
      limiter.set(userId, new TokenBucket(config.capacity, config.refillRate));
    }

    if (!limiter.get(userId)!.consume()) {
      return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: 60 });
    }
    next();
  };
}
```

---

## Conclusion: Architectural decisions determine viability

The critical constraint isn't software—it's hardware. **Pi Zero cannot run this stack directly.** The minimum viable configuration requires:

- **Full stack deployment**: 2GB+ RAM server (cloud VPS or Pi 4)
- **WhatsApp-web.js**: Minimum 1GB RAM recommended
- **Pi Zero role**: Thin client for I/O, forwarding to server via Tailscale VPN

For the self-improving agent architecture, the key safety layers are:

- **isolated-vm** for sandboxed code execution (NOT vm2, which is deprecated with critical vulnerabilities)
- **simple-git** for automatic rollback on failed modifications
- **ts-morph** for AST-level code validation before execution
- **PM2** with memory limits and exponential backoff restarts

The Claude Agent SDK provides production-ready patterns for tool registration, conversation management, and cost/budget controls. Gmail integration via googleapis with proper OAuth2 token management completes the integration layer.

Deploy on capable hardware first, then optimize. The thin client architecture preserves Pi Zero's strengths (low power, cheap hardware) while offloading computation to where it belongs.
