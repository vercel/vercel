---
'vercel': patch
---

`vercel ship` now attributes every line of a session. The CLI, the harness
driving it, and anything executed on the machine each get their own label in a
fixed column, under an opening frame stating that Vercel is orchestrating an
agent the developer already installed rather than running one of its own.

Reasoning is collapsed to a single line reporting how long it took. In a
measured session it was a quarter of everything printed, in blocks of up to
fifty lines, and it is process rather than result. `--verbose` restores it.

Text is wrapped to the terminal with hanging indents, so a wrapped list item
lines up under its own text, code keeps the indentation it was written with, and
commands are cut rather than folded. The status line names the harness that is
working and carries the total elapsed time for the run.
