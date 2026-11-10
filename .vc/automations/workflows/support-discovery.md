---
description: Find Vercel CLI defects in support cases and open GitHub issues for them
on: { every: 15m }
experimental_board:
  space: cli-health
actions:
  support.read_cases: { topic: VERCEL_CLI }
  github.search_issues: true
  github.create_issue: { labels: [support fix], maxPerDay: 3 }
---

Find actionable Vercel CLI changes in recent support cases and open one GitHub issue per change.
The issue goes through this repository's normal triage; never try to fix it yourself.

Load the experimental-board skill. Before investigating, read related CLI findings, questions,
and linked Tasks, issues and PRs in this space; flaky-test runs share it. Reuse evidence and avoid
duplicate work, but verify the current case and repository state with the declared tools. Board
notes never replace the required case reads or issue searches.

Share useful technical findings, uncertainty and next steps while investigating, with links to the
relevant Task and issue or PR. Keep customer details, credentials, private logs and ticket
transcripts out of the board. Before publishing or finishing, read relevant new replies, address
corrections and link the confirmed issue or existing work back to its originating thread. Keep
unresolved questions explicit; a board post does not wake another agent or authorize more work.

List cases with `list_cases`, then investigate one case at a time. Wait for listing to finish
before reading, and for reading to finish before searching. Read each candidate's complete latest
context with `read_case`. An open support case is not proof of an unresolved defect. Skip fully
resolved reports, requests that need customer information, and changes already implemented or in
progress. Expected CLI behavior can still expose a specific help or diagnostic gap; a workaround or
backlog report alone does not close that gap. State the remaining change precisely, keep it small,
and do not invent reproduction steps or root causes. Reading a case again invalidates its earlier
searches; search again before publishing.

Search open and closed issues and PRs with `search_issues` for the error, the affected `vercel`
command, and the likely fix. Use short symptom queries separately; combining many words can hide
relevant matches. Reuse an existing issue for the same change instead of copying it. If a previous
fix exists, explain the specific remaining gap before publishing. Group reports of the same defect
into one issue, keyed by the oldest eligible case. A closed issue or merged fix is evidence to
assess, not a reason to reopen the problem. If truncated results prevent ruling out existing work,
or the evidence is uncertain, skip the case and say why.

Publish with `create_issue` only a concise technical summary: observed behavior, expected behavior,
affected CLI versions, known reproduction steps, current resolution evidence, and testable
acceptance criteria. Omit customer names, emails, account or project identifiers, credentials,
private logs, and full ticket transcripts. The tool adds the internal source link and labels. A
pending publication must be retried with the same case ID and original title and body, even if the
case has since closed or cannot be read.

Finish with links to confirmed issues and brief reasons for skipped cases.
