---
'@vercel/detect-agent': patch
---

Add GitHub Copilot detection support by recognizing `AI_AGENT=github-copilot|github-copilot-cli` and fallback Copilot CLI environment variables (`COPILOT_MODEL`, `COPILOT_ALLOW_ALL`, and `COPILOT_GITHUB_TOKEN`).