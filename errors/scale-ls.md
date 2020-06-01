# `vercel scale ls` is deprecated

#### Why This Error Occurred

We have stopped supporting this command, in favor of
better alternatives.

`vercel scale ls` used to list all the scaling rules
for all your deployments. The output would be too long,
and it would often be hard to find the information
you needed in a long list of items.

#### Possible Ways to Fix It

Instead of using `vercel scale ls` to list all your deployments
and their scaling rules, first use `vercel ls` to find
your deployment:

```console
vercel ls
```

Then, select the URL of your deployment, which uniquely identifies it, and run:

```console
vercel inspect my-deployment-12345.now.sh
```

The `inspect` subcommand will give you your deployment's scale information, including what datacenters it's enabled on, the
current number of instances and minimums/maximums.
