# vercel install

Install an integration from the marketplace.

## Synopsis

```bash
vercel install <integration>
vercel i <integration>
```

## Description

The `install` command is an alias for `vercel integration add`. It installs a marketplace integration.

## Aliases

- `i`

## Arguments

| Argument      | Required | Description                 |
| ------------- | -------- | --------------------------- |
| `integration` | Yes      | Integration name to install |

## Examples

```bash
vercel install neon
vercel install upstash
vercel i planetscale
```

---

## See Also

- [integration](integration.md) - Full integration management
- [integration-resource](integration-resource.md) - Manage resources
