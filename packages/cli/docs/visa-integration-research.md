# Vercel CLI `domains buy` — Research & Visa Integration Design

## Part 1: How `vercel domains buy` Works Today

### 1.1 Command Routing

The Vercel CLI routes commands through a two-level dispatch system:

1. **Global dispatch** (`src/commands/index.ts` + `commands-bulk.ts`): The top-level command name `domains` (alias `domain`) is resolved and its handler is loaded.

2. **Subcommand dispatch** (`src/commands/domains/index.ts`): Uses `getSubcommand()` with a `COMMAND_CONFIG` map to match the first positional argument to a handler:

```typescript
const COMMAND_CONFIG = {
  add: ['add'],
  buy: ['buy'],
  inspect: ['inspect'],
  ls: ['ls', 'list'],
  move: ['move'],
  rm: ['rm', 'remove'],
  transferIn: ['transfer-in'],
};
```

When `vercel domains buy example.com` is invoked:
- The parent parser uses `permissive: true` so `buy`-specific flags pass through.
- `getSubcommand` matches `'buy'` → the `buy` handler in `src/commands/domains/buy.ts` is called with `(client, args)`.

**Key files:**
- `src/commands/domains/command.ts` — Subcommand metadata (currently `buySubcommand` has **no custom options/flags**).
- `src/commands/domains/index.ts` — Router / entry point.
- `src/commands/domains/buy.ts` — The `buy` handler (274 lines).

---

### 1.2 Authentication Flow

Authentication in `vercel domains buy` is **entirely implicit** — there is no domain-buy-specific auth code. The flow relies on the `Client` class:

1. **Token storage**: When a user runs `vercel login`, an OAuth access token (and optionally a refresh token) is persisted to `~/.vercel/auth.json` via `client.authConfig`.

2. **Token injection**: Every `client.fetch()` call automatically:
   - Calls `ensureAuthorized()` which checks if the access token is expired. If expired and a refresh token exists, it silently refreshes the token via OAuth.
   - Sets the `Authorization: Bearer <token>` header on every outgoing HTTP request.

3. **Team scoping**: `getScope(client)` resolves the current user/team context. The `purchaseDomain` utility appends `?teamId=<slug>` to the API URL when operating under a team.

4. **SAML re-auth**: If the API returns a SAML error (e.g., token not valid for the requested team), the `Client.fetch()` method triggers interactive re-authentication.

**There is no payment-method-specific authentication step.** The Vercel API backend uses the user's account-level payment method (card on file) — the CLI never sees or selects a specific card.

---

### 1.3 API Endpoints

The domain purchase flow calls **four Vercel API endpoints** via `client.fetch()`:

| Step | Endpoint | Method | Called By | Purpose |
|------|----------|--------|-----------|---------|
| 1 | `GET /v1/registrar/domains/{name}/price` | GET | `getDomainPrice()` | Fetches `purchasePrice`, `renewalPrice`, `transferPrice`, `years` |
| 2 | `GET /v1/registrar/domains/{name}/availability` | GET | `getDomainStatus()` | Returns `{ available: boolean }` |
| 3 | `POST /v1/registrar/domains/{name}/buy?teamId=...` | POST | `purchaseDomain()` | Initiates purchase; body contains `{ expectedPrice, autoRenew, years, contactInformation }` |
| 4 | `GET /v1/registrar/orders/{orderId}?teamId=...` | GET | `pollForOrder()` | Polls order status until `completed` or `failed` (500ms interval, 10s timeout) |

Steps 1 and 2 are called **in parallel** (`Promise.all`). Step 4 is a polling loop.

**Request body for the purchase POST** (`POST /v1/registrar/domains/{name}/buy`):

```json
{
  "expectedPrice": 12.99,
  "autoRenew": true,
  "years": 1,
  "contactInformation": {
    "firstName": "...",
    "lastName": "...",
    "email": "...",
    "phone": "+15551234567",
    "address1": "...",
    "city": "...",
    "state": "...",
    "zip": "...",
    "country": "US",
    "companyName": "..."  // optional
  }
}
```

**There is no `paymentMethodId` or card selection in the request body.** The backend charges the account's default payment method.

---

### 1.4 Payment Method Selection (Card on File)

**The CLI does not implement payment method selection.** The current flow:

