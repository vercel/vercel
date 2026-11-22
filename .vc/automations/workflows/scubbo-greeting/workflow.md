---
description: Greet pull requests opened by scubbo with "Hi Jack!"
on: { events: [pull_request.opened] }
actions:
  github.read_pull_request: true
  github.comment: true
---

Read the pull request this run was started for with `read_pull_request`.

If its author login is not `scubbo` (case-insensitive), stop without commenting.

Otherwise, use `comment` once to post exactly `Hi Jack!` on that pull request.
