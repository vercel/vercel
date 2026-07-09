---
'vercel': patch
---

Skip the `Which team?` prompt when the account has exactly one team choice
(for example a token scoped to a single team). The resolved team is shown as
an aligned `Team` row instead, and the project picker hides
`Choose a different team` when there is no other team to choose. Team picker
labels now match `vc switch`: `Name (slug)`, a bold `(current)` marker, and a
lock for teams that require SSO.