1. The user's Vercel account has a payment method configured via the dashboard (`https://vercel.com/dashboard/settings/billing`).
2. When the CLI POSTs to `/v1/registrar/domains/{name}/buy`, the backend automatically charges the account's default payment method.
3. If payment fails, the order polling returns `order.error.code === 'payment_failed'`, which maps to `ERRORS.DomainPaymentError` and the CLI displays `"Your card was declined."`.

**There is no interactive card selection, no card number entry, and no payment method ID passed from the CLI.**

---

### 1.5 Success and Failure Handling

#### Success Path
1. `purchaseDomain()` POSTs to the buy endpoint → receives `{ orderId }`.
2. `pollForOrder()` polls `GET /v1/registrar/orders/{orderId}` every 500ms (up to 10s).
3. When `order.status === 'completed'` and the domain's status is `'completed'`, it fetches the domain details via `getDomain()`.
4. Returns the domain object to `buy.ts`.
5. `buy.ts` calls `output.success(...)` and `output.note(...)` to print the purchase confirmation and alias guidance.

#### Failure Paths

| Error Type | Trigger | CLI Message |
|------------|---------|-------------|
| `UnsupportedTLD` | API: `tld_not_supported` | "The TLD for domain name {name} is not supported." |
| `TLDNotSupportedViaCLI` | API: `additional_contact_info_required` | "Purchased for the TLD ... not supported via the CLI." |
| `InvalidDomain` | API: `invalid_domain` | "The domain {name} is not valid." |
| `DomainNotAvailable` | API: `domain_not_available` | "The domain {name} is not available." |
| `UnexpectedDomainPurchaseError` | Polling timeout or `internal_server_error` | "An unexpected error happened while performing the purchase." |
| `DomainPaymentError` | Order polling: `payment_failed` | "Your card was declined." |
| Catch-all exception | Unexpected throw | "An unexpected error occurred while purchasing your domain." |

#### Non-Interactive / Agent Mode
The `buy` command **explicitly blocks non-interactive execution** (`client.nonInteractive`) with a structured error:
- `reason: 'purchase_requires_user'`
- Message: "Domain purchase cannot be performed non-interactively."
- Suggests opening the Vercel dashboard or running the command interactively.

---

## Part 2: Visa Integration Design

### 2.1 Integration Strategy: Reuse vs. Fork

**Recommendation: Extend the existing `domains buy` flow, do not fork it.**

The existing flow is clean and modular:
- `buy.ts` orchestrates the user-facing flow (validation, prompts, output).
- `purchase-domain.ts` handles the API call and order polling.
- `collect-contact-information.ts` gathers registrant details.

A Visa integration should add a **payment method selection layer** between the price confirmation and the purchase API call, without duplicating the domain lookup, price checking, or order polling logic.

Two approaches are viable:

#### Approach A: `--visa` flag on `vercel domains buy` (Recommended)
Add a `--visa` flag to `buySubcommand.options` in `command.ts`. When present:
1. The CLI collects/validates a Visa credential before calling the purchase API.
2. The purchase POST body includes an additional `paymentMethod` field.

#### Approach B: Separate `vercel visa` top-level command
Creates `src/commands/visa/` with its own routing. This is heavier and only makes sense if Visa functionality spans beyond domain purchases (e.g., billing management, subscription upgrades).

**Approach A is preferred** because:
- The purchase is still a domain purchase — the Visa credential is just the payment instrument.
- It avoids duplicating all the domain validation, pricing, and order-polling logic.
- It follows the existing CLI pattern of feature flags on subcommands.

---

### 2.2 Passing Visa CLI Credential / Wallet Info to the API

Since the CLI must **never accept secrets via flags** (per `AGENTS.md` — flags leak into `ps` output and shell history), the Visa credential is collected as follows:

#### Live Behavior: Interactive Prompt (Primary Path)

When `--visa` is set, the CLI **always prompts** the user for their Visa credential interactively using `client.input.password()` (masked input):

```
? Visa wallet token: ••••••••••••
```

This is the canonical path for real usage. The credential is entered each time — it is not persisted to disk. This keeps the flow explicit and secure: the user is making a conscious financial decision and providing their own payment credential in real time.

If stdin is not a TTY (i.e., non-interactive / piped), the command errors out with guidance, consistent with how the rest of `domains buy` already blocks non-interactive execution.

#### Testing / CI: Environment Variable Override

