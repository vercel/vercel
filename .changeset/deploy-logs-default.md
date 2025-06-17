---
"vercel": major
---

**BREAKING CHANGE:** `vc deploy` now shows build logs by default

The `vc` and `vc deploy` commands now stream build logs to the terminal by default, matching the behavior of the previous `--logs` flag. This provides better visibility into the deployment process out of the box.

**Migration guide:**
- If you want to disable logs (previous default behavior), use `--logs=false`
- The `--logs` flag still works to explicitly enable logs, but this is now the default
- No changes needed if you were already using `--logs` - the behavior remains the same

**Before:**
```bash
vc deploy              # No logs shown
vc deploy --logs       # Logs shown
```

**After:**
```bash
vc deploy              # Logs shown (new default)
vc deploy --logs=false # No logs shown
```

This change improves the developer experience by providing immediate feedback during deployments without requiring an additional flag.


