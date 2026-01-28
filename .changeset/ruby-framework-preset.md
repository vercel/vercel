---
'@vercel/frameworks': minor
'@vercel/fs-detectors': patch
'@vercel/ruby': patch
---

[ruby] Add experimental Ruby runtime framework preset

Also fixed a bug in the Ruby version parsing where `ruby "~> 3.3.x"` in Gemfile would fail due to a trailing space not being trimmed after removing the `~>` prefix.
