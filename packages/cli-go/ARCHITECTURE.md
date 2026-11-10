# Vercel CLI in Go

Ported: `--help`, `--version`, `login`, `whoami`, `teams ls`, `teams
switch`. Verified side by side against the TypeScript CLI **61.1.0 at
`088b6278e9`** (see [Testing](#testing)).

**Goal: a rewrite, not a 1:1 port.** This is the chance to fix what
today's CLI gets wrong, not to copy it. Every command starts from today's
CLI: flags, arguments, output (terminal, piped and `--json`), help, exit
codes, files written and API requests. The e2e suite compares every case
with it, so every change is visible. Then we change what is wrong, on
purpose, guided by the CLI design system and by what agents need: each
change is declared on the e2e cases it affects and listed under
[Known differences](#known-differences). What we keep, we keep exactly; a
difference nobody declared is a bug. How commands are built changes too:
one declaration, one pattern, enforced by tests.

Porting a command means deciding, for each part of today's behavior,
whether to keep it or fix it: inconsistent names and flags, silent
fallbacks, errors that don't say what to do, output that differs between
commands. Keeping a past mistake because today's CLI has it is not a
reason on its own.

## Layout

```
cmd/vercel/          main: os.Exit(vercelcmd.Main())
internal/cli/        the framework: Command, Flag, Need, Input, Result,
                     Error; the parser; help
internal/cli/needs/  the needs a command declares: needs.Team() and others
internal/cmd/root/   the command tree, and the tests that enforce it
internal/cmd/<name>/ one package per top-level command
internal/vercelcmd/  startup (one method per step) and error output
internal/scope/      what needs resolve: the team, project or deployment
internal/api/        the REST client: HTTP policy and typed calls
internal/auth/       the login: token source, storage, refresh
internal/loginflow/  the device login, run by `login` and by needs that log in first
internal/oauth/      OIDC discovery, device authorization, refresh
internal/config/     config.json and auth.json
internal/link/       .vercel/project.json and repo.json
internal/clisession/ the CLI session that groups invocations
internal/iostreams/  the terminal: streams, color, output formats, spinner
e2e/                 side-by-side comparison with the TypeScript CLI
```

## Writing a command

A command is one `cli.Command` value. Its fields mirror upstream's
`src/commands/<name>/command.ts`, so porting starts by transcribing it.

```go
var listNeed = needs.Login()

var listCommand = &cli.Command{
    Name:        "list",
    Aliases:     []string{"ls"},
    Description: "Show all teams that you're a member of",
    Examples:    []cli.Example{{Name: "...", Value: []string{"vercel teams list --next 1584722256178"}}},
    Needs:       listNeed,
    Pagination:  &cli.Pagination{Default: 20, Max: 100},
    RunJSON:     runList, // func(context.Context, *cli.Input) (cli.JSONResult, error)
}

func runList(ctx context.Context, in *cli.Input) (cli.JSONResult, error) {
    user, err := listNeed.From(ctx, in)
    ...
}
```

- **Needs** are preflight: the state a command needs before `Run`. Every
  command that runs declares one need, from `internal/cli/needs`. It says
  what startup does first, adds the flags that name a project, and is the
  only way `Run` gets the user, the team or the project:
  `need.From(ctx, in)`. A need is never an action or an explicit argument:
  logging in is what `vercel login` does in `Run` (`in.Login`, which only
  it may call), and a deployment is a command's own argument. The list is
  closed (the interface's method is unexported), and options are typed per
  need, so a combination that makes no sense does not compile.

  | Need                                  | Before Run                      | Flags                | `need.From`                                                       |
  | ------------------------------------- | ------------------------------- | -------------------- | ----------------------------------------------------------------- |
  | `Nothing()`                           | nothing; `--scope` not resolved |                      | (`login`)                                                         |
  | `Login()`                             | log in first                    |                      | the user; `SelectedTeam`, `SaveTeam` (`teams ls`, `teams switch`) |
  | `Team(opts)`                          | log in first                    |                      | the scope, always a team                                          |
  | `Team(OptionalLogin(), LinkedTeam())` | nothing                         |                      | nil when logged out; the linked project's team wins (`whoami`)    |
  | `Project()` / `Project(Arg(0))`       | log in first                    | `--project` / none   | the team and project                                              |
  | `ProjectOrTeam()`                     | log in first                    | `--project`, `--all` | the team, and the project or nil with `--all`                     |
  | `EnsureLink()`                        | log in first                    | `--project`          | the team and project                                              |

  There is no personal account: a team is always a team (`--scope`, the
  linked project's, the saved team, else the account's default team), and
  without one a command that needs a team fails with what to pass. Nothing
  falls back to the user, and a team-scoped request without a team fails
  before it is sent (`api.ErrNoTeam`). Every need but `Nothing` has
  `--scope`, `--team` and the local config's scope resolved before `Run`,
  as upstream does for most commands. The rest is resolved when `Run`
  asks, so requests keep upstream's order. `Login` is upstream's
  `getUser`; `Team` is `getScope`, and with `LinkedTeam`
  `getScope(client, { resolveLocalScope: true })`; `Project` is
  `resolveProjectContext` over `getLinkedProject`, and makes the project's
  team the team of later requests, as `requireProjectContext`. No ported
  command uses the project needs yet; they are unit tested, and ported
  from upstream without the parts listed under
  [Known differences](#known-differences).

- **Flags.** Every flag is declared in `cli/flags.go`: global and shared
  flags (upstream's `util/arg-common.ts`), then each command's own, so a
  new name is one reviewed line there. A name has one meaning across the
  CLI, and names that mean what another name means (`--count`, `--page`,
  `--from`) are rejected (`cli.LookAlikes`). Read values with `in.Bool`,
  `in.String`, `in.Number`; reading an undeclared flag panics. The shared
  flags are never listed: `RunJSON` adds `--json` and `--format`,
  `Pagination` adds `--next` and `--limit`, and the need adds `--project`
  and `--all`.
- **Args** are for help only. As upstream, they are not counted.
- **Validate** checks the command's arguments and flag values (`teams ls`:
  no arguments). Startup runs it with the other input checks, before it
  writes, logs in, resolves the scope or makes a request, so its Input has
  only `Args`, the flags, `UI`, `Mode` and `Cwd`.
- **Pagination** (`&cli.Pagination{Default: 20, Max: 100}`) makes a list
  command page with `--next` and `--limit`, which it adds. Startup
  checks both after `Validate` (an integer `--next`, `--limit`
  from 1 to `Max`); help describes `--limit` with the default and maximum.
  The command reads them with `in.Page()` and gets the next-page command from
  `in.NextPage(next)`: the canonical path, the flags given except `--next`
  and `--format`, `--next <next>`, then the context flags.
- **HelpSections** follow the examples in help, as upstream's
  `helpSections`. Every ported command has a "Notes" section for behavior
  its options don't show: what it saves, where its output goes, its exit
  code. **Related** lists other commands by canonical path (`"teams
switch"`); help shows them last, as `vercel <path>` and the command's
  description.
- **Input** is everything else the command gets: `Args`, `UI` (stderr),
  `Mode` (CI, agent, non-interactive), `Cwd`, `Client` and the context
  flags. The user, team and project come only from the need.
- **API calls** are hand-written in `internal/api`, one function per
  endpoint, named after its operation (`GetProject`). Types keep the raw
  JSON next to the typed fields, so output can tell absent, null and `""`
  apart, as upstream. Every request says which team it sends (`Team`,
  `CurrentTeam` or `NoTeam`); one that says none panics.
- **Result.** `Run` returns a `cli.Result`, or nil. `Render(stdout, ui)` is
  the only way to reach stdout. An `ExitCode()` method exits non-zero after
  rendering.
- **JSON output.** A command that can print JSON sets `RunJSON` instead of
  `Run`. It returns a `cli.JSONResult`, a Result with a `JSON()` method, so
  a result without one does not compile. `RunJSON` adds `--json` and
  `--format` (validated, in help); with either, `JSON()` is written instead
  of `Render`. Without them the output is `Render`'s, for people and agents
  alike: JSON is only what `--json` or `--format json` asks for.
- **Errors.** Return a `*cli.Error` (message, hint, link, help, exit code, or
  `cli.Silent(code)` when already reported). API, network and OAuth errors
  are returned as they are; `vercelcmd/report.go` prints every error in
  today's formats.
- **Recovery commands.** An error's `Next` lists up to two commands that
  recover from it, likeliest first, each declared once at package level with
  `cli.NewNext(label, argv...)` (values to fill in are placeholders such as
  `<SLUG>`). Startup prints them under the error, after a blank line, with
  the failed command's context flags (`--cwd`, `-A`, `-Q`, `--scope`,
  `--team` as `--scope`, `--api`, `--non-interactive`; never `--token`):

  ```
  Error: You do not have permission to access scope nope.

    List the teams you can switch to:
      vercel teams list --scope acme
  ```

- **Errors for agents are text.** Agents get the same error people do,
  on stderr, never JSON: models read and act on plain words better. In
  non-interactive mode (`--non-interactive`, or an agent without a terminal
  on stdin), an API error adds a line saying what to do next, as upstream's
  `getErrorRecovery` hint (403, 402, 401, 429):

  ```
  Error: You don't have access
    Check that the selected team is correct. If it is, ask a team owner to
    grant the required access. Retry only after the team or access changes.
  ```

- **Groups** have `Children` and no `Run`. A `Default` child runs when no
  child name matches; otherwise `InvalidSubcommand` and the group's help are
  printed (exit 2). `Shortcuts` are aliases that also select a child
  (`vercel switch` is `vercel teams switch`). `NotPorted` children are listed
  in help, as upstream lists them, and fail like unknown commands.

Then add it to `cmd/root/root.go`, run `go test ./internal/cmd/root -update`
to pin its help, and add side-by-side cases in `e2e/`.

## Startup

`vercelcmd.Run` is a fixed list of steps (`startup.go`), each returning an
error instead of printing: parse the command line once; read the local
`vercel.json`; banner, `--version`, root help; detect agent, CI and
interactivity; select the command; command help; validate the input (ending
with the command's `Validate` and `Pagination`); load
`config.json`; load the credentials; build the API client with the saved
team; log in first when the need does; the explicit scope; build the
Input and run.

That is upstream's order, except that every check of the command line comes
before the first write and the first request. The invocation's team lives
on the API client; only login, `teams switch` and token refresh save
`currentTeam`.

The parser follows npm `arg` v5, which today's CLI uses, including its
error messages. At the root and at a group, unknown flags are positional (as
upstream's permissive parses); at a command, they are errors, kept until
after `--help` has had its chance. A few upstream rules read raw argv and
cannot go through the parser: the version banner, `--non-interactive
false`, and the color and hyperlink flags (`vercelcmd/mode.go`,
`iostreams/detect.go`).

## Enforcement

| Rule                                                                                                                                                                                                                                             | Test (`internal/cmd/root` unless noted)                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Command packages import only the framework and pure utilities (an allowlist), and don't print, exit, make HTTP requests, write control sequences or change the client's team, however the import is named                                        | `TestCommandsDoNotBypassTheFramework`                      |
| Every command has a description; commands have `Run` or `RunJSON` (not both), a need, an example and a "Notes" help section; `--json` and `--format` come only from `RunJSON`; groups have children and an invalid-subcommand error or a default | `TestCommandDeclarations`                                  |
| A need belongs to one command, and the argument it reads is declared                                                                                                                                                                             | `TestNeeds`                                                |
| Only `vercel login` logs in as its action (`in.Login`)                                                                                                                                                                                           | `TestCommandsDoNotBypassTheFramework` (an exception)       |
| A need is read only in `Run`, by its own command                                                                                                                                                                                                 | `TestNeedsReadOutsideTheirCommandPanic` (`internal/cli`)   |
| Every example runs logged in against a fake API, and with `--json` prints one JSON value                                                                                                                                                         | `TestExamplesRun` (`internal/vercelcmd`)                   |
| A request says which team it sends                                                                                                                                                                                                               | `TestRequestMustChooseItsTeam` (`internal/api`)            |
| Subcommands are named from one verb list; no command is named with a synonym (`get`, `show`, `delete`, ...)                                                                                                                                      | `TestCommandNames`                                         |
| A rule is broken only by an exception with its reason, and every exception is still needed                                                                                                                                                       | `exceptions_test.go`, `TestExceptionsAreUsed`              |
| A result for `--json` has a `JSON()` method                                                                                                                                                                                                      | the compiler (`RunJSON` returns `cli.JSONResult`)          |
| Every example parses and selects its own command                                                                                                                                                                                                 | `TestExamples`                                             |
| Every recovery command parses and runs a ported command; its label has no final `:` or `.`                                                                                                                                                       | `TestNext`                                                 |
| Every flag is declared in `cli/flags.go`; shared flags come from the framework; no look-alike names; reserved names belong to `cli`; a name or shorthand has one meaning                                                                         | `TestFlagNames`                                            |
| Help is pinned                                                                                                                                                                                                                                   | `TestHelpGolden` (`testdata/*.help`)                       |
| A command's checks run before config, login, scope and requests                                                                                                                                                                                  | `TestCommandChecksRunBeforeAnyWork` (`internal/vercelcmd`) |
| Startup imports no command package, only the tree                                                                                                                                                                                                | `TestStartupImportsNoCommand` (`internal/vercelcmd`)       |
| `Pagination`'s default is within 1 and the maximum                                                                                                                                                                                               | `TestPagination`                                           |
| Related commands are ported, canonical, not the command itself and not repeated; help sections have a title and a body                                                                                                                           | `TestRelated`                                              |
| Behavior matches the TypeScript CLI; differences are declared                                                                                                                                                                                    | `e2e` (`Case.Differs`)                                     |

## Known differences

Differences a side-by-side case can observe are declared on the case
(`Case.Differs`); the harness applies them to the TypeScript outcome, still
compares everything else, and fails when a declared difference stops
occurring.

- **Input is checked first.** Help, a group without a valid subcommand, and
  invalid flags, `--format` values or tokens are handled before
  `config.json` is created or the scope is resolved over the network. With
  several input errors, the first reported can differ.
- **A command's own checks come first too** (`CheckedBeforeWork`). Today
  `teams ls` checks its arguments, `--next` and `--limit` only after
  creating `config.json`, logging in and resolving `--scope`. Here they run
  with the other input checks: `teams ls --limit 0` while logged out reports
  the bad limit instead of "No existing credentials found" (or, on a
  terminal or for an agent, a login flow first), and with `--scope` makes no
  request.
- **The next-page command is canonical and keeps the context flags**
  (`NextPage`): `vercel teams list --limit 1 --next 1584722256178 --scope
acme`. Today it is always `vercel teams ls ...`, without `--scope`,
  `--cwd` or the other context flags, so it can page a different context.
- **Signals.** SIGTERM and SIGHUP exit 143 and 129; SIGINT is unchanged
  (130, or 0 for login).
- **The command is found by position,** so `vercel --scope whoami -- whoami`
  works; today it fails with a bogus missing value. Explicit scope detection
  reads parsed flags, so `-dS acme` counts.
- **Help adds notes and related commands** (`HelpAdds`): after the
  examples, a command's help has a "Notes" section and a "Related" list.
  Today's help ends at the examples. The rest of the page is unchanged.
- **Unported commands** print `Error: The "<name>" subcommand does not
exist`, including `vercel` with no command, paths, extensions and
  `NotPorted` subcommands. Root help lists only ported commands.
- **Errors suggest recovery commands** (`Recovery`): `teams switch` with an
  unknown slug suggests `vercel teams list`. Today's error ends at the
  message.
- **teams switch** without a slug reports that one is required and suggests
  `vercel teams switch <SLUG>` and `vercel teams list` (today: an
  interactive picker, or an `action_required` JSON payload for agents). Switching to a
  team that needs SSO fails instead of re-authenticating.
- **Agents get text errors** (`AgentText`): where today's CLI prints a JSON
  payload on stdout in non-interactive mode (`outputAgentError`,
  `outputActionRequired`), this one prints the error people see, on stderr,
  with its recovery commands, and stdout stays empty. An API error adds the
  payload's `hint` as a line under it. The payload's other fields
  (`reason`, `retryable`, `userActionRequired`, `scope`, `cliVersion`,
  `invocationId`) are not printed. Today, some errors are JSON for agents
  and others text; here all are text.
- **teams switch without a slug in non-interactive mode** is checked before
  any work (`CheckedBeforeWork`); upstream checks it before fetching teams
  but after creating `config.json` and logging in.
- **Not ported:** telemetry (today's CLI also requests `/v2/user` for it;
  e2e cases assert this with `TelemetryLookups`; only the CLI session is
  ported, for the `x-vercel-cli-session-id` header: `telemetry-device.json`
  is not written, and `telemetry-session.json` is written once startup
  reaches the API client, not for help or invalid input), update checks, Sentry, app
  principals, native-binary enrollment, and starting a new device login when
  an interactive session's refresh fails (the login is emptied instead).
- **Runtime identity:** no `(Node.js x.y.z)` in the banner (as the native
  TypeScript build), and the user agent names Go.
- **JavaScript-specific text,** such as JSON syntax errors and `TypeError:
fetch failed`, and `--scope` with no value, which crashes today's CLI.
- **The keyring** is macOS-only, and untested against entries written by the
  TypeScript CLI.
- **No personal accounts.** Every account works in a team, as a northstar
  account does today; declared on each case it changes (`Changed`):
  - A command that needs a team uses the account's default team when none
    is selected, and fails with recovery commands when there is none.
    Today a legacy personal account falls back to the personal account.
  - `whoami` always shows a team; `teams ls` lists no personal account and
    marks the default team as current when none is saved; `teams switch
<username>` and `--scope <username>` fail ("You cannot set your
    Personal Account as the scope."), as today for northstar accounts.
  - A directory linked to a project outside a team (an `orgId` that is not
    a team's) is an error, not the personal account.
  - A linked team's project names the team even when none is selected;
    `whoami`'s local override then says `globally selected: none`. Today:
    `Personal Account`.
  - Errors no longer mention a personal scope ("A team slug is
    required.").
- **Needs no ported command uses yet** (`Project`, `ProjectOrTeam`,
  `EnsureLink`) leave out: linking an unlinked
  directory at a terminal (`EnsureLink` fails as without one), the
  `repo.json` project picker (several projects act as without a terminal),
  services detection (`resolveProjectCwd`), `getLinkedProject`'s owner and
  remote lookup options, and the JSON payloads for agents (text errors, as
  above). Upstream looks up a linked
  project's owner and the project at once; here one after the other. Each
  command that uses them decides, when it is ported, which of today's
  behavior to keep and which to fix.

Not yet verified side by side: token refresh before requests (unit tested),
the agent hints for 401, 402 and 429 (unit tested; 403 is verified),
Windows and Linux, Ctrl-C during login.

## Testing

```sh
make build test lint

# Side by side with the TypeScript CLI built at 088b6278e9 (pnpm install;
# pnpm -r --filter "vercel^..." run build; node scripts/build.mjs in
# packages/cli), on Node 20. The versions must match.
make build VERSION=61.1.0
go test -tags e2e ./e2e -args -reference=<ref>/packages/cli/scripts/start.js -node=<node20>

# A refactor that should change nothing: compare with a previous build.
go test -tags e2e ./e2e -args -reference=<old>/bin/vercel -node=<a script that runs "$@"> -go-reference
```

Today's `teams switch` fetches the user and the teams concurrently, so their
order varies between its own runs; those cases compare requests in any order
(`UnorderedRequests`).

On Node 26, today's CLI fails every request through `HTTPS_PROXY` (its
bundled undici `ProxyAgent` is rejected by Node's `fetch`), and the e2e
login cases use a proxy.

## Decided

- Our own parser and declaration, no cobra/pflag: their parsing, help and
  execution differ from today's CLI. The only dependency is `x/term`.
- API calls are written by hand until there are enough to generate
  (`oapi-codegen` mishandles `null` enums and millisecond timestamps).
  Today's CLI calls two legacy endpoints, `GET /teams/{idOrSlug}` and `GET
/v1/teams`, so this CLI does too.
- Credentials are stored as today: `credStorage` `file`, `keyring` or
  `auto`, overridden by `VERCEL_TOKEN_STORAGE`, with today's migrations.
- The version is `packages/cli`'s, embedded by `make build`.

## Next

Done, each change a declared difference with e2e cases: errors with
recovery commands, checks before any work, text errors for agents, help notes and
related commands, and shared pagination. Also done, with no change in
behavior: needs, the only way a command gets its user, team or project,
and the rules above that keep commands declared one way. Also done, matching today's CLI:
the CLI session header, today's attribution (invocations less than 30
minutes apart share a session ID, whatever agent or directory they run in).

Not planned for now: telemetry, and porting more commands.

Later: a session per agent session (an agent's own session ID, or a hashed
working directory, so concurrent agents are told apart; needs the API side to
agree); machine-readable help (`--help --json`, with related commands); CI
running the e2e suite against a pinned, cached TypeScript reference; removing
implicit team scope, one JSON shape, one exit-code table, generated API
types, tracing.
