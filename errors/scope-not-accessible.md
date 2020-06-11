# Scope Not Accessible

#### Why This Error Occurred

You specified the `--scope` flag and specified the ID or slug of a team that you're not a part of or a user whose account you don't own. This problem could also occur if your user credentials aren't valid anymore.

#### Possible Ways to Fix It

- Make sure commands like `vercel ls` work just fine. This will ensure that your user credentials are valid. If it's not working correctly, please log in again using `vercel login`.
- Ensure that the scope you specified using `--scope` shows up in the output of `vercel switch`. If it doesn't, you're either not part of the team (if you specified a team) or you logged into the wrong user account.
