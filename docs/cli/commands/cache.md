# vercel cache

Manage cache for a Vercel project.

## Synopsis

```bash
vercel cache <subcommand> [options]
```

## Description

The `cache` command allows you to manage various caches associated with your Vercel project, including CDN cache and data cache. This is essential for:

- Clearing stale content after updates
- Invalidating cached responses by tag
- Managing cached images
- Forcing fresh data fetches

## Subcommands

### `purge`

Purge all caches or specific cache types for the current project.

```bash
vercel cache purge [options]
```

#### Options

| Option   | Type    | Description                                     |
| -------- | ------- | ----------------------------------------------- |
| `--yes`  | Boolean | Skip the confirmation prompt                    |
| `--type` | String  | Type of cache to purge (`cdn`, `data`, or both) |

#### Cache Types

| Type   | Description                                               |
| ------ | --------------------------------------------------------- |
| `cdn`  | Edge Network cache (static assets, cached responses)      |
| `data` | Data cache (fetch cache, ISR cache, cached API responses) |

#### Examples

**Purge all caches for the current project:**

```bash
vercel cache purge
```

**Purge all caches without confirmation:**

```bash
vercel cache purge --yes
```

**Purge only CDN cache:**

```bash
vercel cache purge --type cdn
```

**Purge only data cache:**

```bash
vercel cache purge --type data
```

---

### `invalidate`

Invalidate cached content by tag or source image. Invalidation marks cached entries as stale, causing them to be revalidated on the next request.

```bash
vercel cache invalidate [options]
```

#### Options

| Option     | Type    | Description                          |
| ---------- | ------- | ------------------------------------ |
| `--yes`    | Boolean | Skip the confirmation prompt         |
| `--tag`    | String  | Tags to invalidate (comma-separated) |
| `--srcimg` | String  | Source image path to invalidate      |

#### How Tag-Based Invalidation Works

When you use Next.js or other frameworks with cache tagging, you can associate cached responses with tags. Invalidating a tag marks all cached responses with that tag as stale.

```javascript
// Next.js example - tagging cached data
fetch('https://api.example.com/products', {
  next: { tags: ['products'] },
});

// Later, invalidate via CLI
// vercel cache invalidate --tag products
```

#### Examples

**Invalidate all cached content with a specific tag:**

```bash
vercel cache invalidate --tag products
```

**Invalidate multiple tags:**

```bash
vercel cache invalidate --tag products,users,inventory
```

**Invalidate cached images by source:**

```bash
vercel cache invalidate --srcimg /api/avatar/1
```

**Invalidate without confirmation:**

```bash
vercel cache invalidate --tag blog-posts --yes
```

---

### `dangerously-delete`

Permanently delete cached content by tag or source image. Unlike `invalidate`, this immediately removes the cached entries rather than marking them as stale.

> ⚠️ **Warning**: This operation permanently deletes cached content. Use with caution.

```bash
vercel cache dangerously-delete [options]
```

#### Options

| Option                            | Type    | Description                                    |
| --------------------------------- | ------- | ---------------------------------------------- |
| `--yes`                           | Boolean | Skip the confirmation prompt                   |
| `--tag`                           | String  | Tags to delete (comma-separated)               |
| `--srcimg`                        | String  | Source image path to delete                    |
| `--revalidation-deadline-seconds` | Number  | Only delete if not accessed within this period |

#### Revalidation Deadline

The `--revalidation-deadline-seconds` option provides a safety mechanism: cached content is only deleted if it hasn't been accessed within the specified number of seconds. This helps prevent deleting actively-used cache entries.

#### Examples

**Delete all cached content with a specific tag:**

```bash
vercel cache dangerously-delete --tag old-products
```

**Delete multiple tags:**

```bash
vercel cache dangerously-delete --tag legacy-api,deprecated-images
```

**Delete only if not accessed in the last hour (3600 seconds):**

```bash
vercel cache dangerously-delete --tag stale-content --revalidation-deadline-seconds 3600
```

**Delete cached images by source:**

```bash
vercel cache dangerously-delete --srcimg /api/avatar/1
```

**Delete with deadline for safety:**

```bash
vercel cache dangerously-delete --srcimg /images/user/123 --revalidation-deadline-seconds 3600
```

---

## Use Cases

### After Content Updates

When you update content in your CMS or database, invalidate related cache tags:

```bash
# After updating blog posts
vercel cache invalidate --tag blog

# After updating product information
vercel cache invalidate --tag products,pricing
```

### After Image Updates

When you replace images that are served through Vercel's image optimization:

```bash
# Invalidate a specific image
vercel cache invalidate --srcimg /images/hero.jpg

# Or delete it entirely
vercel cache dangerously-delete --srcimg /images/hero.jpg
```

### Emergency Cache Clear

If you've deployed content that needs to be immediately removed:

```bash
# Nuclear option - clear all caches
vercel cache purge --yes

# Or target specific problematic content
vercel cache dangerously-delete --tag breaking-content --yes
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Deploy and Invalidate Cache
  run: |
    vercel deploy --prod --yes
    vercel cache invalidate --tag ${{ github.event.inputs.cache_tag }} --yes
```

### Scheduled Cache Refresh

```bash
#!/bin/bash
# cron job script for periodic cache refresh

# Invalidate time-sensitive content
vercel cache invalidate --tag pricing,promotions --yes

# Clean up stale data older than 24 hours
vercel cache dangerously-delete --tag temp-data --revalidation-deadline-seconds 86400 --yes
```

---

## Comparison: Invalidate vs Dangerously-Delete

| Aspect          | `invalidate`                       | `dangerously-delete`                    |
| --------------- | ---------------------------------- | --------------------------------------- |
| Effect          | Marks as stale                     | Permanently removes                     |
| Next request    | Revalidates and serves new content | Cache miss, fetches fresh               |
| Recovery        | Previous content may still exist   | Content is gone                         |
| Use case        | Normal content updates             | Emergency removal, storage cleanup      |
| Safety          | Safer, content revalidates         | More aggressive, immediate removal      |
| Deadline option | No                                 | Yes (`--revalidation-deadline-seconds`) |

---

## Best Practices

1. **Use tags strategically**: Design your cache tags to allow granular invalidation without over-invalidating.

2. **Prefer `invalidate` over `dangerously-delete`**: Invalidation is safer and allows for graceful revalidation.

3. **Use `--revalidation-deadline-seconds`**: When using `dangerously-delete`, add a deadline to prevent deleting actively-used content.

4. **Automate cache invalidation**: Integrate cache invalidation into your CI/CD pipeline for content deployments.

5. **Monitor after invalidation**: After large-scale invalidation, monitor your origin servers for increased load.

---

## See Also

- [deploy](deploy.md) - Deploy your project
- [redeploy](redeploy.md) - Rebuild and deploy