For **automated tests and CI only**, the credential can be provided via the `VERCEL_VISA_TOKEN` environment variable. When this env var is set, the interactive prompt is skipped and the value is used directly. This lets test suites exercise the Visa payment path without mocking interactive input:

```bash
# In a test .env or CI config
VERCEL_VISA_TOKEN="test_vtok_hardcoded_for_ci"
```

The resolution order inside `getVisaCredential()`:

```typescript
async function getVisaCredential(client: Client): Promise<string> {
  // 1. Testing/CI override
  const envToken = process.env.VERCEL_VISA_TOKEN;
  if (envToken) {
    output.debug('Using Visa token from VERCEL_VISA_TOKEN environment variable');
    return envToken;
  }

  // 2. Live: interactive prompt (primary path)
  return client.input.password({
    message: 'Visa wallet token:',
    validate: (val: string) => val.length > 0 || 'Visa token is required',
  });
}
```

#### How it reaches the API

The Visa credential is passed in the **request body** of the purchase POST, not as a header:

```json
{
  "expectedPrice": 12.99,
  "autoRenew": true,
  "years": 1,
  "contactInformation": { ... },
  "paymentMethod": {
    "type": "visa",
    "token": "vtok_..."
  }
}
```

The backend must be extended to accept this new `paymentMethod` field and process payment through Visa's payment rails instead of the account's default card.

---

### 2.3 CLI Arguments and Flags Needed

#### Changes to `command.ts` (`buySubcommand`)

```typescript
export const buySubcommand = {
  name: 'buy',
  aliases: [],
  description: 'Purchase a new domain name',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [
    {
      name: 'visa',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Pay with Visa credential instead of card on file',
    },
  ],
  examples: [
    {
      name: 'Buy a domain with Visa',
      value: `${packageName} domains buy example.com --visa`,
    },
  ],
} as const;
```

#### Environment Variables
| Variable | Purpose |
|----------|---------|
| `VERCEL_VISA_TOKEN` | Visa wallet/credential token for non-interactive use |

#### No New Positional Arguments
The domain name remains the only positional argument. Visa selection is a flag.

---

### 2.4 Implementation Plan — Files to Change

#### Modified Files

| File | Change |
|------|--------|
| `src/commands/domains/command.ts` | Add `--visa` option to `buySubcommand.options` |
| `src/commands/domains/buy.ts` | Parse `--visa` flag; collect Visa credential; pass to `purchaseDomain()` |
| `src/util/domains/purchase-domain.ts` | Accept optional `paymentMethod` param; include in POST body |
| `src/util/domains/purchase-domain-if-available.ts` | Optionally accept `paymentMethod` and forward to `purchaseDomain()` |
| `src/util/telemetry/commands/domains/buy.ts` | Add `trackCliFlagVisa()` method |
| `src/util/errors-ts.ts` | Add `VisaPaymentError` class (optional, if backend returns Visa-specific error codes) |

#### New Files

| File | Purpose |
|------|---------|
| `src/util/domains/get-visa-credential.ts` | Prompts user for Visa token interactively (live), falls back to `VERCEL_VISA_TOKEN` env var (testing/CI) |
| `test/unit/commands/domains/buy-visa.test.ts` | Tests for the `--visa` flow (uses `VERCEL_VISA_TOKEN` env var to provide credential in test harness) |

---

### 2.5 Detailed Flow: `vercel domains buy example.com --visa`

```
1. Parse flags → detect --visa
2. Track telemetry: trackCliFlagVisa(true)
3. Validate domain name (same as today)
4. Block non-interactive execution (same as today — purchase requires user)
5. Check price + availability in parallel (same as today)
6. Prompt: "Buy now for $12.99 (1yr)?" (same as today)
7. Prompt: "Auto renew?" (same as today)
8. Collect contact information (same as today)
9. NEW: Collect Visa credential via getVisaCredential(client):
   a. If VERCEL_VISA_TOKEN env var is set → use it (testing/CI only)
   b. Otherwise → prompt interactively with client.input.password() (live behavior)
10. Call purchaseDomain(client, name, price, years, autoRenew, contact, { type: 'visa', token })
11. POST /v1/registrar/domains/{name}/buy with paymentMethod in body
12. Poll for order (same as today)
13. Handle success/failure (same as today, plus Visa-specific errors)
```

---

### 2.6 Non-Interactive / Agent Mode Considerations

