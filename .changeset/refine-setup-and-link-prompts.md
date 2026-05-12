---
'vercel': patch
---

Refresh the `vc` setup-and-link flow for clarity and tightness:

- Prompt copy: `Want to modify these settings?` → `Customize defaults?`.
- Prompt copy: `Which scope should contain your project?` → `Team?`. Matches the language used in the dashboard and docs.
- Prompt copy: `What's your project's name?` → `Name?`. Directory-derived default still renders inline.
- Removed the `Set up and deploy "/path"?` confirmation prompt. Intent is implied by running `vc`; the path is still surfaced as a status line, and Ctrl-C remains the escape hatch.
- The `In which directory is your code located?` prompt now only fires when the current directory is a workspace (monorepo). Single-app projects default the root to `.`.
- The `Auto-detected Project Settings for X` line is now `Detected X (build: ..., output: ...)` — same information, single line, so users can verify the build + output commands without saying yes to Customize defaults first.
- Output: dropped emoji prefixes (`🔗`, `🔍`, `⏳`) on `Linked` / `Inspect` / `Production` lines. Bold typographic labels carry the meaning more cleanly and render consistently across terminals. Labels are padded to a shared column so URLs align when all three appear together.
- Output: dropped the `(created .vercel and added it to .gitignore)` parenthetical from `Linked` — implementation detail; `git status` surfaces it on demand.
- Output: dropped the `[2s]` timing suffix from `Inspect` / `Production` URL lines. URLs are results, not operations — timing belongs on the build/ready signal.
