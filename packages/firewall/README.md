# @vercel/firewall

## Programmatic rate limits

```ts
import { checkRateLimit } from '@vercel/firewall';

async function handler() {
  const { rateLimited } = await checkRateLimit('my-rate-limit-id');
}
```

<p align="center">
  <a href="https://vercel.com">
    <img src="https://assets.vercel.com/image/upload/v1588805858/repositories/vercel/logo.png" height="96">
    <h3 align="center">Vercel</h3>
  </a>
  <p align="center">Develop. Preview. Ship.</p>
</p>
