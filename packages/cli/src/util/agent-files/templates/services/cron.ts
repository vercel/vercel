export function renderCronSection(): string {
  return `## Cron Jobs

**vercel.json:**
\`\`\`json
{ "crons": [{ "path": "/api/cron", "schedule": "0 0 * * *" }] }
\`\`\`

**Secure endpoint:** Check \`Authorization: Bearer \${CRON_SECRET}\`

**Limits:** Hobby 60s, Pro 300s, Enterprise 900s

`;
}
