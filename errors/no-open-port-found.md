# No Open Port Found

#### Why This Error Occurred

Your application code exited or timed out before binding to a port number.

#### Possible Ways to Fix It

- For Node.js deployments, a call to [`Server#listen()`](https://nodejs.org/dist/latest/docs/api/http.html#http_server_listen) might be missing.
- For Docker deployments, there might be a mismatch from what the `EXPOSE` directive specifies compared to what your application binds to.
