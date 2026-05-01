const TYPE_EMOJI = {
  ci_failure: ':x:',
  mention: ':at:',
  pr_comment: ':speech_balloon:',
  review_request: ':eyes:',
  debug: ':grey_question:',
};

/**
 * Slack Incoming Webhook notifier. No deps; just a POST.
 */
export function createSlackNotifier({ webhookUrl }) {
  if (!webhookUrl) return null;
  return {
    async notify(alert) {
      const emoji = TYPE_EMOJI[alert.type] || ':bell:';
      const text = alert.url
        ? `${emoji} *<${alert.url}|${escapeMarkdown(alert.title)}>*`
        : `${emoji} *${escapeMarkdown(alert.title)}*`;

      const blocks = [
        {
          type: 'section',
          text: { type: 'mrkdwn', text },
        },
      ];
      if (alert.body) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '```' + truncate(alert.body, 2500) + '```',
          },
        });
      }
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${alert.repo || ''} · ${alert.type} · ${new Date(
              alert.createdAt || Date.now()
            ).toISOString()}`,
          },
        ],
      });

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: alert.title, blocks }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Slack webhook failed: ${res.status} ${res.statusText} ${body}`);
      }
    },
  };
}

function escapeMarkdown(s) {
  return String(s || '').replace(/([*_`])/g, '\\$1');
}

function truncate(s, max) {
  const str = String(s);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
