---
"@vercel/build-utils": patch
---

Fix prototype-pollution vulnerability in `cloneEnv`. Untrusted env objects (e.g. produced by `JSON.parse`) containing a `__proto__` own property could replace the returned object's prototype with attacker-controlled data via the prototype accessor on the merge target. `cloneEnv` now skips the `__proto__`, `constructor`, and `prototype` keys when copying. Fixes #15725.
