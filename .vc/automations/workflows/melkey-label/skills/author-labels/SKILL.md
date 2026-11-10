---
name: author-labels
description: Decide which author label, if any, a pull request gets. Load before labeling a pull request.
---

Read the pull request with `read_pull_request`. Then read [the author list](references/authors.md)
and look for the pull request's author login in it. GitHub logins are case-insensitive.

If the author is listed, add that author's label with `add_label`. Otherwise add no label.

Finish with one line: the pull request number, its author, and the label you added or "no label".
