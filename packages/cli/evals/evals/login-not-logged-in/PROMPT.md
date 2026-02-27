Exercise the Vercel CLI behavior when **not logged in**, and then attempt to log in.

1. Start from a shell where the Vercel CLI has **no existing credentials**:
   - Run `vercel logout --yes` (or `vc logout --yes`) to clear any saved credentials.
2. Simulate a completely logged-out environment and verify the error:
   - Run `env -u VERCEL_TOKEN vercel whoami` (or `env -u VERCEL_TOKEN vc whoami`) _without_ `--token`.
   - Capture the error about missing credentials.
3. Attempt to log in:
   - Run `vercel login` (or `vc login`) and follow the login flow.
   - After the login attempt, run `vercel whoami` (or `vc whoami`) again in a normal shell.
4. Write a short log of what happened to `login-eval-log.txt`:
   - Include the line (or lines) from the **logged-out whoami** call that mention missing credentials.
   - Include at least one line showing that you ran `vercel login` (or `vc login`) and one line from the **after-login whoami** output.

When you are done, `login-eval-log.txt` should contain text that clearly shows:

- A failed `whoami` due to **no existing credentials**, and
- That you **attempted to log in** with `vercel login` (or `vc login`), followed by a `whoami` after that attempt.
