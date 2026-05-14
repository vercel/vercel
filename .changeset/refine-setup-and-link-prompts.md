---
'vercel': minor
---

Refresh the `vc` setup-and-link flow and post-deploy output for clarity and visual consistency.

**Prompt copy**
- `Want to modify these settings?` → `Customize settings?`.
- `Which scope should contain your project?` → `Which team?`. Matches dashboard + docs vocabulary.
- `What's your project's name?` → `Name?`. The directory-derived default still renders inline via the inquirer default.
- `Loading scopes…` spinner → `Loading teams…`.

**Flow changes**
- Removed the `Set up and deploy "/path"?` confirmation prompt. Intent is implied by running `vc`; the path is surfaced as a status line (`  Set up "/path"`) and Ctrl-C remains the escape hatch.
- The `In which directory is your code located?` prompt now fires when (a) the current directory is a workspace (monorepo with multiple packages), (b) the user explicitly chose "Choose a different root directory" via the inferred-services picker, **or (c) framework detection at the root finds nothing — covers nested-monolith layouts like `repo/app/package.json` where the app lives in a subdir.** Single-app projects with a framework detected at the root still default the root to `.` and skip the prompt.

**Output format**
- `Auto-detected Project Settings for X` line replaced with a single bold `Detected X (Build Command: …, Output Directory: …)` line. Title Case labels match the checkbox panel below. Only `Detected` is bold; framework name and parens render plain/dim.
- Introduced a new aligned-label format for status output via the `printAlignedLabel` helper (12-char bold label column, value column at terminal column 14). Applied to `Linked` / `Inspect` / `Production` / `Preview` / `Aliased` / `Added` rows.
- `vc redeploy` output now uses the same aligned-label format as `vc deploy` — `Inspect` / `Production` / `Preview` / `Aliased` rows are consistent across both commands. No more emoji-prefix / aligned-label mixing in the same session.
- `vc link --repo` info messages (`No Projects are linked…`, `Found N Project(s) linked…`, `Detected N new Project(s)…`, `Created new Project: …`) dropped the gray `> ` prefix and now use the 2-space indent that matches the rest of the link/setup flow.
- Path-in-prompt for `vc link --repo` confirm message uses `chalk.dim` instead of `chalk.cyan` — paths are not URLs, so dim is the correct treatment per the color rules (cyan reserved for URLs).
- Introduced a "gutter" semantic system: column 0 is reserved for semantic glyphs. `▲` marks Production deploys (`▲ Production  URL`) and breaks out of the indent — bookending the session with the `▲` brand mark at the top. Preview deploys stay in-column without the triangle.
- Added a terminal `✓ Ready in Xs` line at deploy completion (green ✓ at column 0, bold `Ready`, dim duration). Skipped when `--no-wait` is set and the deployment hasn't reached READY yet.
- Dropped the emoji prefixes (`🔗`, `🔍`, `⏳`) on Linked / Inspect / Production rows (across both `vc deploy` and `vc redeploy`).
- Dropped the `Building: ` prefix from the build-logs spinner. Each streamed log line is shown verbatim instead of `Building: <line>`.
- Dropped the `(created .vercel and added it to .gitignore)` parenthetical from `Linked` — `git status` surfaces it on demand.
- Dropped the `[Xs]` timing suffix from URL lines. URLs are results, not operations — timing belongs on the build / ready signal.

**Defensive fix**
- `services-setup.ts` now uses an optional chain on `detectServicesResult.resolved?.source`. This was crashing the setup flow before any prompts could fire when no services were detected (common for empty or simple fixtures).

**New helper**
- `packages/cli/src/util/output/print-aligned-label.ts` exports `printAlignedLabel(label, value, options?: { gutter?: string })` and the `ALIGNED_LABEL_WIDTH` constant (12). Used by every aligned-row print site.
