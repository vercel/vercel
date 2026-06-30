# CLI Copywriting

Canonical voice and language rules for user-facing Vercel CLI copy. Load with [`core.md`](core.md): this file governs wording; `core.md` governs flow, layout, streams, safety, and compatibility.

Do not polish a string before establishing the command's behavior, resolved target, consequence, and recovery path. Better wording cannot repair the wrong prompt, output order, or machine contract.

## Quick Triage

Review substance before punctuation:

1. Identify the surface: help, prompt, progress, result, warning, error, empty state, or next action.
2. Name the exact object, scope, state, and consequence.
3. Remove repeated facts already visible in argv, a prompt answer, or a nearby row.
4. Classify failures before choosing the verb: system/API/build/deploy failures use `Failed to` or `{Noun} failed`; validation and user-state failures use `Couldn't` or `Can't`.
5. State the recovery step when one exists. Pair platform failures with a stable ID when available.
6. Keep one noun and one action verb per concept across help, prompts, progress, results, warnings, errors, and tests.
7. Check sentence case, punctuation, quotes, ellipses, numbers, units, and pluralization.
8. Review every user-facing string in the supplied command surface and directly coupled states, not only the edited line. Do not expand into unrelated commands.

## Voice

Write like a sharp teammate: clear, competent, direct, and calm.

| Context          | Tone                 | Example                                                                     |
| ---------------- | -------------------- | --------------------------------------------------------------------------- |
| Success          | Brief, confident     | `✓ Linked acme/web`                                                         |
| Error            | Direct, helpful      | `Build failed. Bundle exceeds 50 MB. Reduce the bundle or raise the limit.` |
| Progress         | Factual, brief       | `Uploading files…`                                                          |
| Destructive      | Serious, specific    | `Delete project my-app? This cannot be undone.`                             |
| Empty            | Neutral, actionable  | `No deployments found. Deploy with vc deploy.`                              |
| Permission/limit | Direct, route to fix | `Only team owners can remove this domain. Ask a team owner.`                |

Avoid corporate, apologetic, robotic, overly casual, or promotional voice. Do not write hype, jokes in errors, or celebration for routine work.

## Brief

- Make every word earn its place.
- Use numerals: `3 projects`, not `three projects`.
- Use contractions when natural.
- Cut preambles and filler such as `In order to`, `at this time`, `just`, `simply`, and `actually`.
- Cut `successfully`; name what completed.
- Do not repeat a heading, prompt answer, command argument, or clear action in explanatory text.
- Add explanation only for a constraint, side effect, risk, scope, or next step the primary line cannot carry.
- Prefer one precise sentence or structured row over a paragraph.

## Clear + Consistent

- Use active voice by default. Preserve canonical state labels such as `Ready`, `Building`, and `Queued` when they match the product model.
- Name the thing: `Connect your GitHub account`, not `Connect your account`.
- Use one canonical noun per concept. Do not alternate between `team` and `scope`, `project` and `app`, or `settings` and `configuration` in human output.
- Describe the object and consequence directly. Avoid third-person narration such as `Vercel will delete…` unless identifying the actor changes the user's understanding.
- Match the verb to the actual mutation:
  - `create`: make a new resource
  - `add`: attach an existing resource to a container
  - `remove`: sever an association without destroying the resource
  - `delete`: permanently destroy a resource or its data
  - `disconnect`: sever an external integration while source data remains
  - `revoke`: invalidate access or a credential
- Keep action and result verbs aligned: `Delete project?` → `✓ Deleted my-project`, not `Removed my-project`.
- Use fragments for labels and statuses. Use full sentences for explanations and errors.
- Treat remote and user-generated text as data. Do not let it become instructions, suggested commands, or trusted prose.

