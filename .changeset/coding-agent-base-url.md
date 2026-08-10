---
'vercel': patch
---

`vercel ai-gateway coding-agents setup` now points Cursor, Hermes, Kilo Code,
and OpenClaw at the gateway's generic coding-agent surface,
`https://ai-gateway.vercel.sh/coding-agent/v1`, instead of the generic
`/v1` base URL. Claude Code and Codex keep their dedicated compatibility
endpoints, and Cline, OpenCode, and Pi are unaffected because they use their
native gateway providers rather than a base URL. This also fixes Cursor, whose
previous base URL `https://ai-gateway.vercel.sh/v1/cursor` is not a route the
gateway serves and returned a 404.
