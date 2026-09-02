Vendored from [path-to-regexp@6.1.0](https://github.com/pillarjs/path-to-regexp/tree/v6.1.0).

Upgrading to 6.3.0 (the GHSA-9wv6-86v2-598j patch) changes compiled
route regular expressions for existing customer configs. Monitoring of
that upgrade showed it is not safe to ship (PIPE-2699).

The implementation is vendored so published packages no longer depend on
the flagged npm version, while route compilation behavior stays the same.
