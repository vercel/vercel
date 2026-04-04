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
5. `buy.ts` prints: `✔ Domain {name} purchased {time}` + a note about using it as an alias.

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

Since the CLI must **never accept secrets via flags** (per `AGENTS.md` — flags leak into `ps` output and shell history), the Visa credential must be provided through one of:

#### Option 1: Environment Variable (Recommended for CI/Automation)
```bash
export VERCEL_VISA_TOKEN="vtok_..."
vercel domains buy example.com --visa
```

The CLI reads `process.env.VERCEL_VISA_TOKEN` when `--visa` is set.

#### Option 2: Interactive Prompt (Recommended for TTY)
When `--visa` is set and no env var is found, prompt the user:
```
? Visa wallet token: ••••••••••••
```
Using `client.input.password()` (masked input).

#### Option 3: Config File
Store the Visa credential in `~/.vercel/visa.json` (similar to `auth.json`). The CLI reads it when `--visa` is set.

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

Alternatively, if the backend prefers, a custom header could carry the token:
```
X-Visa-Payment-Token: vtok_...
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
| `src/util/domains/get-visa-credential.ts` | Reads Visa token from env var, prompts if interactive, validates format |
| `test/unit/commands/domains/buy-visa.test.ts` | Tests for the `--visa` flow |

---

### 2.5 Detailed Flow: `vercel domains buy example.com --visa`

```
1. Parse flags → detect --visa
2. Track telemetry: trackCliFlagVisa(true)
3. Validate domain name (same as today)
4. Check price + availability in parallel (same as today)
5. Prompt: "Buy now for $12.99 (1yr)?" (same as today)
6. Prompt: "Auto renew?" (same as today)
7. Collect contact information (same as today)
8. NEW: Collect Visa credential:
   a. If VERCEL_VISA_TOKEN env var is set → use it
   b. Else if interactive → prompt with password input
   c. Else → error: "Visa token required. Set VERCEL_VISA_TOKEN or run interactively."
9. Call purchaseDomain(client, name, price, years, autoRenew, contact, { type: 'visa', token })
10. POST /v1/registrar/domains/{name}/buy with paymentMethod in body
11. Poll for order (same as today)
12. Handle success/failure (same as today, plus Visa-specific errors)
```

---

### 2.6 Non-Interactive / Agent Mode Considerations

The current `buy` command **blocks non-interactive execution entirely**. With Visa, there are two paths:

1. **Keep the block**: Even with `--visa`, require interactive execution because domain purchase involves financial commitment. This is the safer approach.

2. **Allow non-interactive with all flags**: If all required data can be provided via flags/env vars (domain, `--yes` for confirmation, `VERCEL_VISA_TOKEN`, contact info via flags), allow non-interactive execution. This requires adding contact info flags to `buySubcommand` (currently collected interactively only).

**Recommendation**: Keep the interactive requirement for now. Domain purchases are high-stakes and benefit from explicit human confirmation.

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
│     ├─ env: VERCEL_VISA_TOKEN       │
│     └─ prompt: password input       │
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

1. **Never accept Visa tokens via CLI flags** — they would leak into shell history and `ps` output. Use env vars or interactive prompts only.
2. **Mask Visa tokens in debug output** — if `output.debug()` logs request bodies, redact the token field.
3. **Token format validation** — validate the Visa token format client-side before sending to the API to fail fast on typos.
4. **No token persistence** — unlike the Vercel auth token, Visa tokens should NOT be stored in config files by default (per-transaction use).

---

### 2.11 Changeset

The changeset for this feature:

```md
---
'@vercel/cli': minor
---

Added `--visa` flag to `vercel domains buy` for Visa credential-based domain purchases.
```
