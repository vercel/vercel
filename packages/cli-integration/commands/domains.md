# Domains Command Tests

Tests for `vercel domains ls` using a Prism mock server against the Vercel OpenAPI spec.

## Lists domains

```scrut
$ $VERCEL_CLI_MOCK domains ls --token testtoken123
Vercel CLI \d+\.\d+\.\d+ (re)
Fetching Domains under jdoe
> 1 Domain found under jdoe \[\d+ms\] (re)
\s* (re)
  Domain\s+Registrar\s+Nameservers\s+Expiration Date\s+Creator\s+Age\s* (re)
  example\.com\s+Vercel\s+Vercel\s+.+\[\d+d ago\]\s+vercel_user\s+\d+d\s* (re)
\s* (re)

> To display the next page, run `vercel domains ls --next \d+` (re)
```

## Lists domains in JSON format

```scrut
$ $VERCEL_CLI_MOCK domains ls --token testtoken123 --format json
Vercel CLI \d+\.\d+\.\d+ (re)
Fetching Domains under jdoe
{
  "domains": [
    {
      "name": "example.com",
      "registrar": "Vercel",
      "nameservers": "vercel",
      "expiresAt": 1613602938882,
      "createdAt": 1613602938882,
      "creator": "vercel_user"
    }
  ],
  "pagination": {
    "count": 20,
    "next": 1540095775951,
    "prev": 1540095775951
  }
}
```
