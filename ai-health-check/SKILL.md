# ai-health-check

Adds a scheduled health check for AI API keys (OpenAI, Gemini, Anthropic, etc.) to any backend project. Validates key validity and budget/quota availability on a cron schedule, surfaces outages to logs before they cause silent failures.

**The core problem**: AI API errors (invalid key, zero credits, quota exhausted) often surface as silent misbehavior — content moderation allowing everything, AI features returning empty results — rather than clear errors. By probing the API cheaply on a schedule, you get an early warning in logs before users are affected.

## Trigger Phrases

- `/ai-health-check`
- "add AI health monitoring"
- "schedule OpenAI key check"
- "detect AI quota exhaustion"

## Instructions

<command-name>ai-health-check</command-name>

You are implementing a scheduled AI API health check. Follow the steps below for the target project's stack.

---

### Step 1: Identify the stack and existing monitoring infrastructure

```bash
# What AI SDKs are installed?
cat package.json | grep -E 'openai|anthropic|google|gemini|mistral|cohere'   # JS/TS
cat requirements.txt pyproject.toml 2>/dev/null | grep -E 'openai|anthropic|google|gemini'  # Python

# Is there an existing health/status system?
find . -name "*.service.ts" | xargs grep -l "health\|status" | head -5
find . -name "health*.py" -o -name "status*.py" | head -5
```

Identify:
1. Which AI providers are in use (OpenAI, Gemini, Anthropic, etc.)
2. What scheduler is available (`@Cron` for NestJS, APScheduler/Celery for Python, cron for Express, etc.)
3. Where health check data is stored (DB table, Redis, log-only)

---

### Step 2: Choose the right probe for each provider

**Design principle**: The probe must be a *real API call* that validates both key validity and quota/budget status. Use the cheapest possible call — zero tokens if possible.

| Provider | SDK | Probe call | What it catches |
|----------|-----|-----------|----------------|
| OpenAI | `openai` npm | `await client.models.list()` | Invalid key (401), zero credits (429 `insufficient_quota`), rate limit (429 other) |
| Gemini | `@google/generative-ai` | `await model.countTokens('.')` | Invalid key (`API_KEY_INVALID`), quota exhausted (`RESOURCE_EXHAUSTED`) |
| Anthropic | `@anthropic-ai/sdk` | `await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: '.' }] })` | Invalid key (401), quota/rate (429) |
| Anthropic (Python) | `anthropic` pip | Same pattern with `client.messages.create(...)` | Same |
| OpenAI (Python) | `openai` pip | `client.models.list()` | Same as JS |
| Gemini (Python) | `google-generativeai` pip | `model.count_tokens('.')` | Same as JS |

**Never use**: Chat completion with actual content (costs tokens). Model listing that doesn't exist in the SDK version. Billing API (requires separate key scope).

---

### Step 3: NestJS implementation

#### 3a. Add enum values to entity

```typescript
// In your status/health entity
export enum ServiceType {
  // ... existing
  OPENAI = 'openai',
  GEMINI = 'gemini',
  ANTHROPIC = 'anthropic',
}
```

#### 3b. Add migration for new enum values

