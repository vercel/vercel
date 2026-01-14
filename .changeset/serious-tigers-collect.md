---
'@vercel/introspection': patch
'@vercel/backends': patch
---

- Parrallelize NFT and introspection steps
- Increase timeout to 8 seconds. It's taking up to 5 seconds for a large app we have been testing with
- Add more debug logs to introspection process
