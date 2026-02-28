# Quirks

Post-install fix-ups that run when specific Python packages are detected in
the venv. Each quirk patches the build so a package works correctly on Vercel.

## How it works

`runQuirks()` scans installed distributions in the venv's site-packages
(via `scanDistributions` from `@vercel/python-analysis`), then iterates
the quirk registry and calls `run()` for each quirk whose `dependency`
is present. Results are merged: `env` goes to the Lambda environment,
`buildEnv` to subsequent build steps, and `alwaysBundlePackages`
prevents the externalizer from splitting those packages out.

## Adding a quirk

1. Create `<package>.ts` -- name the file after the PyPI distribution name
   (e.g. `prisma.ts` for `prisma`).
2. Export a `Quirk` object with:
   - `dependency` -- the PyPI distribution name used for detection.
   - `runsBefore` / `runsAfter` (optional) -- arrays of dependency names
     that control execution order. `runsBefore: ['X']` ensures this quirk
     runs before X; `runsAfter: ['X']` ensures it runs after X. Activated
     quirks are topologically sorted using these edges (cycles are an error).
   - `run(ctx)` -- receives `venvPath`, `pythonEnv`, and `workPath`;
     returns `QuirkResult`.
3. Register it in the `quirks` array in `index.ts`.
4. Add an integration fixture under `test/fixtures/`.

## Guidelines

- Keep quirks self-contained. All package-specific logic lives in the
  quirk module; nothing package-specific belongs in `@vercel/python-runtime`
  or `@vercel/python`.
- Use generic runtime hooks when the quirk needs runtime behavior.
  For example, `VERCEL_RUNTIME_ENV_PATH_PREPEND` prepends directories to
  `PATH` at function startup.
- Prefer renaming/copying files at build time over runtime workarounds.
- Clean up build artifacts (dummy schemas, `node_modules`, etc.) before
  returning.
- Patch `dist-info/RECORD` for any files added inside `site-packages` so
  the packaging system picks them up properly.
