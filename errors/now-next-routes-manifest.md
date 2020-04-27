# Routes Manifest Could Not Be Found

#### Why This Error Occurred

This could be caused by a failure during the build or an incorrect output directory being configured for your Next.js project.

#### Possible Ways to Fix It

Check for any build errors in the logs and ensure that the output directory setting is either not changed or is pointing to the location of the `.next` output folder (`distDir`).

If you are running `next export` you should **not** need to customize the output directory to `out` since the builder automatically detects `next export` being run and uses the output from it.