```typescript
// migrations/<timestamp>-AddAiServiceTypes.ts
export class AddAiServiceTypes<timestamp> implements MigrationInterface {
  name = 'AddAiServiceTypes<timestamp>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "service_type_enum" ADD VALUE IF NOT EXISTS 'openai'`);
    await queryRunner.query(`ALTER TYPE "service_type_enum" ADD VALUE IF NOT EXISTS 'gemini'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot remove enum values without recreating. Recreate without new values.
    await queryRunner.query(`ALTER TABLE "status_checks" ALTER COLUMN "service" TYPE text`);
    await queryRunner.query(`DROP TYPE IF EXISTS "service_type_enum_new"`);
    await queryRunner.query(`CREATE TYPE "service_type_enum_new" AS ENUM ('api', 'database', 'redis', ...existing values...)`);
    await queryRunner.query(`DELETE FROM "status_checks" WHERE "service" IN ('openai', 'gemini')`);
    await queryRunner.query(`ALTER TABLE "status_checks" ALTER COLUMN "service" TYPE "service_type_enum_new" USING "service"::"service_type_enum_new"`);
    await queryRunner.query(`DROP TYPE "service_type_enum"`);
    await queryRunner.query(`ALTER TYPE "service_type_enum_new" RENAME TO "service_type_enum"`);
  }
}
```

#### 3c. Service implementation (NestJS)

Key points:
- Initialize client in constructor, set `enabled = false` if key missing
- Catch and classify errors by HTTP status code + error code
- Return structured result — never throw
- Use `alertOnTransition()` to log state changes (not every run)
- `*/` in cron expressions inside JSDoc breaks TypeScript — escape as `*\/`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import OpenAI, { AuthenticationError, RateLimitError } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface AiServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'major_outage';
  responseTimeMs: number;
  errorMessage?: string;
  lastChecked: Date;
}

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);
  private openai: OpenAI | null = null;
  private gemini: GoogleGenerativeAI | null = null;
  
  // Track last known state to alert only on transitions
  private lastOpenAiStatus: string | null = null;
  private lastGeminiStatus: string | null = null;

  constructor(private readonly configService: ConfigService) {
    const openAiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openAiKey) {
      this.openai = new OpenAI({ apiKey: openAiKey });
    }

    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (geminiKey) {
      this.gemini = new GoogleGenerativeAI(geminiKey);
    }
  }

  // Every 15 minutes — note: escape '*/' in JSDoc to avoid TS parse error
  @Cron('0 *\/15 * * * *')
  async runAiHealthChecks(): Promise<void> {
    const [openAi, gemini] = await Promise.all([
      this.checkOpenAi(),
      this.checkGemini(),
    ]);
    this.alertOnAiTransition('OpenAI', openAi, 'lastOpenAiStatus');
    this.alertOnAiTransition('Gemini', gemini, 'lastGeminiStatus');
    // Optionally save to DB here
  }

  async checkOpenAi(): Promise<AiServiceStatus> {
    const start = Date.now();
    if (!this.openai) {
      return { name: 'AI (OpenAI)', status: 'degraded', responseTimeMs: 0, errorMessage: 'OPENAI_API_KEY not configured', lastChecked: new Date() };
    }
    try {
      await this.openai.models.list();
      return { name: 'AI (OpenAI)', status: 'operational', responseTimeMs: Date.now() - start, lastChecked: new Date() };
    } catch (error: unknown) {
      const responseTimeMs = Date.now() - start;
      const status = (error as any)?.status;
      const code = (error as any)?.error?.code;

      if (status === 429 && code === 'insufficient_quota') {
        return { name: 'AI (OpenAI)', status: 'major_outage', responseTimeMs, errorMessage: 'Quota exhausted — add credits at https://platform.openai.com/account/billing', lastChecked: new Date() };
      }
      if (status === 401) {
        return { name: 'AI (OpenAI)', status: 'major_outage', responseTimeMs, errorMessage: 'API key invalid or revoked', lastChecked: new Date() };
      }
      if (status === 429) {
        return { name: 'AI (OpenAI)', status: 'degraded', responseTimeMs, errorMessage: 'Rate limited (key is valid)', lastChecked: new Date() };
      }
      return { name: 'AI (OpenAI)', status: 'degraded', responseTimeMs, errorMessage: `Transient error: ${(error as any)?.message}`, lastChecked: new Date() };
    }
  }

  async checkGemini(): Promise<AiServiceStatus> {
    const start = Date.now();
    if (!this.gemini) {
      return { name: 'AI (Gemini)', status: 'degraded', responseTimeMs: 0, errorMessage: 'GEMINI_API_KEY not configured', lastChecked: new Date() };
    }
    try {
      const model = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      await model.countTokens('.');
      return { name: 'AI (Gemini)', status: 'operational', responseTimeMs: Date.now() - start, lastChecked: new Date() };
    } catch (error: unknown) {
      const responseTimeMs = Date.now() - start;
      const message = (error as any)?.message ?? '';

      if (message.includes('API_KEY_INVALID')) {
        return { name: 'AI (Gemini)', status: 'major_outage', responseTimeMs, errorMessage: 'API key invalid — check https://aistudio.google.com/app/apikey', lastChecked: new Date() };
      }
      if (message.includes('RESOURCE_EXHAUSTED')) {
        return { name: 'AI (Gemini)', status: 'major_outage', responseTimeMs, errorMessage: 'Quota exhausted — check https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas', lastChecked: new Date() };
      }
      return { name: 'AI (Gemini)', status: 'degraded', responseTimeMs, errorMessage: `Transient error: ${message}`, lastChecked: new Date() };
    }
  }

  private alertOnAiTransition(
    provider: string,
    result: AiServiceStatus,
    stateKey: 'lastOpenAiStatus' | 'lastGeminiStatus',
  ): void {
    const prev = this[stateKey];
    const curr = result.status;
    if (prev === curr) return;  // No change, no log spam
    this[stateKey] = curr;

    if (curr === 'major_outage') {
      this.logger.error(`[AI Health] ${provider} → MAJOR OUTAGE: ${result.errorMessage}`);
    } else if (curr === 'operational' && prev === 'major_outage') {
      this.logger.log(`[AI Health] ${provider} → RECOVERED (was MAJOR OUTAGE)`);
    } else if (curr === 'degraded') {
      this.logger.warn(`[AI Health] ${provider} → DEGRADED: ${result.errorMessage}`);
    }
  }
}
```

#### 3d. Module: add ConfigModule + ScheduleModule

```typescript
// status.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule'; // if not already in AppModule

