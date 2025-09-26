---
"@vercel/firewall": minor
---

Add support for rate limiting headers in checkRateLimit response

The checkRateLimit function now returns an optional rateLimitHeaders object containing rate limiting information from the firewall API response, including:
- limit: The rate limit threshold (maximum requests allowed)
- remaining: Number of requests remaining in the current window
- reset: Unix timestamp when the rate limit will reset
- retryAfter: Number of seconds until the rate limit resets

This enhancement supports both standard headers (ratelimit-*) and x-prefixed headers (x-ratelimit-*), providing better visibility into rate limiting status while maintaining full backwards compatibility.
