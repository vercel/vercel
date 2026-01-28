export function renderCronSection(): string {
  return `## Cron Jobs
\`\`\`json
// vercel.json
{ "crons": [{ "path": "/api/cron", "schedule": "0 0 * * *" }] }
\`\`\`
Secure with \`Authorization: Bearer \${CRON_SECRET}\`. Limits: 60s/300s/900s (Hobby/Pro/Enterprise).

`;
}
