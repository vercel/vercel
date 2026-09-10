# Vercel Toolbar Comments

`vercel comments` reviews and manages existing Vercel Toolbar comment threads from the terminal. Create new threads with the Vercel Toolbar.

## Review comment threads

Without a subcommand, `vercel comments` runs `list` and returns unresolved threads for the linked project. It filters by the current Git branch when the project resolves through the current checkout and a branch can be inferred.

```bash
vercel comments --json
vercel comments inspect <thread> --json
```

`list` has the alias `ls`, while `inspect` has the alias `get`. Commands that act on a thread accept its ID or full `vercel.com` comment URL. A URL supplies its team unless `--scope` or `--project` overrides it.

Use `--branch <branch>` or `--all-branches` to set branch scope explicitly. Other list filters include `--status`, `--page-path`, `--author`, `--content-id`, and `--search`. The `--author` option accepts user IDs or `me`, but not usernames. Resolving `me` requires user authentication.

## Reply and update threads

```bash
vercel comments reply <thread> -m 'Fixed in **main**.'
vercel comments resolve <thread> -m 'Fixed in the latest deployment.'
vercel comments resolve <thread-1> <thread-2> --yes
vercel comments reopen <thread> --yes
```

`reply` accepts Markdown from `--message`, `--file`, or standard input. Use `--attach <url>` repeatedly to add up to 10 HTTPS attachments. Attachments can form a reply without message text; local file uploads are not supported.

`resolve` and `reopen` accept multiple threads. Pass `--yes` for bulk operations in non-interactive or JSON mode. A closing `--message` is supported only when resolving one thread. Bulk operations continue after an individual failure and return a nonzero exit status if any operation fails.

## Edit or delete messages

Inspect a thread to find its message IDs before editing or deleting a message.

```bash
vercel comments edit <thread> <message-id> -m 'Updated wording'
vercel comments delete <thread> <message-id> --yes
```

Editing message content preserves its attachments. Deleting a message cannot be undone and requires `--yes` in non-interactive or JSON mode.

## Use JSON output

Both `--json` and `--format json` produce JSON with every subcommand except `open`. JSON mode never prompts for missing input or confirmation.

```bash
vercel comments --json | jq '.threads[].id'
vercel comments inspect <thread> --format json
```

Use `vercel comments open <thread>` to open a thread on `vercel.com`; this subcommand does not support JSON output.
