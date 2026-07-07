---
'vercel': patch
---

Stopped showing the "Update available … Would you like to upgrade now?" prompt immediately after running `vercel upgrade`. The running process still holds the pre-upgrade version in memory, so the notifier would ask the user to upgrade again right after a successful upgrade.
