# Development manifest

Builders may export `getDevManifest`, typed as `GetDevManifest`, independently
of `build()` and `startDevServer()`. It describes deployment function identities,
their local invocation targets, and optional native schedule definitions.
Queues and Schedules share the function registry instead of separate discovery APIs.

## Inputs

- `workPath`: absolute project or service root.
- `build`: the original builder entry before source expansion or filtering for a
  framework development command; its source is relative to `workPath`.
- `files`: real source paths relative to `workPath`, using forward slashes,
  respecting ignore rules and excluding synthetic aliases.
- `config`: resolved, builder-scoped authored configuration, including functions.
  Do not independently reload vercel.json; the host may resolve vercel.ts or
  partition function patterns between builders. Explicitly empty maps stay empty.
- `env`: effective development environment, including injected resources.
  Do not mutate inputs or log credentials.

For services, paths are service-root-relative and `config.serviceName` supplies
production consumer scoping where applicable.

## Functions and invocation

Every `DevFunction` has a deployment `outputPath` with no leading slash or
`.func` suffix. It is the identity referenced by a Schedule's `function`,
not necessarily the source filename or the public URL. `sourceFile` optionally
identifies the original source for source-backed functions.

`invocation` is one of:

- `http`: a root-relative pathname in the owning framework dev server, including
  its base path. No origin, query string, or fragment. The host supplies the origin.
- `entrypoint`: a discrete builder entrypoint relative to `workPath`. The host
  selects that function directly, without re-entering public routing, redirects,
  rewrites, or an unrelated catch-all. This is also the host's conventional
  per-entrypoint fallback target.

Functions without Queue subscriptions remain discoverable. The host derives
Queue subscriptions from normalized `experimentalTriggers`; direct Schedules
resolve the same registry by output identity and use Schedule CloudEvents.
`matchedFunctionPatterns` lists authored function keys resolved by the provider
so the host can aggregate unmatched diagnostics across owners.

Use existing deployment normalization for output paths and
`getLambdaOptionsFromFunction` for source-backed trigger metadata. Queue consumer
identity comes from the matched configuration pattern, not the output path.

## Generic fallback

Conventional per-entrypoint builders need no custom hook. The host can use its
known source/output mapping, with the same zero-config versus explicit-build
identity rules as deployment. A v3 result has one function artifact, but that
does not guarantee a source-equals-public-URL mapping. Middleware, framework
sentinels, and unknown multi-output modes must not be guessed. Variable-version
builders need a known per-entrypoint convention or resolved output metadata.

The optional hook is available to v2, v3, and variable-version builders. When
present it is authoritative, including an empty manifest; no fallback runs.
Absence means the host may use its supported conventional mapping.

## Native schedules

`schedules` optionally contains framework-native definitions in the static BOA
`Schedule` shape. These refer to function output identities or Queue topics.
They are metadata, not a request for a provider-owned timer. Nitro Tasks can use
a direct Schedule function target without becoming Queue callbacks. Hosting and
executing these definitions requires the separate Schedules integration.

## Snapshot lifecycle

- Retain provider scopes before filtering framework builders for native dev commands.
- Discovery does not require the runtime to be listening. Invocation waits for
  the owning runtime's readiness and follows its current process after restart.
- Providers must not start another application server, scheduler, poller, or broker.
- Cache until source/config/environment inputs change; providers must not retain
  stale process-global discovery caches.
- Validate the complete candidate set and discard superseded async results.
  Errors retain the last valid snapshot.
- Empty snapshots remove only that owner's registrations. Updates/removals must
  preserve existing acknowledgments and active leases in delivery state.
- Live runtime-generated updates need an authoritative refresh signal; source
  watching alone does not promise discovery of virtual or ignored manifests.
