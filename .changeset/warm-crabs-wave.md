---
---

Fix build-node-runtime workflow artifact upload: `actions/upload-artifact@v4`
excludes hidden paths by default, so files under `.node-runtime` matched
nothing. Set `include-hidden-files: true`.
