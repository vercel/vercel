# Missing Environment Variables While Developing

#### Why This Error Occurred

You ran `vercel dev` inside a project that contains a `vercel.json` file with `env` or `build.env` properties that use [Vercel Secrets](https://vercel.com/docs/v2/build-step#environment-variables).

In order to use environment variables in your project locally that have values defined using the Vercel Secrets format (e.g. `@my-secret-value`), you will need to provide the value as an environment variable using a `.env`.

We require this to ensure your app works as you intend it to, in the development environment, and to provide you with a way to mirror or separate private environment variables within your applications, for example when connecting to a database.

Read below for how to address this error.

#### Possible Ways to Fix It

The error message will list environment variables that are required and which file they are required to be included in `.env`.

If the file does not exist yet, please create the file that the error message mentions and insert the missing environment variable into it.

For example, if the error message shows that the environment variable `TEST` is missing from `.env`, then the `.env` file should look like this:

```
TEST=value
```

In the above example, `TEST` represents the name of the environment variable and `value` its value.

For more information on Environment Variables in development, [see the documentation](https://vercel.com/docs/v2/build-step#environment-variables).
