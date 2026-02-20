import type { User } from "../middleware/auth";

interface WelcomeProps {
  user: User;
}

function VercelLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-label="Vercel Logo"
      xmlns="http://www.w3.org/2000/svg"
      width="72"
      height="64"
      viewBox="0 0 76 65"
      className={className}
    >
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor" />
    </svg>
  );
}

export function Welcome({ user }: WelcomeProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-black px-4">
      <div className="flex flex-col items-center gap-10 w-full max-w-lg">
        {/* ── Vercel branding ────────────────────────────────── */}
        <header className="flex flex-col items-center gap-4">
          <VercelLogo className="text-black dark:text-white" />
          <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">
            React Router Middleware
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
            A demo showing how{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm dark:bg-gray-800">
              future.v8_middleware
            </code>{" "}
            injects context into your React&nbsp;Router loaders.
          </p>
        </header>

        {/* ── User card injected via middleware ─────────────────── */}
        <div className="w-full">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 flex items-center gap-4 shadow-sm">
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-12 h-12 rounded-full ring-2 ring-gray-100 dark:ring-gray-800"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-black dark:text-white truncate">
                {user.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user.email}
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-black text-white dark:bg-white dark:text-black">
              {user.role}
            </span>
          </div>
          <p className="mt-2.5 text-center text-xs text-gray-400 dark:text-gray-500">
            ↑ User injected by middleware before the loader runs
          </p>
        </div>

        {/* ── How it works ──────────────────────────────────── */}
        <div className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-black dark:text-white">
            How it works
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>
              <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-xs dark:bg-gray-800">
                authMiddleware
              </code>{" "}
              runs on every matched request
            </li>
            <li>
              It places a mock user onto the type-safe{" "}
              <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-xs dark:bg-gray-800">
                context
              </code>
            </li>
            <li>
              The route loader reads{" "}
              <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-xs dark:bg-gray-800">
                context.get(userContext)
              </code>
            </li>
          </ol>
        </div>

        {/* ── Links ─────────────────────────────────────────── */}
        <div className="flex items-center gap-6 text-sm">
          <a
            href="https://reactrouter.com/how-to/middleware"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-gray-600 underline-offset-4 hover:text-black hover:underline dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Docs
          </a>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <a
            href="https://github.com/vercel-labs/react-router-middleware"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-gray-600 underline-offset-4 hover:text-black hover:underline dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            GitHub
          </a>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <a
            href="https://vercel.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-gray-600 underline-offset-4 hover:text-black hover:underline dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Vercel
          </a>
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <footer className="pb-8 text-xs text-gray-400 dark:text-gray-600">
          Deployed on{" "}
          <a
            href="https://vercel.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-black dark:text-white hover:underline underline-offset-4"
          >
            ▲ Vercel
          </a>
        </footer>
      </div>
    </main>
  );
}
