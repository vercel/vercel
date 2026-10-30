---
'vercel': patch
---

`vercel traces inspect` improvements:

- `--view waterfall` draws the trace as a waterfall chart in the terminal, colored by service like the dashboard. Markdown stays the default, and `--open --view waterfall` still opens the dashboard.
- The Markdown summary labels each tree row (start, duration, self time, % of trace, name, status), lists the slowest spans by self time, groups repeated siblings into one row, uses milliseconds throughout, and caps the tree at 96 rows, keeping errors and slow branches and saying how many spans were left out.
- Incomplete traces are flagged on stdout instead of only on stderr.
- Failed lookups print the API's reason, such as a request ID outside the trace retention window.
