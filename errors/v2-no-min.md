# No minimum scale settings on Cloud v2 deployments

#### Why This Error Occurred

An attempt was made at scaling a Cloud v2 deployment with a `min` scale
setting. This isn't supported yet.

#### Possible Ways to Fix It

Ensure your scale settings (in `vercel.json`, the command you're running
or from a previous deployment who's alias you're trying to overwrite) has
the `min` scale setting set to `0`. You can do this by running

```
now scale <deployment> 0 10
```
