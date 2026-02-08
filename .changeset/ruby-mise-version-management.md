---
'@vercel/ruby': minor
---

Added support for multiple Ruby versions via mise. When a Ruby version is declared (via `.ruby-version`, `.tool-versions`, or `Gemfile`) that is not pre-installed in the build container, mise is automatically downloaded and used to install the requested version. Added Ruby 3.4 support.
