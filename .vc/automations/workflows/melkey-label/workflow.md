---
description: Label pull requests by author
on: { events: [pull_request.opened] }
actions:
  github.read_pull_request: true
  github.add_label: { labels: ['melkey', 'jackj'] }
---

Load the author-labels skill and follow it for the pull request this run was started for.
