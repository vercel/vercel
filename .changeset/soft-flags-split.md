---
'vercel': patch
---

Add `vercel flags split` to configure weighted Vercel Flags splits from the CLI.

Configure a split interactively by letting the CLI prompt for the environment, bucketing attribute, weights, fallback variant, and revision message.
`vercel flags split welcome-message`

Configure a boolean flag split in production with 95/5 traffic.
`vercel flags split redesigned-checkout --environment production --by user.userId --weight off=95 --weight on=5`

Configure a string flag split with an explicit fallback variant.
`vercel flags split welcome-message -e production --by user.userId --default-variant control --weight control=90 --weight treatment=10`

Exclude a variant from receiving traffic by setting its weight to 0.
`vercel flags split checkout-copy -e preview --by user.userId --default-variant control --weight control=50 --weight treatment=50 --weight legacy=0`
