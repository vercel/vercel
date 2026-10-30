# Next.js Queue broker smoke test

This fixture verifies automatic integration between local builds of the Vercel
CLI and `@vercel/queue`. It requires the SDK's local-resource support, which is
not in the fixture's published dependencies yet.

Build the Queue SDK in its own repository. From the CLI repository root, build the
CLI and its workspace dependencies so the smoke uses the current host and core:

```sh
pnpm --filter vercel... --recursive run build
```

Then run from `packages/cli`:

```sh
node test/dev/queue-sdk-smoke.mjs /absolute/path/to/vqs/packages/queue
```

An optional second package directory extends the same smoke to real schedule
delivery. Build the Schedules SDK in its own repository first:

```sh
node test/dev/queue-sdk-smoke.mjs /absolute/path/to/vqs/packages/queue \
  /absolute/path/to/schedules/packages/schedules
```

This uses the SDK's default singleton and injected local environment, exercises
create/get/list/update/enable/disable/invoke/delete, then creates a five-second
single-fire schedule. It verifies the complete schedule envelope, including
`executionId`, nominal `scheduledAt` (without legacy `firedAt`), dynamic payloads,
and Queue ACK.
It also registers static direct-function and Queue schedules without configured
payloads. The real `handleSchedule(metadata => ...)` parser receives metadata only,
including `executionId` from `ce-id` and a `scheduledAt` Date from
`ce-vssscheduledat`. Function requests are bodyless, with no content-type,
`ce-time`, or `ce-vssscheduleexecutionid` headers, even after an API payload update.
Static Queue schedules initially deliver no payload;
API-set payloads survive code reloads and changed cron/timezone source snapshots.
The runner rejects configured static payloads for both target types, checks
retention after invalid reloads, edits/removes/restores definitions, and verifies
stable IDs/disabled state and dynamic schedule preservation.

The runner copies this fixture to a temporary directory, installs its Next.js
dependencies, and links the supplied SDK. It launches `vc dev --local` with an
isolated CLI configuration; no Vercel account or deployment is needed. The
application uses default SDK configuration. Only the external publisher needs
the resource environment supplied explicitly, because it is not a CLI child.
The runner sets `NODE_ENV=development`, `VERCEL_QUEUE_BASE_URL`,
`VERCEL_QUEUE_TOKEN=vc-dev-token`, and `VERCEL_REGION=dev1` for Queue publishers.
For Schedules management it sets `NODE_ENV=development`,
`VERCEL_SCHEDULE_BASE_URL`, `VERCEL_SCHEDULE_TOKEN=vc-dev-token`, and
`VERCEL_SCHEDULE_DEV_API_VERSION=1`. Both base URLs use `http://127.0.0.1` with
ports selected by the runner; no production credentials are required.

Checks cover manifest-discovered App and Pages router callbacks, a Next.js
`basePath` with `trailingSlash`, and a conventional standalone Node callback
discovered without a provider hook. A public redirect of the Node callback URL must not intercept
the broker's direct entrypoint invocation. A separate publisher process verifies
broker-owned retries and acknowledgments and HMR without replay. Editing
`vercel.json` removes and restores a callback while an unchanged callback keeps
working; re-registration delivers retained messages without replaying ACKed ones.
A fetch guard rejects non-local SDK requests. Dependency installation requires
registry access.

Once a compatible SDK is published, pin it in the fixture and move the runner
into the normal CLI dev integration suite. This standalone runner avoids either
skipping an integration test or pinning CI to an unreleased package version.
