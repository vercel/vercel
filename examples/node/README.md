This example shows how to deploy a standalone Node.js HTTP server with Vercel's generic `node` framework preset.

The entrypoint is `src/server.ts` and the server handles:

- `GET /`
- `GET /health`
- `GET /user/:id`

To develop locally:

```bash
npm install
vc dev
```

Then open `http://localhost:3000`.

To build locally:

```bash
npm install
vc build
```

To deploy:

```bash
npm install
vc deploy
```
