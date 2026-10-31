# Deployment

## Identity and Source

Inspect the exact deployment URL or alias supplied by the user. An alias need not match the project name; resolve the project from deployment metadata rather than the hostname prefix. Failure to find an inferred project name does not prove lack of access.

`vercel deploy` deploys local source; `vercel deploy --prebuilt` uploads existing build output; `vercel redeploy` rebuilds an existing deployment from its source. Choose the source that tests the user's intended change. Deploying a local checkout is not interchangeable with a Git integration deployment: commit metadata, aliases, source provenance, and dashboard grouping may differ.

## Builds and Cache

A normal deploy does not consume prior local build output. Use the prebuilt deployment path when that output is the artifact to ship.

Forced deployment and reuse of build cache are separate choices. Check installed help for the rebuild path and cache controls rather than assuming a redeploy clears cache. Compare cache and source provenance when testing a cache hypothesis.

## Promotion and Verification

For a staged production rollout, deploy without moving the production domain, verify that deployment, then promote it. Keep the same deployment identity through those steps. Rolling releases additionally require checking the active stage before advancing or aborting.

Use the CLI's authenticated preview access when available instead of disabling Deployment Protection. If the environment cannot reach deployment hosts, report that limit rather than weakening protection.

When deployment completion is part of the task, inspect or wait for `Ready` or `Error`; starting a build is not proof of success.

## CI Builds and Artifact Transfer

For a local CI build, retrieve project settings and environment data, build for that environment, then deploy the resulting output through the prebuilt path. Keep the project/team and environment consistent across those steps. Validate repository mappings rather than allowing a CI command to link the wrong monorepo project.

When build and deployment run in separate jobs, check whether the output references files outside `.vercel/output/`. The standalone build option can inline referenced files; transfer the complete output and verify it in the destination job. This does not guarantee portability across builders, platforms, or build environments.

Supply credentials through the CI secret environment. Non-interactive execution and mutation confirmation are separate; plain CI does not necessarily receive agent-mode defaults. Discover each command's supported options through help rather than applying a blanket confirmation flag.

Capture deployment URLs from stdout without mixing in progress output. When a deployment is meant to validate the change, wait for its final state before reporting success.
