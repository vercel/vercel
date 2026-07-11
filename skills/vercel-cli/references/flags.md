# Feature Flags

`vercel flags` manages [Vercel Flags](https://vercel.com/docs/flags/vercel-flags) — create, inspect, update, set, enable, disable, archive, and delete feature flags, plus manage SDK keys.

## Creating Flags

`create` is the primary command; `add` is an alias.

```bash
vercel flags create my-feature                            # create boolean flag
vercel flags create my-feature --kind string --description "My flag"  # string flag with description
vercel flags create my-feature --kind string --variant control="Welcome back" --variant treatment="New onboarding"  # with explicit variants
```

Flag kinds: `boolean` (default), `string`, `number`, `json`. Boolean flags get `true`/`false` variants automatically; use `--variant VALUE[=LABEL]` (repeatable) for string/number/json flags. JSON variant values must be valid JSON literals (objects, arrays, strings, etc.).

```bash
vercel flags create layout-config --kind json --variant '{"theme":"light"}'=Light --variant '{"theme":"dark","sidebar":true}'=Dark
```

## Listing and Inspecting

```bash
vercel flags list                                         # list active flags
vercel flags list --state archived                        # list archived flags
vercel flags list --json                                  # output as JSON
vercel flags inspect my-feature                           # show flag details
```

Filter the list with `--tag` (repeatable, all must match), `--created-by` (user or team id), and `--maintainer-id` (repeatable, any may match):

```bash
vercel flags list --tag checkout --tag beta               # flags tagged checkout AND beta
vercel flags list --created-by user_123                    # flags created by a user/team
vercel flags list --maintainer-id user_456                 # flags maintained by a user
```

By default the list returns every flag. Use `--limit` (page size, 1-100) for a single page; the command prints a `--next <cursor>` command to fetch the following page. `--json` output includes `pagination.next`.

```bash
vercel flags list --limit 25                               # first page of 25
vercel flags list --limit 25 --next <cursor>              # next page
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
vercel flags disable my-feature -e production --variant false
vercel flags disable my-feature -e production --message "Pause rollout"
```

Boolean variants resolve by ID or **value** (`true` / `false`), not label. Passing `--variant off` for a boolean flag is rejected unless `off` is the variant's literal value or ID. Environments: `production`, `preview`, `development`. Omit `-e` to choose interactively.

## Archive / Delete

```bash
vercel flags archive my-feature --yes                     # archive (skip prompt)
vercel flags rm my-feature --yes                          # delete (must be archived first)
```

## Split (Weighted Traffic)

Distribute traffic across variants with weights. Repeat `--weight VARIANT=WEIGHT` per variant; weights are normalized, and `0` excludes a variant from the split.

```bash
vercel flags split redesigned-checkout -e production --by user.userId --weight false=95 --weight true=5
vercel flags split welcome-message -e production --by user.userId --default-variant control --weight control=90 --weight treatment=10
vercel flags split checkout-copy -e preview --by user.userId --default-variant control --weight control=50 --weight treatment=50 --weight legacy=0
```

Each `VARIANT` in `--weight` must resolve to a variant by ID or value, not label. Default boolean flags have values `true` and `false` (labels `On`/`Off` don't resolve), so pass `false`/`true` rather than `off`/`on` unless a flag was created with explicit `off`/`on` variants.

Options: `--environment`/`-e`, `--by ENTITY.ATTRIBUTE`, `--weight VARIANT=WEIGHT` (repeatable), `--default-variant`, `--message`.

## Rollout (Progressive)

Move traffic from one variant to another over a series of stages. `--stage PERCENTAGE,DURATION` is repeatable; `100%` is implied at the end.

```bash
vercel flags rollout redesigned-checkout -e production --by user.userId --stage 5,6h --stage 10,6h --stage 25,12h --stage 50,1d
vercel flags rollout welcome-message -e production --by user.userId --from-variant control --to-variant treatment --default-variant control --stage 10,2h --stage 50,12h --start 2026-04-16T09:00:00Z
vercel flags rollout redesigned-checkout -e production --stage 5,30m --stage 25,2h --stage 50,8h    # update schedule only
```

Options: `--environment`/`-e`, `--by`, `--from-variant`, `--to-variant`, `--default-variant`, `--stage`/`-s` (repeatable), `--start` (`now`, a relative duration like `1h`, or an ISO 8601 datetime), `--message`. For boolean flags, `--from-variant` defaults to `false` and `--to-variant` to `true`.

## Prepare (Build Integration)

Prepare flag definition fallbacks for the build. Used in build pipelines so the deployed app has fallback values for every flag.

```bash
vercel flags prepare
```

## Override (Cookie Token)

Encrypts flag overrides into a secure token suitable for the `vercel-flag-overrides` cookie, or decrypts an existing token. Useful for testing variants without changing served defaults.

```bash
vercel flags override my-flag=true
vercel flags override flag-a=true flag-b=hello
vercel flags override my-flag=42 --expiration 30d
vercel flags override --decrypt <token>
```

Options: `--expiration TIME` (default `1y`), `--decrypt TOKEN`.

## SDK Keys

SDK keys authenticate your application when evaluating flags. The full key value is only shown at creation time.

```bash
vercel flags sdk-keys ls                                  # list SDK keys
vercel flags sdk-keys ls --json                           # list as JSON
vercel flags sdk-keys add --type server -e production     # create server key
vercel flags sdk-keys add --type client -e preview --label "Preview App"  # client key with label
vercel flags sdk-keys rm <hash-key> --yes                 # delete key
```
