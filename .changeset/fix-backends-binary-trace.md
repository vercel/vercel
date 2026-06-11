---
'@vercel/backends': patch
---

Fix corruption of native addon (`.node`) and other binary files during file tracing. Traced files were read as UTF-8 strings, which mangled non-text bytes and caused runtime errors such as `ELF file's phentsize not the expected size` (e.g. with `argon2` on pnpm). Binary files are now preserved byte-for-byte.
