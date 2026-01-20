# Implementation Summary

## Files Created

### 1. `/packages/cervel/src/plugins/externals.ts`

**Purpose:** Externalize npm packages from node_modules and trace them with NFT.

**Key Features:**

- Detects imports resolving to `node_modules/`
- Marks them as external (not bundled)
- Collects paths during build
- Runs NFT tracing in `buildEnd` hook
- Copies traced files to output `node_modules/`

**What it handles:**

- NPM packages like `hono`, `pg`, `redis`, `sharp`
- Native binaries (`.node` files)
- Platform-specific packages (e.g., `@img/sharp-darwin-arm64`)

### 2. `/packages/cervel/src/plugins/workspace.ts`

**Purpose:** Externalize workspace packages and transpile them separately.

**Key Features:**

- Detects imports resolving to monorepo packages (outside node_modules)
- Marks them as external (not bundled into main output)
- Tracks workspace package imports
- Transpiles each workspace package separately in `buildEnd`
- Outputs transpiled code to `node_modules/@repo/package-name/`
- Generates minimal `package.json` for Node.js resolution

**What it handles:**

- Workspace packages like `@repo/echo`, `@repo/echo-with-ts`
- TypeScript → JavaScript transpilation
- ESM/CJS format handling

## Files Modified

### 3. `/packages/cervel/src/rolldown.ts`

**Changes:**

- Removed manual `external` array construction from package.json
- Added plugin imports
- Created plugins array with `externals()` and `workspace()` plugins
- Plugins only active when `!isBundled` (preserveModules mode)

### 4. `/packages/cervel/src/index.ts`

**Changes:**

- Re-exported `externals` and `workspace` plugins for advanced usage

### 5. `/packages/cervel/package.json`

**Changes:**

- Added `@vercel/nft": "1.1.1"` dependency

## How It Works

### Build Flow

1. **Main Rolldown Build** (with `preserveModules: true`):

   - User code transpiled in-place
   - NPM packages marked as external by `externals` plugin
   - Workspace packages marked as external by `workspace` plugin
   - Output: Transpiled user code with import statements preserved

2. **Post-Build Phase** (in `buildEnd` hooks):

   **Externals Plugin:**

   - Runs NFT on all npm package paths
   - Copies traced files to `.output/node_modules/`
   - Preserves directory structure
   - Includes native binaries

   **Workspace Plugin:**

   - Transpiles each workspace package separately
   - Outputs to `.output/node_modules/@repo/package-name/`
   - Creates minimal package.json for resolution

### Detection Logic

**NPM Package Detection:**

```typescript
const isInNodeModules = resolvedPath.includes('/node_modules/');
if (isInNodeModules) {
  // Externalize and trace
}
```

**Workspace Package Detection:**

```typescript
const isInMonorepo = resolvedPath.startsWith(repoRootPath);
const isInNodeModules = resolvedPath.includes('/node_modules/');
if (isInMonorepo && !isInNodeModules && !id.startsWith('.')) {
  // Externalize and transpile
}
```

### Output Structure

```
.output/
├── index.mjs                     # Main entry (transpiled)
├── utils.mjs                     # Local files (transpiled)
└── node_modules/
    ├── @repo/
    │   └── echo-with-ts/         # Workspace deps (transpiled)
    │       ├── index.mjs
    │       └── package.json
    ├── hono/                     # NPM deps (NFT traced)
    ├── pg/
    ├── sharp/
    └── @img/
        └── sharp-darwin-arm64/   # Native binaries (traced)
```

## Known Limitations

### CJS Named Exports

Named imports from CommonJS packages will cause runtime errors:

```javascript
// ❌ Fails at runtime
import { sign } from 'jsonwebtoken';

// ✅ Works
import pkg from 'jsonwebtoken';
const { sign } = pkg;
```

**Affected packages:** `jsonwebtoken`, `bcrypt`, older CJS packages

**Status:** Accepted limitation for now. Future solutions could include:

- `@rollup/plugin-commonjs` integration
- Static analysis to rewrite imports
- Build-time warnings

## Testing

**Test location:** `/Users/jeffsee/code/turborepo-hono-monorepo/apps/api`

**Test file:** `server.ts` exercises:

- ✅ Workspace dependencies (`@repo/echo-with-ts`)
- ✅ Pure ESM packages (`hono`)
- ✅ Native binary packages (`pg`, `redis`, `sharp`)
- ⚠️ CJS packages (`jsonwebtoken`) - known limitation

**Success Criteria:**

1. Build completes without errors
2. NPM packages in `.output/node_modules/`
3. Workspace packages transpiled to `.output/node_modules/@repo/`
4. Native binaries traced and copied
5. Runtime works (except CJS named export issues)

## Next Steps

1. Run `pnpm install` to resolve dependencies
2. Build cervel: `pnpm --filter @vercel/cervel build`
3. Test with turborepo-hono-monorepo project
4. Verify output structure matches expectations
5. Test runtime execution
