# vercel dev

Start the local development server.

## Synopsis

```bash
vercel dev [dir] [options]
vercel develop [dir] [options]
```

## Description

The `dev` command starts a local development server that emulates the Vercel platform, including:

- Serverless functions
- Edge functions
- Routing rules
- Environment variables
- Redirects and rewrites

## Aliases

- `develop`

## Arguments

| Argument | Required | Description                                    |
| -------- | -------- | ---------------------------------------------- |
| `dir`    | No       | Project directory (default: current directory) |

## Options

| Option     | Shorthand | Type    | Description                                         |
| ---------- | --------- | ------- | --------------------------------------------------- |
| `--listen` | `-l`      | String  | URI endpoint to listen on (default: `0.0.0.0:3000`) |
| `--yes`    | `-y`      | Boolean | Skip prompts                                        |

## Examples

### Start Development Server

```bash
vercel dev
```

Starts server at `http://localhost:3000`.

### Custom Port

```bash
vercel dev --listen 8080
vercel dev -l 8080
```

### Bind to Specific Address

```bash
# Listen on localhost only
vercel dev --listen 127.0.0.1:5000

# Listen on all interfaces
vercel dev --listen 0.0.0.0:3000
```

### Different Directory

```bash
vercel dev ./my-project
```

### Skip Prompts

```bash
vercel dev --yes
```

---

## Development Server Features

### Serverless Functions

Functions in `/api` are served automatically:

```
project/
├── api/
│   ├── hello.js        → /api/hello
│   └── users/
│       └── [id].js     → /api/users/:id
└── package.json
```

### Edge Functions

Edge functions are also supported:

```javascript
// api/edge.js
export const config = {
  runtime: 'edge',
};

export default function handler(request) {
  return new Response('Hello from the Edge!');
}
```

### Environment Variables

Development variables are loaded from:

1. `.env.local`
2. `.env.development.local`
3. `.env.development`
4. `.env`
5. Vercel project (if linked)

```bash
# Pull Vercel env vars first
vercel env pull
vercel dev
```

### Routing

`vercel.json` routes are respected:

```json
{
  "rewrites": [{ "source": "/api/:path*", "destination": "/api/:path*" }],
  "redirects": [{ "source": "/old", "destination": "/new", "permanent": true }]
}
```

---

## Framework Integration

The dev server integrates with your framework's dev server:

| Framework | Dev Command           | Integration |
| --------- | --------------------- | ----------- |
| Next.js   | `next dev`            | Automatic   |
| Nuxt      | `nuxt dev`            | Automatic   |
| SvelteKit | `vite dev`            | Automatic   |
| Vue CLI   | `vue serve`           | Automatic   |
| CRA       | `react-scripts start` | Automatic   |

### Custom Dev Command

Configure in `package.json`:

```json
{
  "scripts": {
    "dev": "next dev"
  }
}
```

Or in `vercel.json`:

```json
{
  "devCommand": "npm run custom-dev"
}
```

---

## Debugging Functions

### View Function Logs

Logs appear in the terminal where `vercel dev` is running:

```bash
vercel dev
# Function logs appear here
```

### Debug Mode

```bash
vercel dev --debug
```

Shows detailed information about:

- Route matching
- Function invocation
- Environment loading

---

## Hot Reloading

Functions are automatically reloaded when files change:

```javascript
// api/hello.js - changes are picked up automatically
export default function handler(req, res) {
  res.json({ message: 'Updated!' });
}
```

---

## Common Issues

### Port Already in Use

```bash
# Use different port
vercel dev --listen 3001

# Or kill existing process
lsof -i :3000
kill -9 <PID>
```

### Environment Variables Not Loading

```bash
# Pull from Vercel
vercel env pull

# Or check .env.local exists
cat .env.local
```

### Functions Not Found

Ensure functions are in the `/api` directory:

```bash
mkdir -p api
echo 'export default (req, res) => res.json({ok:true})' > api/health.js
vercel dev
# Test: curl http://localhost:3000/api/health
```

---

## See Also

- [env](env.md) - Manage environment variables
- [build](build.md) - Build locally
- [deploy](deploy.md) - Deploy to Vercel
