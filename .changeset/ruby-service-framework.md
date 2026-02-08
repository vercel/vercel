---
'@vercel/ruby': patch
---

Add services framework support for Ruby runtime. When the framework is set to `ruby` or `services`, the Ruby builder now detects the entrypoint within the service workspace and routes dev server output through the services orchestrator logger callbacks.
