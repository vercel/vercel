A user wants to understand what categories of integrations Vercel offers across the Marketplace. Use the Vercel CLI to enumerate the available integration categories.

Write the list of category slugs (one per line) to a file called `categories-found.txt`. Use the slug format (e.g., "storage", "ai", "code-review") — not the display titles.

Important context:

- You are already authenticated with Vercel CLI via the VERCEL_TOKEN environment variable. Do NOT run `vercel login` - it is not needed.
- The project is already linked to a Vercel project (check `.vercel/project.json`).
- This is a discovery task — just enumerate the categories, do not install anything.
- Use only the CLI; do not consult external documentation or web sources.

If the CLI asks to do something that you cannot do on your own (eg opening a browser or selecting an option from interactive shell), you can exit with a failure message.
