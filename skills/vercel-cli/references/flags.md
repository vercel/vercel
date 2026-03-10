# Feature Flags

`vercel flags` manages [Vercel Flags](https://vercel.com/docs/flags/vercel-flags) — create, inspect, enable, disable, archive, and delete feature flags, plus manage SDK keys.

## Managing Flags

```bash
vercel flags list                                        # list active flags
vercel flags list --state archived                       # list archived flags
vercel flags inspect my-feature                        # show flag details
vercel flags add my-feature                            # create boolean flag
vercel flags add my-feature --kind string --description "My flag"  # string flag with description
vercel flags archive my-feature --yes                  # archive (skip prompt)
vercel flags rm my-feature --yes                       # delete (must be archived first)
```

Flag kinds: `boolean` (default), `string`, `number`. Each kind gets default variants automatically.

## Enable / Disable

Only works with **boolean** flags. Controls whether a flag evaluates rules in an environment.

```bash
vercel flags enable my-feature -e production           # start evaluating rules
vercel flags disable my-feature -e production          # stop evaluating rules
vercel flags disable my-feature -e production --variant off  # serve specific variant while disabled
```

Environments: `production`, `preview`, `development`. Omit `-e` to choose interactively.

## SDK Keys

SDK keys authenticate your application when evaluating flags. The full key value is only shown at creation time.

```bash
vercel flags sdk-keys ls                               # list SDK keys
vercel flags sdk-keys add -e production                # create key
vercel flags sdk-keys add -e preview --label "Preview App"  # with label
vercel flags sdk-keys rm <hash-key> --yes              # delete key
```
