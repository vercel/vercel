Create a preview deployment for this fixture and fetch request logs using the Vercel CLI.

1. Deploy this directory with `vercel deploy` or `vc deploy` in non-interactive mode.
2. Save the deployment URL or id to `logs-deployment-url.txt`.
3. Use `vercel logs` or `vc logs` for that deployment or linked project. Use a bounded command, such as `--no-follow`, `--limit`, `--since`, or `--json`, so it does not stream forever.
4. Save the logs command output to `logs-output.txt`. If there are no logs yet, save the CLI output that shows the bounded logs command completed instead of leaving the file empty.
5. Save a short final note to `logs-summary.txt` describing whether logs were returned or no logs were available yet.

The project is already linked. Use non-interactive flags such as `--yes` where needed.
