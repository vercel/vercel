# Sandbox

`vercel sandbox` forwards to the Sandbox CLI for project-scoped sandbox environments. Run `vercel sandbox --help` for the current list; the subcommands below are wired through `sandbox/index.ts`.

## Subcommands

```bash
vercel sandbox list                                                              # list sandboxes (alias: ls)
vercel sandbox create                                                            # create a sandbox
vercel sandbox create --connect                                                  # create and immediately open a shell
vercel sandbox run -- node -e "console.log('hi')"                                # create + run a command in one step
vercel sandbox exec <sandbox-id> -- npm test                                     # execute a command in an existing sandbox
vercel sandbox connect <sandbox-id>                                              # interactive shell (aliases: ssh, shell)
vercel sandbox copy ./local.txt <sandbox-id>:/tmp/                               # copy files (alias: cp)
vercel sandbox stop <sandbox-id>                                                 # stop one or more sandboxes (aliases: rm, remove)
vercel sandbox config network-policy <sandbox-id> --network-policy deny-all      # update sandbox network policy
vercel sandbox snapshot <sandbox-id> --stop                                      # take a filesystem snapshot (sandbox is stopped)
vercel sandbox snapshots list                                                    # list snapshots (subcommand group: list/get/delete)
vercel sandbox login                                                             # log in to the Sandbox CLI
vercel sandbox logout                                                            # log out of the Sandbox CLI
```

Use `--` to separate the sandbox command from arguments forwarded to the sandbox process (as in `run`, `exec`).

`sandbox config` is a subcommand group; the only configurable surface today is `network-policy`. `sandbox snapshot` requires `--stop` because snapshotting stops the sandbox first. `sandbox snapshots` (plural) is a separate subcommand group that manages existing snapshots (`list`, `get`, `delete`).

## Auth Forwarding

Global Vercel flags `--scope` / `--team` / `--token` are forwarded to the Sandbox CLI. For automation, set `VERCEL_TOKEN`; the CLI maps it to `VERCEL_AUTH_TOKEN` for Sandbox.

Sandbox commands may create external compute or interactive sessions. Confirm intent before creating or connecting to a sandbox.
