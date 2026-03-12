# React Router Middleware on Vercel

This repo is a focused demo of using **React Router middleware** with the Vercel runtime.

The main goal is to show how middleware can run before loaders/actions, attach request-scoped data to a type-safe context, and keep auth/session logic centralized.

## Demo goals

- Showcase `future.v8_middleware` in React Router
- Use middleware to inject auth data into route context
- Read that data in a loader without duplicating auth checks
- Demonstrate a clean setup for deploying this pattern on Vercel

## How this demo works

1. The route exports middleware in `app/routes/home.tsx`.
2. `authMiddleware` in `app/middleware/auth.ts` runs for matched requests.
3. Middleware sets a mock user on `userContext` (`app/context.ts`).
4. The route loader reads `context.get(userContext)` and returns it to the UI.

This simulates how you would verify a cookie/JWT and load a real user in production.

## Key files

- `react-router.config.ts` – enables `future.v8_middleware` and Vercel preset
- `app/middleware/auth.ts` – middleware that injects the user
- `app/context.ts` – typed context container
- `app/routes/home.tsx` – middleware + loader usage
- `app/components/welcome.tsx` – UI showing middleware-injected user data

## Run locally

Install dependencies:

```bash
pnpm install
```

Start development:

```bash
pnpm dev
```

App runs at `http://localhost:5173`.

## Build and run production locally

```bash
pnpm build
pnpm start
```

## Deploy to Vercel

This project already includes `@vercel/react-router` and uses the Vercel preset.

```bash
pnpm dlx vercel
```

Or connect the repo in the Vercel dashboard and deploy.

## Why middleware here?

Middleware keeps cross-cutting concerns (auth, logging, feature flags, tracing) out of individual loaders/actions. In this demo, auth logic is written once and reused consistently wherever the middleware is attached.
