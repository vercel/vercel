# No Token Allowed

#### Why This Error Occurred

You tried to run a command that doesn't allow the `--token` flag (like `now switch`). This is not allowed because commands like these are influencing the configuration files.

In turn, they would have to take the value of the `--token` flag into consideration (which is not a good idea, because flags in Now CLI should never change the configuration).

#### Possible Ways to Fix It

Specify a value for the `--team` flag. This needs to be the slug of the team as which you'd like to act. As an example, if your team URL is `https://zeit.co/teams/zeit`, the slug is `zeit`.