@Module({
  imports: [ConfigModule, /* ScheduleModule.forRoot() if not in AppModule */],
  providers: [StatusService],
})
export class StatusModule {}
```

`ScheduleModule.forRoot()` should live in `AppModule`, not repeated in feature modules.

---

### Step 4: Python FastAPI implementation

```python
# health/ai_health.py
import asyncio
import time
import logging
from datetime import datetime
from typing import Literal
from dataclasses import dataclass
import os

logger = logging.getLogger(__name__)

@dataclass
class AiServiceStatus:
    name: str
    status: Literal['operational', 'degraded', 'major_outage']
    response_time_ms: int
    error_message: str | None = None
    last_checked: datetime = None

    def __post_init__(self):
        if self.last_checked is None:
            self.last_checked = datetime.utcnow()


async def check_openai() -> AiServiceStatus:
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        return AiServiceStatus('AI (OpenAI)', 'degraded', 0, 'OPENAI_API_KEY not configured')

    try:
        from openai import AsyncOpenAI, AuthenticationError, RateLimitError
        client = AsyncOpenAI(api_key=api_key)
        start = time.monotonic()
        await client.models.list()
        ms = int((time.monotonic() - start) * 1000)
        return AiServiceStatus('AI (OpenAI)', 'operational', ms)
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        status_code = getattr(e, 'status_code', None)
        error_code = getattr(getattr(e, 'error', None), 'code', None) or ''

        if status_code == 429 and 'insufficient_quota' in error_code:
            return AiServiceStatus('AI (OpenAI)', 'major_outage', ms,
                'Quota exhausted — add credits at https://platform.openai.com/account/billing')
        if status_code == 401:
            return AiServiceStatus('AI (OpenAI)', 'major_outage', ms, 'API key invalid or revoked')
        if status_code == 429:
            return AiServiceStatus('AI (OpenAI)', 'degraded', ms, 'Rate limited (key is valid)')
        return AiServiceStatus('AI (OpenAI)', 'degraded', ms, f'Transient error: {e}')


async def check_gemini() -> AiServiceStatus:
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        return AiServiceStatus('AI (Gemini)', 'degraded', 0, 'GEMINI_API_KEY not configured')

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')
        start = time.monotonic()
        model.count_tokens('.')
        ms = int((time.monotonic() - start) * 1000)
        return AiServiceStatus('AI (Gemini)', 'operational', ms)
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        msg = str(e)
        if 'API_KEY_INVALID' in msg:
            return AiServiceStatus('AI (Gemini)', 'major_outage', ms,
                'API key invalid — check https://aistudio.google.com/app/apikey')
        if 'RESOURCE_EXHAUSTED' in msg:
            return AiServiceStatus('AI (Gemini)', 'major_outage', ms,
                'Quota exhausted — check https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas')
        return AiServiceStatus('AI (Gemini)', 'degraded', ms, f'Transient error: {e}')


# Scheduler integration — APScheduler example:
# from apscheduler.schedulers.asyncio import AsyncIOScheduler
# scheduler = AsyncIOScheduler()
# scheduler.add_job(run_ai_health_checks, 'interval', minutes=15)
# scheduler.start()

_last_status: dict[str, str] = {}

