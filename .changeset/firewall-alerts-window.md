---
'vercel': patch
---

`vercel firewall overview` now scopes its alerts request to the window it reports, instead of taking the newest 100 alert groups and silently dropping the rest — on a project with frequent bot alerts that could push mitigated attacks out of the summary entirely. It also lists an attack that began before the window and is still running, which was counted but not shown.
