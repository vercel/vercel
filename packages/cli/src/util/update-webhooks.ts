import { VercelConfig } from '@vercel/client';
import debug from 'debug';
import Client from './client';
import { emoji, prependEmoji } from './emoji';
import readJSONFile from './read-json-file';

type Webhook = {
  id: string;
  url: string;
  events: string[];
  teamId?: string | null;
  userId: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  projectIds?: string[];
  createdFrom: string;
  secret?: string;
};

export async function updateWebhooks(
  client: Client,
  deployment: { projectId: string; url: string; alias: string[] },
  currentTeam?: string
) {
  const { output } = client;
  const config = (await readJSONFile<VercelConfig>(
    './vercel.json'
  )) as VercelConfig;
  const functionsKeys = Object.keys(config.functions ?? {});
  functionsKeys.forEach(async key => {
    const currentFunction = config.functions?.[key];
    if ((currentFunction?.events?.length ?? 0) > 0) {
      debug(`Events found for function ${key}`);

      const webhookUrl = `https://${deployment.alias[0] ?? deployment.url}/${
        key.split('pages/')[1].split('.')[0]
      }`;
      debug(`Webhook URL: ${webhookUrl}`);

      try {
        const webhooks = await client.fetch<Webhook[]>(
          `/v1/webhooks?projectId=${deployment.projectId}`,
          {
            accountId: currentTeam,
          }
        );

        if (webhooks.length > 0) {
          debug(
            `Deleting existing webhook ${
              webhooks[0].url
            } with events [${webhooks[0].events.join(', ')}}]`
          );

          await client.fetch(`/v1/webhooks/${webhooks[0].id}`, {
            method: 'DELETE',
            accountId: currentTeam,
          });
        }

        const newWebhook = await client.fetch<Webhook>('/v1/webhooks', {
          method: 'POST',
          accountId: currentTeam,
          body: {
            url: webhookUrl,
            projectIds: [deployment.projectId],
            events: currentFunction?.events ?? [],
          },
        });

        output.success(
          prependEmoji(
            `Webhook ${newWebhook.url} created with secret ${newWebhook.secret}`,
            emoji('webhook')
          ) + `\n`
        );
      } catch (e) {
        output.warn(
          `Unable to create webhook for ${key}. ${(e as any).serverMessage}`
        );
      }
    }
  });
}
