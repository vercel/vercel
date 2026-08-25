# Authentication

Vercel CLI uses either a saved OAuth session or an access token. Choose the method based on how much you trust the machine and whether a person can approve a login.

## Choose an authentication method

| Environment                         | Authentication                                      | Credential lifetime                         |
| ----------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| Trusted computer or personal server | `vercel login`                                      | Saved OAuth session refreshes automatically |
| Trusted server over SSH             | `vercel login --no-browser`                         | Saved OAuth session refreshes automatically |
| Unattended automation               | Project-scoped `VERCEL_TOKEN` from a secret manager | Token is supplied for each run              |
| Shared or disposable server         | Project-scoped `VERCEL_TOKEN` from a secret manager | Do not save an OAuth session                |
| Untrusted server                    | Do not authenticate or pull environment variables   | No credential                               |

`vercel env pull` writes plaintext environment variables to a local file. Do not use it on a machine that must not read those values, even if its access token is narrowly scoped.

## Sign in from a remote machine

Run this in an interactive SSH session:

```bash
vercel login --no-browser
```

The CLI prints `https://vercel.com/device` and a one-time code. Open that URL on your phone or client computer, enter the code, and approve the sign-in. The remote CLI waits for approval, then saves an OAuth access token and refresh token in its configured credential store. Verify the active account with `vercel whoami`.

Use this only when the remote machine is trusted with your Vercel account. A later command that reads sensitive environment variables can require the same device-authorization step again.

## Automate with an access token

For scheduled jobs and non-interactive commands, create an access token at https://vercel.com/account/tokens and store it in the host's secret manager. Prefer a project-scoped token. It limits the token to one project instead of every team and project you can access.

```bash
export VERCEL_TOKEN=<project-scoped-token>
vercel env pull .env.local --yes
```

`VERCEL_TOKEN` takes precedence over saved credentials. The CLI does not save or refresh it. Do not pass a token through `--token` unless no secret environment mechanism is available because command-line arguments can appear in process listings.

## Scope the project explicitly

For a server without a local `.vercel/` link, set both project identifiers or pass an explicit project and team:

```bash
export VERCEL_ORG_ID=<team-id>
export VERCEL_PROJECT_ID=<project-id>
vercel env pull .env.local --yes
```

Confirm the resolved project before a consequential read or mutation with `vercel project inspect --non-interactive`.
