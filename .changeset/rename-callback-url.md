---
"@vercel/connect": minor
---

Rename the public authorization browser redirect option from `returnUrl` to `callbackUrl`. The SDK still sends the existing `returnUrl` wire field to the Vercel Connect API.