The current `buy` command **blocks non-interactive execution entirely**, and this does not change with `--visa`. Domain purchase is a financial commitment that requires explicit human confirmation. The `--visa` flag adds a credential prompt to the interactive flow but does not create a non-interactive path.

For **testing/CI**, the `VERCEL_VISA_TOKEN` env var bypasses the interactive prompt for the credential only. The rest of the buy flow (price confirmation, auto-renew, contact info) still requires interactive input — these are handled by the test harness via `client.stdin.write()` in unit tests, just like the existing `buy.test.ts` does today.

---

### 2.7 Error Handling Extensions

New error scenarios to handle:

| Error | API Code (proposed) | CLI Message |
|-------|---------------------|-------------|
| Invalid Visa token | `visa_token_invalid` | "The Visa credential is invalid or expired. Please check your token." |
| Visa payment declined | `visa_payment_declined` | "Your Visa payment was declined." |
| Visa not supported for TLD | `visa_not_supported_for_tld` | "Visa payment is not supported for .{tld} domains." |
| Visa service unavailable | `visa_service_unavailable` | "Visa payment service is currently unavailable. Try again later or use card on file." |

These map to new error classes in `errors-ts.ts` or can reuse the existing `DomainPaymentError` with an extended message.

---

### 2.8 API Surface Summary

#### Existing Endpoints (No Change)
- `GET /v1/registrar/domains/{name}/price`
- `GET /v1/registrar/domains/{name}/availability`
- `GET /v1/registrar/orders/{orderId}`

#### Modified Endpoint
- `POST /v1/registrar/domains/{name}/buy` — Request body extended with optional `paymentMethod`:

```typescript
interface PurchaseRequest {
  expectedPrice: number;
  autoRenew: boolean;
  years: number;
  contactInformation: ContactInformation;
  paymentMethod?: {
    type: 'visa';
    token: string;
  };
}
```

When `paymentMethod` is omitted, the backend falls back to the account's default payment method (backward compatible).

---

### 2.9 Architecture Diagram

```
User: vercel domains buy example.com --visa
         │
         ▼
┌─────────────────────────────────────┐
│  domains/index.ts (router)          │
│  getSubcommand('buy') → buy.ts      │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  domains/buy.ts                     │
│  1. Parse --visa flag               │
│  2. Validate domain                 │
│  3. getDomainPrice() ──────────────────► GET /v1/registrar/domains/{name}/price
│  4. getDomainStatus() ─────────────────► GET /v1/registrar/domains/{name}/availability
│  5. Prompt: confirm purchase        │
│  6. Prompt: auto-renew              │
│  7. collectContactInformation()     │
│  8. getVisaCredential() [NEW]       │
│     ├─ prompt: password input (live)│
│     └─ env: VERCEL_VISA_TOKEN (CI)  │
│  9. purchaseDomain(... paymentMethod)│
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  util/domains/purchase-domain.ts    │
│  POST /v1/registrar/domains/        │
│       {name}/buy?teamId=...         │
│  Body: {                            │
│    expectedPrice, autoRenew, years, │
│    contactInformation,              │
│    paymentMethod: {                 │
│      type: 'visa', token: '...'     │
│    }                                │
│  }                                  │
│                                     │
│  pollForOrder(orderId) ────────────────► GET /v1/registrar/orders/{orderId}
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  buy.ts (result handling)           │
│  ✔ Success: "Domain purchased"      │
│  ✗ Failure: payment/domain errors   │
└─────────────────────────────────────┘
```

---

### 2.10 Security Considerations

1. **Never accept Visa tokens via CLI flags** — they would leak into shell history and `ps` output. The live path uses `client.input.password()` (masked interactive prompt) exclusively.
2. **Env var is for testing only** — `VERCEL_VISA_TOKEN` exists so test suites and CI can exercise the payment path. It should be documented as a testing escape hatch, not a recommended production workflow.
3. **Mask Visa tokens in debug output** — if `output.debug()` logs request bodies, redact the token field.
4. **Token format validation** — validate the Visa token format client-side before sending to the API to fail fast on typos.
5. **No token persistence** — unlike the Vercel auth token, Visa tokens should NOT be stored in config files. They are collected fresh each time the user runs the command.

---

### 2.11 Changeset

The changeset for this feature:

```md
---
'@vercel/cli': minor
---

Added `--visa` flag to `vercel domains buy` for Visa credential-based domain purchases.
```

---

