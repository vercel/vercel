---
'vercel': patch
---

Fixed `vc upgrade` reporting a successful version bump that didn't actually take effect. The upgrade command now re-reads the installed version from disk after the install completes and reports the version that was actually installed, rather than the version it resolved before the install. When the installer exits successfully but the on-disk version is unchanged (e.g. a second global install shadows the updated one), it now warns honestly instead of claiming success.
