# Feature Flags

> Exact syntax: `vercel flags --help`

## Variants

Flag kinds: `boolean` (default), `string`, `number`, `json`. Boolean flags get `true`/`false` variants automatically (with labels `On`/`Off`); use `--variant VALUE[=LABEL]` (repeatable) for other kinds. JSON variant values must be valid JSON literals.

**Variants resolve by ID or value, never label.** In `enable`, `disable`, `set`, and `split --weight VARIANT=WEIGHT`, pass a boolean flag's variants as `true`/`false` — `on`/`off` or the labels `On`/`Off` are rejected unless they happen to be a variant's literal value or ID.

## Archive / Delete

A flag must be archived before it can be deleted:

```bash
vercel flags archive my-feature --yes
vercel flags rm my-feature --yes
```

## SDK Keys

The full key value is only shown at creation time — capture it from that output; it cannot be retrieved later.
