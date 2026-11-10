---
'vercel': patch
---

Make `vercel integration add --meta` errors easier to fix. An unknown key or an invalid option value now lists the valid keys or values and suggests the closest match. Unknown keys print a warning and are ignored, instead of failing the command, when every required field is still satisfied. When `--meta` fails to parse, telemetry records whether the key was unknown, the value was invalid, or the flag was not `KEY=VALUE`, and names the key only when the product's schema defines it. Values are never sent.
