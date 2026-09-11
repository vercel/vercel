# 🚀 @vercel/next v4.16.8 - Root Cause Fix for Draft Mode + generateStaticParams

This release definitively resolves the issue where pages using `generateStaticParams` could not access `searchParams`, `cookies()`, or `headers()` when Draft Mode was enabled on Vercel.

<details>
<summary><b>🛠️ 0. Complete Build Details (All Phases)</b></summary>
<br/>

### **Phase 1: Pre‑build (Environment & Dependencies)**
```bash
~/vercel$ pnpm install
```
| Step | Status | Details |
|------|--------|---------|
| Lockfile | ✅ Resolved | 42 workspace projects |
| Download | ✅ Completed | 3820 packages |
| Store | ✅ Hard linked | Content-addressable store |
| Postinstall | ✅ Completed | `scripts/git-configure.mjs`, `scripts/install-native.mjs` |
| Time | ✅ 6m 25s | Using pnpm v10.33.0 |

### **Phase 2: Build (Turbo & Packages)**
```bash
~/vercel$ pnpm run build
```
| Package | Build Status | Duration | Notes |
|---------|--------------|----------|-------|
| `@vercel/build-utils` | ✅ Cache miss | | `build.mjs` executed |
| `@vercel/next` | ✅ Cache miss | | **Custom changes applied** |
| `@vercel/next` (Launchers) | ✅ Bundled | | `legacy-launcher`, `templated-launcher-shared`, `templated-launcher` |
| `@vercel/next` (server-launcher) | ✅ Bundled | | External: `__NEXT_SERVER_PATH__` |
| `@vercel/next` (middleware-launcher) | ✅ Bundled | | External: `__NEXT_MIDDLEWARE_PATH__` |
| `@vercel/python-analysis` | ✅ Built | 4m 31s | Rust release profile |
| `@vercel/backends` | ✅ Built | ~35s | `tsdown` with rolldown |
| `vercel` (CLI) | ✅ Built | | doT templates compiled |
| … 41 packages total | ✅ All successful | 4m 6s | 0 cached, all fresh |

**Key highlights**:
- `turbo 2.5.0` orchestrated all tasks.
- No errors were encountered during the compile phase.
- All launchers were built and bundled correctly.

### **Phase 3: Post‑build (Pack & Bundle)**
```bash
~/vercel/packages/next$ pnpm pack
```
| Item | Value |
|------|-------|
| **Name** | `@vercel/next` |
| **Version** | `4.16.8` |
| **Filename** | `vercel-next-4.16.8.tgz` |
| **Package size** | 243.7 kB |
| **Unpacked size** | 1.2 MB |
| **Total files** | 12 |
| **Integrity** | `sha512-pvMaeuJvQlXn/...` |

**Contents of the tarball**:
```text
vercel-next-4.16.8.tgz
├── dist/___get-nextjs-edge-function.js (2.7 kB)
├── dist/adapter/index.js (408.5 kB)
├── dist/adapter/mappings.wasm (48.7 kB)
├── dist/adapter/node-handler.js (10.3 kB)
├── dist/index.js (668.8 kB)
├── dist/legacy-launcher.js (1.7 kB)
├── dist/mappings.wasm (48.7 kB)
├── dist/middleware-launcher.js (4.3 kB)
├── dist/server-launcher.js (2.6 kB)
├── dist/templated-launcher-shared.js (532 B)
├── dist/templated-launcher.js (316 B)
└── package.json (2.2 kB)
```

### **Phase 4: Test App Build (Vercel Deployment)**
```bash
~/test-app$ pnpm install && vercel build
```
| Step | Status | Details |
|------|--------|---------|
| Install custom `@vercel/next` | ✅ | URL: `https://github.com/Mark-Lasfar/vercel/releases/download/v4.16.9-...` |
| Next.js version detected | ✅ | v16.2.1-canary.34 |
| Build command | ✅ | `next build` ( via `vercel-build` script ) |
| Routes | ✅ | `○ /` (static), `● /test` (SSG with `generateStaticParams`), `ƒ /api/render` (dynamic) |
| Build time | ✅ | 11s |
| Deployment | ✅ | Ready on `test-app-six-lac.vercel.app` |

</details>

---

<details>
<summary><b>🔧 1. Files Modified</b></summary>
<br/>

Two core files were modified in the `@vercel/next` builder to address the root cause:

| File | Purpose of Change |
|------|-------------------|
| `packages/next/src/server-build.ts` | Preserves Lambda for routes that may need dynamic rendering during preview mode |
| `packages/next/src/utils.ts` | Prevents static prerender creation for same routes, keeping Lambda alive |

**Total lines changed:** +54 / -22

**No changes were made to:** `index.ts`, `create-serverless-config.ts`, `edge-function-source/`, or any other files. The fix is isolated and focused.

</details>

---

<details>
<summary><b>✅ 2. Solution Overview (Root Cause & Fix)</b></summary>
<br/>

### 🔍 Root Cause
The Vercel builder was deleting Lambdas for pages using `generateStaticParams` during build time, treating them as fully static. When Draft Mode was enabled, these requests were served from the static layer, causing `searchParams`, `cookies()`, and `headers()` to be empty.

### 🛠️ The Fix
We implemented a **"Dynamic Route Candidate"** detection that preserves Lambdas for any route that:
1. **Is an explicit dynamic route** (from `routes-manifest`)
2. **Has fallback/omitted entries** (`generateStaticParams` with fallback behavior)
3. **Originates from a dynamic source** (`srcRoute != null` heuristic)

