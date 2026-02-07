# Repro: Next.js + Python `uv ENOENT` Bug

Minimal reproduction for the `spawn /usr/local/bin/uv ENOENT` error
that occurs when deploying a Next.js project with a Python API route
on Vercel CLI versions between ~50.5.0 and 50.13.0.

## Project structure

```
.
├── app/
│   ├── layout.tsx          # Next.js App Router layout
│   └── page.tsx            # Next.js home page
├── api/
│   └── hello.py            # Python API route (triggers @vercel/python)
├── requirements.txt        # Python deps (triggers requirements.txt install path)
├── package.json            # Next.js deps
└── README.md
```

## Key ingredients for the repro

1. **Next.js frontend** -- so the Next.js builder runs first.
2. **Python API route in `api/`** -- triggers the `@vercel/python` builder.
3. **`requirements.txt` at root** -- but **no** `pyproject.toml`, `Pipfile.lock`,
   or `.python-version` -- so the runtime prints
   "No Python version specified ..." and takes the requirements.txt code path.
4. **No `pyproject.toml`** -- forces the runtime to generate one and run `uv lock`.

## How to reproduce the bug

```bash
# Deploy with the current (broken) CLI
npx vercel deploy
```

You should see:

```
Traced Next.js server files in: ...
Created all serverless functions in: ...
Collected static files (public/, static/, .next/static): ...
No Python version specified in .python-version, pyproject.toml, or Pipfile.lock. Using python version: 3.12
Creating virtual environment at ".../.vercel/python/.venv"...
Using uv at "/usr/local/bin/uv"
Installing required dependencies from requirements.txt with uv...
Error: Failed to run "uv pip install vercel-runtime==0.3.0": spawn /usr/local/bin/uv ENOENT
```

## How to test the fix

Build and use the patched CLI from this branch, then redeploy.
The fix changes `projectDir: entryDirectory` (relative) to
`projectDir: workPath` (absolute) in the `uv.pip()` call.
