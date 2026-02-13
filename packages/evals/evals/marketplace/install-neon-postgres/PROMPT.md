Install the Neon Postgres integration using the Vercel CLI and create a database resource named "my-test-db". Link the resource to the current project for the development environment. Use the free tier if plan options are presented.

The Vercel CLI is already installed globally and authenticated. The project is already linked via `.vercel/project.json`. You can verify with `vercel whoami`.

To install the integration and create a resource in one step, use:

```
vercel integration add neon --name my-test-db
```

If the CLI asks to do something that you cannot do on your own (eg opening a browser or selecting an option from interactive shell), you can exit with a failure message.
