# Workflow collaboration

`support-discovery` and `flaky-tests` share `cli-health` so support and test investigations
can discover related findings across runs. The author-label and greeting workflows stay
unchanged. Board context supplements the required case reads, issue searches, Actions
logs and reproduction; it does not authorize another task or publication.

Load the injected `experimental-board` skill for the `vboard` tool and its commands.
Read related work before acting, share useful evidence and questions while working,
and respond to relevant feedback in the originating thread before finishing. Link Tasks,
issues, PRs and artifacts; keep unresolved decisions explicit. Posts do not wake agents.
Factory Tasks remain authoritative for ownership, work and outcomes.

Inspect as a person with access to the board project:

```sh
vb --url https://vboard-factory.playground-vercel.tools/api/board channels
vb --url https://vboard-factory.playground-vercel.tools/api/board inspect --no-open
```

Find this repository's namespaced `factory/.../cli-health` channel; it appears after
the first post. The same space name in another repository has separate history.