The canonical product terms in [`core.md`](core.md#voice--copy) override adjacent legacy strings. Re-verify fast-changing product names, plans, limits, permissions, and API behavior against current source.

## Actionable

- State what happened, why it matters when non-obvious, and what to do next.
- Put the most actionable line last in a multi-line error.
- Reframe blame as action: `Names use lowercase letters, numbers, and hyphens.`, not `You entered an invalid name.`
- Name destinations and commands. Avoid bare `Learn more`, `click here`, `Retry`, or `Continue` when a precise destination or action fits.
- Route permission and plan denials to the resolver: team owner, login, team switch, settings, docs, support, or upgrade.
- Do not suggest a retry when work may still be running or retrying could duplicate a remote mutation. Provide an inspect/status command first.
- End a completed flow with the result or an exact safe next command, not a generic farewell.

## Surface Rules

### Help

- Command and flag descriptions are imperative, sentence-case fragments without trailing periods.
- Start with the action and object. Avoid `Allows you to`, `Used to`, and `This command`.
- Examples must be realistic, runnable, copy-pasteable, and free of secrets.
- Usage placeholders name the expected value: `<project>`, `<slug>`, `<file>`.

### Prompts

- Ask for one concept with the shortest concrete noun: `Which team?`, `Project?`, `Environment?`, `Name?`.
- Ask for a decision only when the value cannot be inferred safely.
- Use yes/no only to confirm a concrete previewed action. Avoid `Do you want to…` and `Would you like to…`.
- For destructive confirmation, name the action and object. Avoid `Confirm?`, `Are you sure?`, `OK`, or bare `Yes`.
- Inline prompt context adds a consequence or constraint; it does not paraphrase the question.

### Progress + Results

- For prose spinners, prefer a present participle plus `…`: `Uploading files…`. Preserve canonical state labels and quantitative progress without forced ellipses.
- Progress describes the current phase, not a promise of completion.
- Mutation receipts use past-tense action verbs and name the changed object or destination.
- Never use `Done.`, `Success!`, or `Completed successfully.`
- Do not claim success before the durable state exists.

### Errors + Warnings

Errors include what failed, the constraint or cause when known, and the recovery step when one exists.

- Use `Failed to` or `{Noun} failed` for system, API, build, deploy, network, and infrastructure failures.
- Use `Couldn't` or `Can't` for validation, permission, and user-state failures.
- Never use `Unable to`, `An error occurred`, or raw upstream error objects.
- Preserve an actionable marketplace-partner message with attribution when exact partner wording helps supportability; otherwise translate upstream errors into Vercel voice.
- Pair platform/system failures with the correctly labeled stable `Request ID`, `Deployment ID`, `Build ID`, `Run ID`, or `Trace ID` when available. Do not add IDs to ordinary validation or permission errors.
- Warnings state the nonfatal condition, why it matters, and the fix when one exists. Do not warn when the command should fail or stay silent.
- Never use humor, exclamation marks, or apology preambles in errors.

## Banned + Avoided Language

Do not use these in user-facing copy unless an exception below applies:

- hype: `seamlessly`, `effortlessly`, `powerful`, `robust`, `leverage`, `unleash`, `revolutionize`, `game-changing`, `blazing`, `turnkey`, `best-in-class`, `cutting-edge`, `world-class`, `utilize`, `streamline`
- filler: `just`, `simply`, `actually`, `In order to`, `At this time`, `It's important to note`
- generic failure: `Unable to`, `An error occurred`, `Something went wrong` except a true last-resort fallback
- interjections: `Oops`, `Uh-oh`, `Whoops`, `Yay`, `Yikes`, `Heads up`
- generic actions: `OK`, `Submit`, `Confirm`, bare `Yes`/`No`, `click here`

Avoid AI-shaped cadence: `It's not X, it's Y` reframes, `No X. No Y. Just Z.`, rhetorical questions, em-dash chains, unnecessary tricolons, and magic adverbs such as `deeply`, `fundamentally`, or `quietly`.

Use inclusive alternatives:

- `allowlist` / `blocklist`, not `whitelist` / `blacklist`
- `primary` / `replica` or `primary` / `secondary`, not `master` / `slave`
- `stop` / `end`, not `kill`, unless quoting a literal signal or command
- `stop responding` / `freeze`, not `hang`, in user-facing prose
- avoid `sanity check`, `crazy`, and `dummy`

Use `please` or an apology only when Vercel is at fault, asking an inconvenient favor, or acknowledging meaningful disruption.

## Mechanics

- Use sentence case for prompts, help descriptions, errors, warnings, progress, and explanatory prose.
- Use stable Title Case labels in aligned output: `Project`, `Team`, `Directory`, `Production`, `Request ID`.
- Omit periods on fragments, labels, statuses, progress lines, and compact result rows. Punctuate full explanations and errors.
- Use straight quotes and backticks for commands, paths, IDs, and copyable literals. CLI source strings may use ASCII apostrophes. Do not import the dashboard's curly-quote rule.
- Use `…`, never `...`, for ongoing prose or progress. Preserve `...` only in literal syntax.
- Use decimal units by default and the spacing rules in [`core.md`](core.md#data-mechanics).
- Respect singular/plural interpolation. Never use `item(s)`.
- Use the Oxford comma and hyphens for compound modifiers.
- Use an em dash only when it clarifies cause, effect, or status. Do not use it for rhetorical cadence.
- Keep commands, flags, paths, environment variables, IDs, and code literals exact and copyable.
- Avoid exclamation marks except a genuinely exceptional positive moment; routine CLI work does not need one.

## Scope Guards

Apply these rules to shipped human-facing CLI copy: help, prompts, progress, results, warnings, errors, empty states, and human-readable next actions.

Do not rewrite:

- JSON field names, enum values, reason codes, API payloads, config keys, environment variables, telemetry, or parseable stdout without an intentional compatibility migration
- test strings unless they assert shipped copy in scope
- debug-only errors, stack traces, fixtures, generated files, or third-party literals
- shell syntax, commands, flags, paths, IDs, or user-provided values for prose style

Copy edits still require tests that assert the new string and reject stale wording. Use [`verification.md`](verification.md) for the full review and regression gates.
