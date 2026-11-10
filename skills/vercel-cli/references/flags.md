# Feature Flags

Inspect the existing flag and the target environment before changing what it serves. Match the CLI key to the application's flag definition; creating a second flag is not a substitute for adopting an existing one.

CLI flag operations use Vercel account authentication. SDK keys are application credentials, not a recovery path for failed CLI authentication. Managing remote flags alone does not require installing an SDK or changing application code.

Use the `vercel-flags` skill for planning, management, and lifecycle guidance (`npx skills add vercel/flags@vercel-flags`). Use the `flags-sdk` skill for Flags SDK code in Next.js or SvelteKit (`npx skills add vercel/flags@flags-sdk`).

Use `vercel flags --help` and `vercel flags <command> --help` for commands, options, and examples. Preserve the flag's variant types and environment intent when switching between a fixed value and targeting.

Archived flags can be edited without unarchiving them. These edits update the saved configuration and do not affect evaluation until the flag is explicitly unarchived.
