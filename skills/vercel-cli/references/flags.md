# Feature Flags

`vercel flags` manages [Vercel Flags](https://vercel.com/docs/flags/vercel-flags) — create, inspect, update, set, enable, disable, archive, and delete feature flags, plus manage SDK keys.

The command may be **hidden** from the root `vercel --help` list during rollout; run `vercel flags --help` for subcommands.

## Creating Flags

`create` is the primary command; `add` is an alias.

```bash
vercel flags create my-feature                            # create boolean flag
vercel flags create my-feature --kind string --description "My flag"  # string flag with description
vercel flags create my-feature --kind string --variant control="Welcome back" --variant treatment="New onboarding"  # with explicit variants
```

Flag kinds: `boolean` (default), `string`, `number`. Boolean flags get `true`/`false` variants automatically; use `--variant VALUE[=LABEL]` (repeatable) for string/number flags.

`vercel flags create` does **not** create **JSON / experiment** flags (`kind: json`); those are created with the separate **`vercel experiment`** command (also hidden from root help). Metrics are embedded on the flag experiment (`primaryMetrics` / `guardrailMetrics`), not via a separate metrics REST path. See **Experiments** below.

## Experiments (A/B tests)

Use **`vercel experiment`** (not `vercel flags create`) for experiment flags (`kind: json`). The command is hidden from root help; run `vercel experiment --help` for subcommands.

### Creating experiments

```bash
vercel experiment create new-signup-flow \
  --metric '{"name":"Signup","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}' \
  --allocation-unit visitorId \
  --hypothesis "Streamlined signup converts better"

vercel experiment create my-test \
  --metric '{"name":"CTR","metricType":"percentage","metricUnit":"visitor","directionality":"increaseIsGood"}' \
  --allocation-unit cookieId \
  --control-variant baseline --treatment-variant new-flow \
  --name "Q3 Click-through test" --seed 42 --json
```

Options: `--metric JSON` (1–3, repeatable; API Metric schema: `name`, `metricType`, `metricUnit`, `directionality`, optional `description`/`metricFormula`), `--allocation-unit` (`cookieId`, `visitorId`, or `userId`; default `visitorId`), `--hypothesis`, `--name`, `--control-variant` (default `control`), `--treatment-variant` (default `treatment`), `--seed` (0–100000, default random), `--json`.

### Starting and stopping

```bash
vercel experiment start new-signup-flow          # status → running
vercel experiment stop new-signup-flow           # status → closed
vercel experiment start new-signup-flow --json   # JSON output
```

### Listing experiments

```bash
vercel experiment list                           # list active experiment flags
vercel experiment ls --state archived --json     # archived, JSON output
```

### Analysing results

`analyse` (alias `analyze`) fetches experiment results from Web Analytics insights.

```bash
vercel experiment analyse my-flag \
  --metric-event-name signup-completed --metric-type conversion --unit-field visitorId

vercel experiment analyse my-flag --peek \
  --metric-event-name signup-completed --metric-type conversion --unit-field visitorId

vercel experiment analyse my-flag --json \
  --metric-event-name signup-completed --metric-type conversion --unit-field visitorId
```

Options: `--metric-event-name NAME` (repeatable), `--metric-type TYPE` (repeatable, e.g. `conversion`, `count`), `--unit-field FIELD` (should match allocation unit), `--peek` (include partial results while running), `--json`.

### Managing metrics

Add or list metrics on an existing experiment flag.

```bash
vercel experiment metrics add --flag my-exp \
  --name "Signup Completed" --metric-type count --metric-unit user --directionality increaseIsGood

vercel experiment metrics add --flag my-exp \
  --name "Error Rate" --metric-type percentage --metric-unit session --directionality decreaseIsGood --guardrail

vercel experiment metrics ls my-exp-flag
vercel experiment metrics ls my-exp-flag --json
```

`metrics add` options: `--flag SLUG` (required), `--name`, `--metric-type` (`percentage`/`currency`/`count`), `--metric-unit` (`user`/`session`/`visitor`), `--directionality` (`increaseIsGood`/`decreaseIsGood`), `--description`, `--metric-formula`, `--guardrail` (guardrail metric instead of primary), `--json`.

## Listing and Inspecting

```bash
vercel flags list                                         # list active flags
vercel flags list --state archived                        # list archived flags
vercel flags list --json                                  # output as JSON
vercel flags inspect my-feature                           # show flag details
```

## Opening in Dashboard

```bash
vercel flags open                                         # open project flags dashboard
vercel flags open my-feature                              # open a specific flag
```

## Updating Flags

Update variant values, labels, or both on an existing flag.

```bash
vercel flags update my-feature --variant control --value welcome-back --label "Welcome back"
vercel flags update my-feature --variant control --label "Control" --message "Rename control variant"
vercel flags update my-feature --variant false --label "Disabled"
```

Options: `--variant` (variant ID or value), `--value` (new value), `--label`/`-l` (new label), `--message` (revision message).

## Setting Served Variant

`set` controls which variant is served in a given environment. Works with all flag kinds.

```bash
vercel flags set welcome-message -e production --variant control
vercel flags set bucket-size -e preview --variant 20
vercel flags set my-feature -e development --variant true
```

Options: `--environment`/`-e`, `--variant`/`-v`, `--message`.

## Enable / Disable (Boolean Shortcut)

Only works with **boolean** flags. Shortcuts that set the served variant to `true` or `false`.

```bash
vercel flags enable my-feature -e production
vercel flags enable my-feature -e production --message "Resume production rollout"
vercel flags disable my-feature -e production
vercel flags disable my-feature -e production --variant off
vercel flags disable my-feature -e production --message "Pause rollout"
```

Environments: `production`, `preview`, `development`. Omit `-e` to choose interactively.

## Archive / Delete

```bash
vercel flags archive my-feature --yes                     # archive (skip prompt)
vercel flags rm my-feature --yes                          # delete (must be archived first)
```

## Prepare (build)

```bash
vercel flags prepare    # emit flag definition fallbacks for the build (@vercel/prepare-flags-definitions)
```

## SDK Keys

SDK keys authenticate your application when evaluating flags. The full key value is only shown at creation time.

```bash
vercel flags sdk-keys ls                                  # list SDK keys
vercel flags sdk-keys ls --json                           # list as JSON
vercel flags sdk-keys add --type server -e production     # create server key
vercel flags sdk-keys add --type client -e preview --label "Preview App"  # client key with label
vercel flags sdk-keys rm <hash-key> --yes                 # delete key
```
