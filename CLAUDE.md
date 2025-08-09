# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the official Vercel monorepo containing the Vercel CLI, runtime packages, and various tools for deployment and development. The repository uses pnpm workspace and turbo for monorepo management.

## Key Commands

### Development Setup

```bash
corepack enable
pnpm install
pnpm build
```

### Build and Test

- `pnpm build` - Build all packages (runs utils/gen.js and turbo build)
- `pnpm test-unit` - Run unit tests for all packages
- `pnpm test-cli` - Run CLI-specific tests
- `pnpm test-e2e` - Run end-to-end tests
- `pnpm test-dev` - Run development server tests
- `pnpm test` - Run integration tests in test/ directory

### Code Quality

- `pnpm lint` - Run ESLint on TypeScript and JavaScript files
- `pnpm type-check` - Run TypeScript type checking across all packages
- `pnpm prettier-check` - Check code formatting

### CLI Development

To test CLI changes locally:

```bash
cd packages/cli
pnpm vercel <cli-commands...>
```

### Package Management

- `pnpm pack` - Create distribution packages (runs utils/pack.ts)
- `pnpm ci:version` - Version management with changesets
- `pnpm ci:publish` - Publish packages to npm

## Architecture

### Monorepo Structure

- **packages/** - Main packages including CLI, build-utils, runtimes (node, python, etc.)
- **api/** - API endpoints and framework detection
- **examples/** - Framework integration examples and tests
- **internals/** - Shared internal packages (constants, types, etc.)
- **test/** - Integration test utilities and deployment helpers
- **utils/** - Build scripts and development utilities

### Key Packages

- **packages/cli** - Main Vercel CLI (`vercel` command)
- **packages/build-utils** - Core build system utilities and types
- **packages/node** - Node.js runtime for serverless functions
- **packages/next** - Next.js framework integration
- **packages/static-build** - Static site generation runtime
- **packages/client** - Vercel platform API client

### Testing Strategy

- Unit tests with Jest (packages use `jest` or `vitest`)
- Integration tests deploy to actual Vercel accounts under "test" project name
- CLI tests verify command functionality
- E2E tests validate full deployment workflows

### Build System

- Uses Turbo for parallel builds and caching
- TypeScript compilation with shared tsconfig.base.json
- Custom build utilities in utils/ directory
- Package interdependencies managed through workspace protocol

## Runtime Development

This repository contains multiple runtime packages for different languages/frameworks. Each runtime implements the Runtime API interface defined in DEVELOPING_A_RUNTIME.md. When working on runtimes:

- Implement required `version` and `build()` exports
- Optional exports: `prepareCache()`, `shouldServe()`, `startDevServer()`
- Use `@vercel/build-utils` types and utilities
- Test with both unit tests and integration deployments

## Integration Tests

Integration tests create real deployments using the "test" project. To run locally, you need:

1. VERCEL_TOKEN environment variable with personal access token
2. VERCEL_TEAM_ID for your team
3. Deployment Protection disabled on test project

## Code Conventions

- ESLint configuration with TypeScript rules in package.json
- Prettier formatting (single quotes, trailing commas, arrow parens avoided)
- Strict TypeScript configuration
- No console.log in CLI package (use proper logging)
- Consistent type imports with @typescript-eslint/consistent-type-imports