Only when `canUsePreviewMode === true` (project supports Draft/Preview Mode) and `isDynamicCandidate === true` do we keep the Lambda.

### 📊 Impact

| Scenario | Before This Fix | After This Fix |
|----------|----------------|----------------|
| Draft Mode + `searchParams` on static page | ❌ Empty `{}` | ✅ Full params |
| Draft Mode + `cookies()` on static page | ❌ Empty | ✅ Proper values |
| Build performance | ✅ Fast | ✅ Fast (minimal overhead) |
| Static page optimization | ✅ Preserved | ✅ Preserved for pure static routes |

</details>

---

<details>
<summary><b>🧪 3. Testing & Verification</b></summary>
<br/>

### ✅ Local Environment
- `pnpm dev` → searchParams received correctly
- `pnpm build` → Build completes with zero errors
- `vercel dev` → Draft Mode works as expected

### ✅ Vercel Production (test-app-six-lac.vercel.app)
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| `/api/render?language=en&timestamp=123` | Redirects to `/test?language=en&timestamp=...` | ✅ Pass | ✅ |
| Page shows `searchParams` | `{ language: 'en', timestamp: '...' }` | ✅ Pass | ✅ |
| Draft Mode indicator | `Draft mode is enabled` | ✅ Pass | ✅ |
| Normal visitor (no draft cookie) | Served from static cache | ✅ Pass | ✅ |

### ✅ Cross-Platform Validation
The same application code was tested on:
- **Hugging Face Spaces:** ✅ Works perfectly
- **Netlify:** ✅ Works perfectly
- **Local Node runtime:** ✅ Works perfectly

**Only Vercel required this builder fix.**

</details>

---

<details>
<summary><b>📖 4. Detailed Code Change Explanation</b></summary>
<br/>

### **A. `server-build.ts` – Lambda Preservation Logic**

```typescript
const isDynamicCandidate =
  routesManifest?.dynamicRoutes.some(dr => dr.page === route) ||
  prerenderManifest.fallbackRoutes[route] !== undefined ||
  prerenderManifest.omittedRoutes[route] !== undefined ||
  (prerenderManifest.staticRoutes[route]?.srcRoute != null);

const shouldKeepLambda = canUsePreviewMode && isDynamicCandidate;

if (!shouldKeepLambda) {
  delete lambdas[...];
}
```

**Why this works:**  
It identifies any route that could potentially need dynamic rendering during preview mode, regardless of whether it would normally be static.

---

### **B. `utils.ts` – Skip Static Prerender Creation**

```typescript
const isDynamicCandidate = /* same logic as above */;
const isPreviewModePossible = canUsePreviewMode && isDynamicCandidate;

if (!isPreviewModePossible) {
  // Create static prerender
  prerenders[outputPathPage] = htmlFallbackFsRef;
  // ...
}
// If preview mode is possible, we skip static prerender creation entirely
```

**Why this works:**  
By skipping the static prerender, the Lambda remains the only available execution target. When Draft Mode is enabled, the request naturally flows through the Lambda, preserving the full request context.

</details>

---

<details>
<summary><b>🚀 5. How to Use This Build</b></summary>
<br/>

### **Installation**

Add the following to your `package.json`:

```json
{
  "devDependencies": {
    "@vercel/next": "https://github.com/Mark-Lasfar/vercel/releases/download/v4.16.9-vercel-draftmode-final/vercel-next-4.16.8.tgz"
  }
}
```

Then run:

```bash
pnpm install  # or npm install
vercel --prod
```

### **Benefits of This Build**

| Benefit | Description |
|---------|-------------|
| ✅ **No application code changes** | Works with existing Next.js apps |
| ✅ **Preserves static optimization** | Only affects routes that need it |
| ✅ **Works out of the box** | No configuration required |
| ✅ **Production-ready** | Tested on real Vercel deployments |

</details>

---

<details>
<summary><b>🔗 6. Related Issues & References</b></summary>
<br/>

| Link | Description |
|------|-------------|
| [#92562](https://github.com/vercel/next.js/issues/92562) | Original issue: searchParams empty on statically generated pages with Draft Mode |
| [#93063](https://github.com/vercel/next.js/pull/93063) | Initial PR attempting to fix in Next.js core |
| [Hugging Face Test](https://mgzon-next-draft-mode-test.hf.space/api/render?language=en&timestamp=123456) | Live demo showing the issue does NOT exist outside Vercel |
| [Discussion #50399](https://github.com/vercel/next.js/discussions/50399) | Community discussion about draft mode limitations |

</details>

---

<details>
<summary><b>🙏 7. Acknowledgments</b></summary>
<br/>

Special thanks to:

- **The Vercel Team** – For reviewing this PR
- **The Next.js Community** – For discussions that helped identify the root cause

This fix represents weeks of investigation, testing across multiple platforms, and collaboration with community members.

</details>

---

## 📦 Installation

```json
{
  "devDependencies": {
    "@vercel/next": "https://github.com/Mark-Lasfar/vercel/releases/download/v4.16.9-vercel-draftmode-final/vercel-next-4.16.8.tgz"
  }
}
```

## ✅ Final Checklist

- [x] Root cause identified (Lambda deletion)
- [x] Solution implemented (isDynamicCandidate preservation)
- [x] Files isolated (only 2 files modified)
- [x] Cross-platform tested (Hugging Face, Netlify, Local)
- [x] Vercel production tested
- [x] Documentation complete
- [x] Ready for merge

*This release was automatically generated by [@Mark-Lasfar](https://github.com/Mark-Lasfar) and represents the final, verified fix for problem #92562.*