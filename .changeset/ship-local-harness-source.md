---
'vercel': patch
---

`vercel ship` can now run against harness packages built from a local checkout
of `vercel/ai`. Set `VERCEL_SHIP_HARNESS_SOURCE` to the checkout and the CLI
packs and installs those builds instead of resolving from the npm registry.

This is how the command reaches the Claude Code bootstrap that drives a `claude`
executable the machine already has, rather than downloading a second copy of it:
the first run in a project writes about 40 MB instead of a few hundred, and takes
seconds instead of minutes. The first-run message now reflects which of the two
is about to happen.

The check for a half-installed bridge understands that outcome as well. Reusing
an installed executable skips the optional dependency that provides the pinned
binary, so probing the linked one would have found it unrunnable and cleared a
working install on every run.

Every run is now timed end to end. A breakdown of where the wall time went is
printed when the session finishes, and the full profile, including every tool
call, is written to `ship-profiles/` in the global config directory.

Deployments created during a session are now reported when it ends, with their
inspect URLs, instead of scrolling past in the transcript.

The agent is now required to ask through the `askUser` tool rather than ending a
turn with a question in prose, so answering a decision is a selection rather
than typing.
