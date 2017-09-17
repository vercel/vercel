# Team Not Accessible

#### Why This Error Occurred

You specified the `--team` flag and specified the slug of a team that you're not a part of. This problem could also occur if your user credentials aren't valid anymore.

#### Possible Ways to Fix It

- Make sure commands like `now ls` work just fine. This will ensure that your user credentials are valid. If it's not working correctly, please log in again using `now login`.
- Ensure that the team you specified using `--team` shows up in the output of `now switch`. If it doesn't, you're not part of it. In that case, please ask an owner of the team to invite you.