## Part 3: How to Test This

### Prerequisites

From the repo root, install dependencies and build all packages the CLI depends on:

```bash
pnpm install
pnpm build --filter vercel...
```

The `--filter vercel...` syntax builds the CLI package (`vercel`) and all its workspace dependencies (`@vercel/build-utils`, `@vercel/frameworks`, `@vercel-internals/get-package-json`, etc.). Without this build step, Vitest will fail with `Failed to resolve entry for package` errors.

### 3.1 Run Existing `domains buy` Unit Tests (Baseline)

Before making any changes, confirm the existing tests pass:

```bash
npx vitest run packages/cli/test/unit/commands/domains/buy.test.ts
```

The existing test file (`test/unit/commands/domains/buy.test.ts`) covers:

- **Subcommand telemetry**: Runs `domains buy` with no domain arg, expects exit code `1` and a `subcommand:buy` telemetry event.
- **`--help` telemetry**: Runs `domains buy --help`, expects exit code `2` and a `flag:help` telemetry event.
- **Non-interactive rejection**: Sets `client.nonInteractive = true`, runs `domains buy brookedato.tech --non-interactive`, and asserts the structured JSON error output includes `reason: 'purchase_requires_user'` and the message contains `'Agents must not purchase'`.
- **Domain argument telemetry**: Mocks `GET /v1/registrar/domains/example.com/price` and `GET /v1/registrar/domains/example.com/availability` via `client.scenario`, runs `domains buy example.com`, waits for the `"Buy now for $100 (1yr)?"` prompt via `toOutput`, sends `'n\n'` to decline, and checks the domain argument is redacted in telemetry.

**Important**: The test file deletes `process.env.CI` in `beforeAll` and restores it in `afterAll` because `buy.ts` line 58 checks `!!process.env.CI` and errors out if it's set (CI mode blocks domain purchase since it can't collect contact info interactively).

### 3.2 How to Write Visa Integration Tests

New tests go in `test/unit/commands/domains/buy-visa.test.ts`. They follow the exact same patterns as the existing `buy.test.ts`.

**Test infrastructure the existing tests use** (available for Visa tests too):

| Component | Import | What it does |
|-----------|--------|-------------|
| `client` | `../../../mocks/client` | Mock `Client` instance with an Express mock server, stdin/stderr streams, and telemetry store. Auto-resets between tests. |
| `useUser()` | `../../../mocks/user` | Registers a `GET /v2/user` mock route. Required whenever the command calls `getScope(client)` (which calls `getUser`). |
| `client.scenario.get(path, handler)` | (on `client`) | Register a mock GET route on the Express server backing `client.fetch()`. |
| `client.scenario.post(path, handler)` | (on `client`) | Register a mock POST route. Capture `req.body` to assert on the request payload. |
| `client.setArgv(...)` | (on `client`) | Set the argv that `buy.ts` will parse. |
| `client.stdin.write(...)` | (on `client`) | Feed interactive input to prompts (confirm, text, password). |
| `toOutput(text)` | (on `client.stderr`) | Wait up to 3s for `text` to appear in stderr output. |

**Key pattern for testing the Visa flow end-to-end:**

1. Set `process.env.VERCEL_VISA_TOKEN` to a test value (avoids needing to mock the password prompt).
2. Mock all four API routes: price, availability, buy (POST), and orders (GET).
3. Capture the POST body from the buy route to assert it contains `paymentMethod`.
4. Feed interactive input for the confirm/auto-renew/contact prompts via `client.stdin.write()`.
5. Clean up the env var in `afterEach`.

**Example test skeleton** (this is what a real test would look like once the implementation ships):

