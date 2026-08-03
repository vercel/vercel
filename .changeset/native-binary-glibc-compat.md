---
'vercel': patch
---

Build the linux native CLI Node runtime on manylinux_2_28 so the published binary stays at glibc ≤ 2.28 (runs on Amazon Linux 2023 / Vercel Sandboxes). Also fall back to the JS CLI when the native binary fails to load (e.g. GLIBC version mismatch).
