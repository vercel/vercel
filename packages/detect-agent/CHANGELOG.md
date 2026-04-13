# @vercel/detect-agent

## 1.2.2

### Patch Changes

- Detect Cursor agent execution when `CURSOR_EXTENSION_HOST_ROLE=agent-exec` is set so tools launched from Cursor still report the `cursor-cli` agent when `CURSOR_AGENT` is not present. ([#15879](https://github.com/vercel/vercel/pull/15879))

## 1.2.1

### Patch Changes

- Add GitHub Copilot detection support by recognizing `AI_AGENT=github-copilot|github-copilot-cli` and fallback Copilot CLI environment variables (`COPILOT_MODEL`, `COPILOT_ALLOW_ALL`, and `COPILOT_GITHUB_TOKEN`). ([#15449](https://github.com/vercel/vercel/pull/15449))

## 1.2.0

### Minor Changes

- Add `cowork` as a distinct agent name to differentiate Claude Cowork from Claude Code via the `CLAUDE_CODE_IS_COWORK` environment variable. ([#15441](https://github.com/vercel/vercel/pull/15441))

## 1.1.1

### Patch Changes

- Add Antigravity agent detection via `ANTIGRAVITY_AGENT` environment variable ([#15413](https://github.com/vercel/vercel/pull/15413))

- Detect Codex when `CODEX_CI` or `CODEX_THREAD_ID` is present. ([#15412](https://github.com/vercel/vercel/pull/15412))

## 1.1.0

### Minor Changes

- Detect Augment and OpenCode agents ([#14635](https://github.com/vercel/vercel/pull/14635))

## 1.0.0

### Major Changes

- Change return format to be an object to future proof ([#13965](https://github.com/vercel/vercel/pull/13965))

## 0.2.0

### Minor Changes

- Improve agent detection ([#13762](https://github.com/vercel/vercel/pull/13762))

## 0.1.0

### Minor Changes

- Initial release ([#13745](https://github.com/vercel/vercel/pull/13745))
