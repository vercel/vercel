# Verification Timeout

#### Why This Error Occurred

After the deployment build completed and the deployment state was set to `READY`,
instances failed to initialize properly.

The CLI attempted to verify that the scale settings of your instances matched,
but it couldn't do so within the allotted time (defaults to 2 minutes).

#### Possible Ways to Fix It

Instance verification is the process of ensuring that after
your deployment is ready, we can actually run (instantiate) your code.

If you configured [regions or scale](https://vercel.com/docs/features/scaling),
we ensure the minimums and maximums are met for the regions you enabled.

If you think your code is taking too long to instantiate, this can be due
to slow boot up times. You can supply `--no-verify` to skip verification
if you are confident your code runs properly.

If your application is not listening on a HTTP port, we might be failing to
instantiate your deployment as well. It might not be showing any errors,
but the deployment instance is effectively not routable and cannot be
verified.

If your instances are crashing before an HTTP port is exposed, verification
will fail as well. Double check your logs (e.g.: by running `vercel logs <url>`)
