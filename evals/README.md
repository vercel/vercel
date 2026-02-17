# Agent Evaluation Suite

Test AI coding agents to measure what actually works.

## Setup

1. **Install dependencies** (from monorepo root):

   ```bash
   pnpm install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your API keys (see comments in `.env.example` for options):

   - **Choose ONE agent key**: `AI_GATEWAY_API_KEY` (for Vercel agents), `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`
   - **Choose ONE sandbox option**: `VERCEL_TOKEN`, `VERCEL_OIDC_TOKEN`, or use Docker (set `sandbox: 'docker'` in config)

   **Important:** Your `VERCEL_TOKEN` must be a Personal Access Token with access to a team/account where the evals can create and delete temporary test projects. Some evals (e.g. marketplace integrations) will provision resources against these projects during the run and clean them up afterwards.

## Running Evals

### Preview (no cost)

See what will run without making API calls:

```bash
npx @vercel/agent-eval vercel-cli-cc --dry
```

### Run Experiments

Run the Vercel CLI marketplace eval:

```bash
npx @vercel/agent-eval vercel-cli-cc
```

### View Results

Launch the web-based results viewer:

```bash
npx @vercel/agent-eval playground --port 3000
```

Open [http://localhost:3000](http://localhost:3000) to browse results.
