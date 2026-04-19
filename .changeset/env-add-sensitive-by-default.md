---
'vercel': patch
---

`vercel env add` now defaults the interactive sensitivity prompt to sensitive. When you are prompted during `vercel env add`, the question is `Make it sensitive? (Y/n)` with a default of yes, and a one-line reminder is printed beforehand that sensitive values cannot be retrieved later.

All flag behavior is unchanged: the default type when `--sensitive` is not passed is still `encrypted`, and passing `--sensitive` continues to explicitly create a sensitive variable without prompting.
