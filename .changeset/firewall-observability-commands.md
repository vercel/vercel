---
'vercel': minor
---

Add firewall observability commands. Inspect nested resources (`firewall alerts inspect`, `firewall persistent-actions inspect`, `firewall traffic inspect`). `firewall overview` shows configuration status plus 1-day traffic by action and rule, with next-step commands after each inspect view. `firewall status` shows configuration (optional `--graph`). Managed bot rules (Bot Protection, AI Bots, BotID) list under `firewall bot-management` and `firewall rules list`, and edit through `firewall rules edit` with reserved slugs.
