# Missing Env Key and Value

#### Why This Error Occurred

You specified the `--env` or `-e` flag and didn't add a name and value for the environment variable.

#### Possible Ways to Fix It

Make sure to set the name and value of the variable like this:

```bash
vercel -e VARIABLE_NAME="VALUE"
```

You can also specify a environment variable that contains a secret:

```bash
vercel -e VARIABLE_NAME=@secret-name
```
