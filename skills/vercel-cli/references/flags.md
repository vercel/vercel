# Feature Flags

`vercel flags` manages [Vercel Flags](https://vercel.com/docs/flags/vercel-flags) — create, inspect, update, set, enable, disable, archive, and delete feature flags, plus manage SDK keys.

## Creating Flags

`create` is the primary command; `add` is an alias.

```bash
vercel flags create my-feature                            # create boolean flag
vercel flags create my-feature --kind string --description "My flag"  # string flag with description
vercel flags create my-feature --kind string --variant control="Welcome back" --variant treatment="New onboarding"  # with explicit variants
```

Flag kinds: `boolean` (default), `string`, `number`. Boolean flags get `true`/`false` variants automatically; use `--variant VALUE[=LABEL]` (repeatable) for string/number flags.

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

## SDK Keys

SDK keys authenticate your application when evaluating flags. The full key value is only shown at creation time.

```bash
vercel flags sdk-keys ls                                  # list SDK keys
vercel flags sdk-keys ls --json                           # list as JSON
vercel flags sdk-keys add --type server -e production     # create server key
vercel flags sdk-keys add --type client -e preview --label "Preview App"  # client key with label
vercel flags sdk-keys rm <hash-key> --yes                 # delete key
```
