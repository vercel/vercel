# Missing Environment Variables While Developing

#### Why This Error Occurred

You ran `now dev` inside a project that contains a `now.json` file with `env` or `build.env` properties that use [Now Secrets](https://zeit.co/docs/v2/deployments/environment-variables-and-secrets).

#### Possible Ways to Fix It

The error message will mention a list of environment variables and a file name (either `.env` or `.env.build`).

If it does not exist yet, please create the file that the error message mentions and insert the missing environment variable into it.

For example, if the error message shows that the environment variable `TEST` is missing from `.env`, then the `.env` file should look like this:

```
TEST=value
```

In the above example, `TEST` represents the name of the environment variable and `value` its value.
