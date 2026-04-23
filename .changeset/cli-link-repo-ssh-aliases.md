---
"vercel": patch
---

Resolve SSH config `Host` aliases when parsing git remote URLs in `vercel link --repo`. Remotes that use a custom `Host` mapping (e.g. `git@github-golden:org/repo.git` for users with multi-identity SSH configs) are now expanded via `ssh -G` before the provider classifier runs, instead of failing with `Failed to parse Git URL`.
