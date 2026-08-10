---
'vercel': patch
---

Show the API key name instead of the raw id for api-key-scoped rows in `vercel ai-gateway budgets list`, using the name the API returns and falling back to the API key roster, then the id.
