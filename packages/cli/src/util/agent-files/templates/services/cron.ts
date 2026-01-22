export function renderCronSection(): string {
  return `## Vercel Cron Jobs

Schedule tasks using Vercel Cron in \`vercel.json\`:

\`\`\`json
{
  "crons": [
    {
      "path": "/api/cron/daily-cleanup",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/hourly-sync",
      "schedule": "0 * * * *"
    }
  ]
}
\`\`\`

### Securing Cron Endpoints

Always verify the \`CRON_SECRET\` to prevent unauthorized access:

\`\`\`typescript
// api/cron/daily-cleanup.ts
export default async function handler(req, res) {
  if (req.headers.authorization !== \`Bearer \${process.env.CRON_SECRET}\`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Your cron job logic
  await performCleanup();
  
  res.status(200).json({ success: true });
}
\`\`\`

### Cron Schedule Syntax
- \`* * * * *\` - Every minute
- \`0 * * * *\` - Every hour
- \`0 0 * * *\` - Daily at midnight
- \`0 0 * * 0\` - Weekly on Sunday
- \`0 0 1 * *\` - Monthly on the 1st

Use https://crontab.guru to build schedule expressions.

### Execution Limits
- **Hobby**: 60 seconds max duration
- **Pro**: 300 seconds max duration
- **Enterprise**: 900 seconds max duration

`;
}
