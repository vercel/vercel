# Firewall

## Investigation

Start from the user's question rather than loading every traffic panel. Configuration, request-processing order, aggregate traffic, and an individual blocked request are different evidence sources.

- **Configuration and bypasses:** status output describes request topology and configured protections. `requestFlow` is not a request trace. `skippableBy` describes capability; `skippedBy` describes configured bypasses. Use the structured `bypasses` data rather than counting legacy `bypass[]` rows. An unavailable or unknown protection is not necessarily disabled or absent.
- **Activity:** an overview combines configuration with recent traffic, but omits detailed request topology. `activityUnavailable` or null activity with a plan/permission limitation does not mean the site is quiet.
- **Blocked traffic:** top lists show volume by default, not attackers. For a question about denied or challenged traffic, filter to that action before attributing its sources; other investigations may need all actions. Detailed breakdowns can be sampled; use aggregate results for totals.
- **Traffic filters:** use the dimension filter flags. Do not construct raw `--filter` KQL expressions; if the flags cannot express the question, stop and ask.
- **Alerts and persistent actions:** use identifiers and episode windows from returned results. An action's chart covers when it happened, which can be outside the current query window. An alert header can be available even when its supporting traffic is plan-gated.

Keep queries within the requested time window. Buckets may extend beyond exact timestamps; do not present rounded aggregates as precise event boundaries. Each requested dimension can add a query, so select only the breakdowns needed.

Retention and query entitlement are separate. A query accepted by the API may contain only the data still retained. Use current [Security Plus documentation](https://vercel.com/docs/vercel-firewall/security-plus) for retention; report plan/permission limits rather than treating them as empty results or repeatedly widening a refused query. Unknown-bot categories use request-count data and can have different entitlement requirements from firewall-action metrics.

## Changes and Publication

Choose the smallest control matching the evidence: an IP block for a known abusive address, a custom rule for request attributes, or a narrowly scoped bypass for trusted infrastructure.

Custom rules and IP blocks are staged. Inspect the existing draft, review the diff, and publish only the authorized change. A successful edit does not mean the rule is live. Do not publish or discard unrelated staged work.

Rules run in order. Conditions within a group are ANDed; groups are ORed. Check the effective match before publishing: a loose deny condition on `/` can block the whole project. Keep broad-impact changes within the authorized scope.

System bypass changes take effect immediately and skip firewall checks; they do not have a draft/publication boundary. Attack Mode and pausing system mitigations require an interactive handoff. Agent-blocked AI rule creation is not a workaround for constructing the supported rule payload.

Managed bot rules belong to the project and have a separate lifecycle from custom rules. Modify supported managed settings rather than trying to remove or reorder the managed rules as ordinary custom rules.

## BotID, Rate Limits, and Cron

[BotID](https://vercel.com/docs/botid) requires browser participation. Protected routes can reject cron, CI, or direct HTTP clients. Exclude those paths from enrollment or use a narrow trusted bypass; an unauthenticated query parameter is not proof of trust. Inspect actual request order and bypass behavior before assuming a bypass reaches the intended stage.

Check [rate-limit plan constraints](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) before choosing a counting key or time window. Ten requests per 10 minutes per IP is not equivalent to 60 per hour per user. For an authenticated per-user limit, derive the application key from identity; a shared authorization header does not identify individual users.

For cron handlers, account for custom WAF rules and BotID enrollment as well as the caller's authentication; see [securing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