```typescript
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

describe('domains buy --visa', () => {
  let origCI: string | undefined;

  beforeAll(() => {
    origCI = process.env.CI;
    delete process.env.CI;
  });

  afterAll(() => {
    process.env.CI = origCI;
  });

  afterEach(() => {
    delete process.env.VERCEL_VISA_TOKEN;
  });

  it('should include paymentMethod in the purchase POST body', async () => {
    useUser();

    process.env.VERCEL_VISA_TOKEN = 'test_vtok_abc123';

    let capturedBody: any;

    client.scenario.get(
      '/v1/registrar/domains/example.com/price',
      (_req, res) => {
        res.json({
          purchasePrice: 100,
          renewalPrice: 100,
          transferPrice: null,
          years: 1,
        });
      }
    );

    client.scenario.get(
      '/v1/registrar/domains/example.com/availability',
      (_req, res) => {
        res.json({ available: true });
      }
    );

    client.scenario.post(
      '/v1/registrar/domains/example.com/buy',
      (req, res) => {
        capturedBody = req.body;
        res.json({ orderId: 'ord_test123' });
      }
    );

    client.scenario.get('/v1/registrar/orders/ord_test123', (_req, res) => {
      res.json({
        orderId: 'ord_test123',
        status: 'completed',
        domains: [{ domainName: 'example.com', status: 'completed' }],
      });
    });

    // Also need GET /v4/domains/example.com for the getDomain call after success
    client.scenario.get('/v4/domains/example.com', (_req, res) => {
      res.json({
        domain: {
          name: 'example.com',
          serviceType: 'external',
          // ... domain fields
        },
      });
    });

    client.setArgv('domains', 'buy', 'example.com', '--visa');
    const exitCodePromise = domains(client);

    // Respond to interactive prompts
    await expect(client.stderr).toOutput('Buy now for $100 (1yr)?');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput('Auto renew yearly');
    client.stdin.write('y\n');

    // Contact info prompts (9 fields)
    await expect(client.stderr).toOutput('First name:');
    client.stdin.write('Jane\n');
    await expect(client.stderr).toOutput('Last name:');
    client.stdin.write('Doe\n');
    await expect(client.stderr).toOutput('Email:');
    client.stdin.write('jane@example.com\n');
    await expect(client.stderr).toOutput('Phone');
    client.stdin.write('+15551234567\n');
    await expect(client.stderr).toOutput('Address:');
    client.stdin.write('123 Main St\n');
    await expect(client.stderr).toOutput('City:');
    client.stdin.write('Anytown\n');
    await expect(client.stderr).toOutput('State');
    client.stdin.write('CA\n');
    await expect(client.stderr).toOutput('Postal');
    client.stdin.write('90210\n');
    await expect(client.stderr).toOutput('Country');
    client.stdin.write('US\n');
    await expect(client.stderr).toOutput('Company');
    client.stdin.write('\n');

    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);

    // THE CRITICAL ASSERTION: paymentMethod was sent in the POST body
    expect(capturedBody.paymentMethod).toEqual({
      type: 'visa',
      token: 'test_vtok_abc123',
    });
    expect(capturedBody.expectedPrice).toBe(100);
  });
});
```

**What this test validates:**
- The `--visa` flag is parsed correctly.
- `VERCEL_VISA_TOKEN` env var is read by `getVisaCredential()`.
- The POST to `/v1/registrar/domains/{name}/buy` includes the `paymentMethod` field in the body alongside the existing fields (`expectedPrice`, `autoRenew`, `years`, `contactInformation`).
- The rest of the purchase flow (polling, success output) works as before.

### 3.3 Running a Single Test

```bash
npx vitest run packages/cli/test/unit/commands/domains/buy-visa.test.ts
```

### 3.4 What NOT to Test This Way

- **Do not call real Vercel API endpoints.** All API calls are mocked via `client.scenario`. The mock server is a real Express instance started by the test harness — `client.fetch()` hits `http://localhost:<port>` instead of `https://api.vercel.com`.
- **Do not test real payment processing.** The mock POST handler returns a canned `{ orderId }` response. The Visa token value is never sent to any external service.
- **Do not set `process.env.CI` during tests.** The existing `buy.ts` checks `!!process.env.CI` on line 58 and errors out before reaching the prompts. The existing test suite deletes it in `beforeAll`.

### 3.5 Manual Testing (Build & Run Locally)

To test the full interactive experience with a local build:

```bash
# From repo root
pnpm build

# Run the CLI — this hits the REAL Vercel API
# DO NOT run with --visa against production unless the backend supports it
node packages/cli/dist/index.js domains buy example-domain.com --visa
```

The interactive flow will prompt for:
1. Purchase confirmation (price + years)
2. Auto-renew confirmation
3. Contact information (9 fields)
4. Visa wallet token (masked password input)

### 3.6 Verifying the Existing Baseline

Before starting implementation, verify nothing is broken:

```bash
# Run all domain-related unit tests
npx vitest run packages/cli/test/unit/commands/domains/

# Type-check (catches any type errors in modified files)
pnpm type-check

# Lint
pnpm lint
```
