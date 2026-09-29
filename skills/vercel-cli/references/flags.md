# Feature Flags

Inspect the existing flag and the target environment before changing what it serves. Match the CLI key to the application's flag definition; creating a second flag is not a substitute for adopting an existing one.

CLI flag operations use Vercel account authentication. SDK keys are application credentials, not a recovery path for failed CLI authentication. Managing remote flags alone does not require installing an SDK or changing application code.

Use the `flags-sdk` skill when available for application integration, targeting identity, build fallbacks, and lifecycle guidance. Preserve the flag's variant types and environment intent when switching between a fixed value and targeting.
