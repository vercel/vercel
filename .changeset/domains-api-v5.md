---
'vercel': patch
---

Migrate domains REST API calls off `/v4/domains` to the current documented versions: `GET /v5/domains/:domain` (get domain), `GET /v5/domains/:domain/records` (list DNS records), `POST /v7/domains` (add domain), and `GET /v6/domains/:domain/config` (domain config). `vercel domains add` now sends `zone: true` explicitly, preserving the DNS-zone creation that the API only defaults on for v4 and below.
