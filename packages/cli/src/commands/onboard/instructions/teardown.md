# Follow-up: tear it all down

The user chose to undo everything this session created, so the project can be
run again from a clean slate. Do it now, in this session — do not write a
script.

The CLI kept a ledger of every remote effect this session performed. It is the
authoritative list of what exists because of you; your own memory of the
session fills in the local side (files you created or modified).

```json
{{LEDGER}}
```

Work through it in this order:

1. **Provisioned resources** — disconnect and delete each one:
   `vercel integration-resource remove <resource> --disconnect-all --yes`.
2. **The project** — if the ledger says this session _created_ it, remove it:
   `echo y | vercel project rm <name>`. A project that existed before and was
   merely _linked_ stays; ask through `askUser` if the ledger leaves it
   ambiguous.
3. **Local artifacts you created** — delete `.vercel/`, `.env.local`, and every
   file you added, including `vercel.json` if you created it. Leave
   `.harness-bootstrap/` and `.agent-runs/` alone: they belong to the coding
   agent, deleting them undoes nothing this session did, and re-downloading
   takes minutes.
4. **Files you modified** — restore them with `git checkout -- <file>`; find
   them with `git status`. Never revert a file you did not touch.

Remote deletions pause for the user's approval in their terminal — that is
expected. Proceed and let them decide each one; a decline means keep it, not
retry.

Then verify: the resources and project no longer appear in the relevant
`vercel ... ls` output, and `git status` shows none of your changes. Report
what was removed, one line each, plus anything you intentionally left.
