# Teams Command Tests

Tests for `vercel teams ls` using a Prism mock server against the Vercel OpenAPI spec.

## Lists teams

```scrut
$ $VERCEL_CLI_MOCK teams ls --token testtoken123
Vercel CLI \d+\.\d+\.\d+ (re)
Fetching teams
Fetching user information

  id\s+Team name\s* (re)
.+ jdoe\s+me@example\.com\s* (re)
  my-team\s+My Team\s* (re)

> To display the next page run `vercel teams ls --next \d+` (re)
```

## Lists teams in JSON format

```scrut
$ $VERCEL_CLI_MOCK teams ls --token testtoken123 --format json
Vercel CLI \d+\.\d+\.\d+ (re)
Fetching teams
Fetching user information
{
  "teams": [
    {
      "id": "AEIIDYVk59zbFF2Sxfyxxmua",
      "slug": "jdoe",
      "name": "me@example.com",
      "current": true
    },
    {
      "id": "team_nllPyCtREAqxxdyFKbbMDlxd",
      "slug": "my-team",
      "name": "My Team",
      "current": false
    }
  ],
  "pagination": {
    "count": 20,
    "next": 1540095775951,
    "prev": 1540095775951
  }
}
```