async def run_ai_health_checks():
    results = await asyncio.gather(check_openai(), check_gemini())
    for r in results:
        prev = _last_status.get(r.name)
        if prev != r.status:
            _last_status[r.name] = r.status
            if r.status == 'major_outage':
                logger.error(f'[AI Health] {r.name} → MAJOR OUTAGE: {r.error_message}')
            elif r.status == 'operational' and prev == 'major_outage':
                logger.info(f'[AI Health] {r.name} → RECOVERED')
            elif r.status == 'degraded':
                logger.warning(f'[AI Health] {r.name} → DEGRADED: {r.error_message}')
```

---

### Step 5: Anthropic check (any stack)

Anthropic's cheapest probe is a 1-token message (Haiku model). Unlike OpenAI/Gemini, there's no free metadata endpoint.

```typescript
// TypeScript
async checkAnthropic(): Promise<AiServiceStatus> {
  const start = Date.now();
  if (!this.anthropic) {
    return { name: 'AI (Anthropic)', status: 'degraded', responseTimeMs: 0, errorMessage: 'ANTHROPIC_API_KEY not configured', lastChecked: new Date() };
  }
  try {
    await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    });
    return { name: 'AI (Anthropic)', status: 'operational', responseTimeMs: Date.now() - start, lastChecked: new Date() };
  } catch (error: unknown) {
    const status = (error as any)?.status;
    if (status === 401) return { name: 'AI (Anthropic)', status: 'major_outage', responseTimeMs: Date.now() - start, errorMessage: 'API key invalid', lastChecked: new Date() };
    if (status === 429) return { name: 'AI (Anthropic)', status: 'degraded', responseTimeMs: Date.now() - start, errorMessage: 'Rate limited', lastChecked: new Date() };
    return { name: 'AI (Anthropic)', status: 'degraded', responseTimeMs: Date.now() - start, errorMessage: String((error as any)?.message), lastChecked: new Date() };
  }
}
```

---

### Step 6: Test stubs

Tests must mock the AI client so they don't make real network calls. For the "all operational" test, spy on the check methods rather than mocking the underlying SDK — much simpler.

```typescript
// NestJS spec
describe('StatusService', () => {
  let service: StatusService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StatusService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        // ... other deps
      ],
    }).compile();
    service = module.get(StatusService);
  });

  it('should return operational when all checks pass', async () => {
    // Stub AI checks — ConfigService returns undefined (no keys), so checks return DEGRADED by default
    jest.spyOn(service, 'checkOpenAi').mockResolvedValue({
      name: 'AI (OpenAI)', status: ServiceStatus.OPERATIONAL, responseTimeMs: 50, lastChecked: new Date(),
    });
    jest.spyOn(service, 'checkGemini').mockResolvedValue({
      name: 'AI (Gemini)', status: ServiceStatus.OPERATIONAL, responseTimeMs: 50, lastChecked: new Date(),
    });

    const result = await service.performHealthChecks();
    expect(result.status).toBe('operational');
  });
});
```

---

### Step 7: Env var requirements

For each provider check you add, ensure the API key is registered in all required places (follow project's "N-place env sync rule"):

| Provider | Env var |
|----------|---------|
| OpenAI | `OPENAI_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |

---

### Step 8: Verify

```bash
# Run the spec
npx nx test api --testPathPatterns=status.service.spec   # NestJS
pytest tests/test_ai_health.py -v                         # Python

# Watch for logs in dev (start API, wait for first cron tick)
# Or call the check directly via a health endpoint if exposed
```

---

## Lessons learned (from U-Rent implementation, 2026-04-25)

1. **`*/` in TypeScript JSDoc breaks the block comment** — the `*/` in `'0 */15 * * * *'` closes the `/** ... */` JSDoc, causing ~200 parse errors downstream. Escape as `'0 *\/15 * * * *'` or put the cron outside a JSDoc comment.

2. **`@google/generative-ai` v0.24.1 has no `listModels()`** — use `model.countTokens('.')` instead. It's free and validates both key and quota.

3. **Spy on the method, not the SDK** — in tests where `ConfigService.get` returns `undefined`, the client is `null` and checks return `DEGRADED`. Rather than mocking the SDK constructor, `jest.spyOn(service, 'checkOpenAi').mockResolvedValue(...)` is simpler and more stable.

4. **Alert on transitions, not every run** — logging every check result creates noise. Track last status and only log when it changes.

5. **`insufficient_quota` vs rate limit 429** — both are 429, but `error.code === 'insufficient_quota'` means billing issue (MAJOR_OUTAGE). Other 429s are rate limits (DEGRADED — key is valid).
