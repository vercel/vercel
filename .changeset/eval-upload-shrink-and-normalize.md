---
"vercel": patch
---

[evals] Shrink eval result uploads and fix run discovery

The eval ingest transform (`transform-agent-eval-to-canonical.js`) now excludes raw transcripts (`transcript-raw.jsonl`) from the `--upload-artifacts all` path, roughly halving each ingest payload. The parsed `transcript.json` is still uploaded and still read for `resolvedModels` metadata.

It also normalizes provider-prefixed model paths before upload. Models that resolve to `provider/model` (e.g. `openai/gpt-5.5-pro`) write results one directory deeper, pushing the timestamp past the `experiment/model/timestamp` shape the ingest endpoint discovers runs from, which previously failed with `Could not discover any experiment/model/timestamp runs`. The model is now collapsed to a single segment (`openai-gpt-5.5-pro`) so discovery succeeds.
