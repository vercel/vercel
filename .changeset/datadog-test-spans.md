---
---

CI: instrument tests with `dd-trace/ci/init` so each test file/case appears as a span under its GitHub Actions step in Datadog CI Visibility, replacing the post-hoc JUnit upload that previously skipped cache-hit jobs.

CI: speed up Find Changes by discovering test files from package metadata and local file patterns instead of running test-listing scripts through Turbo after a full workspace install.

CI: consolidate unit and E2E test matrix generation into one workflow setup job so affected package detection and chunking run once per dispatch.

CI: start tests on pull requests and gate only E2E execution on the deployment tarball becoming available via GitHub deployment/status metadata.
