---
'vercel': major
---

The `vercel login` command has been overhauled, see below for how to use the new flow.

## Breaking changes

The following are now obsolete:

- Passing the `email` argument or `--github`, `--gitlab`, `--bitbucket` flags. Run the command without any options:

```diff
- $ vercel login your@email.com
- $ vercel login --github
- $ vercel login --gitlab
- $ vercel login --bitbucket
+ $ vercel login
```

Choose your preferred authentication method in the browser instead.

- Passing the `teamId`/`teamSlug` argument. Run the command without any options:

```diff
- $ vercel login team
+ $ vercel login
```

After signing in with any of the non-SAML methods, you will be prompted to authorize individual teams.

- `--oob`: Visit [vercel.com/device](https://vercel.com/device) on any browser-capable device and enter the code shown in the terminal. This flag is now obsolete.

> [!TIP]
> Hit <kbd>Enter</kbd> to open the link automatically, if you are signing in from a browser-capable device.

> [!IMPORTANT]
> Read the instructions carefully to match your location, IP, and request time when approving the device, as you will be granting access to your Vercel account.

## Resources

- [`vercel login` Documentation](https://vercel.com/docs/cli/login)
- `vercel login --help`

**Good to know:** The new login experience is built on top of the [OAuth 2.0 Device Flow](https://datatracker.ietf.org/doc/html/rfc8628) specification.
