import { createClient } from 'contentful-management';
import Client from '../../util/client';
import open from 'open';
import fetch from 'node-fetch';
import { Output } from '../../util/output';

export type IntegrationMapItem = {
  variables: string[];
  supportedFrameworks: string[];
  frameworkSpecificCode: {
    [key: string]: {
      content: string;
      path: string;
    }[];
  };
  code: {
    content: string;
    path: string;
  }[];
  packages: string[];
  setup: (
    client: Client,
    output: Output
  ) => Promise<
    | {
        key: string;
        value: string;
      }[]
    | 1
  >;
};

const integrationMap = new Map<string, IntegrationMapItem>([
  [
    'contentful',
    {
      variables: [
        'CONTENTFUL_ACCESS_TOKEN',
        'CONTENTFUL_PREVIEW_ACCESS_TOKEN',
        'CONTENTFUL_SPACE_ID',
      ],
      supportedFrameworks: ['nextjs'],
      frameworkSpecificCode: {
        nextjs: [
          {
            path: './api/draft/route.ts',
            content: `export { enableDraftHandler as GET } from "@contentful/vercel-nextjs-toolkit/app-router"`,
          },
          {
            path: './api/disable-draft/route.ts',
            content: `
            import { draftMode } from 'next/headers'
   
            export async function GET() {
            draftMode().disable()
            return new Response('Draft mode is disabled')
          }
            `,
          },
        ],
      },
      code: [
        {
          path: './lib/contentful.ts',
          content: `
          import { createClient } from 'contentful-management';

          const accessToken = process.env.CONTENTFUL_ACCESS_TOKEN;

          if (!accessToken) {
            throw new Error('CONTENTFUL_ACCESS_TOKEN is not set');
          }

          export const client = createClient({
            accessToken
          });
        `,
        },
      ],

      packages: [
        'contentful-management',
        '@contentful/vercel-nextjs-toolkit',
        'next',
      ],
      setup: async (client: Client, output: Output) => {
        // Constants for the OAuth configuration
        const APP_ID = '3kEj9zHcCLfuFwHOoYv-3WDlyHRYpenuDyl0sqFFg2w';
        const REDIRECT_URI =
          'https://www.contentful.com/developers/cli-oauth-page/';
        const BASE_URL = 'https://be.contentful.com';

        let token;
        try {
          const contentfulAuthUrl = `${BASE_URL}/oauth/authorize?response_type=token&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(
            REDIRECT_URI
          )}&scope=content_management_manage`;

          // Open the default browser to initiate OAuth login
          await open(contentfulAuthUrl);
          output.log('Please complete the login in your browser.');

          // Prompt the user to enter the token received after login
          const tokenInput = await client.input.text({
            message: 'Paste the access token here:',
          });

          if (!tokenInput) {
            throw new Error('No token provided.');
          }

          token = tokenInput;
        } catch (error) {
          output.error(`Failed to login to Contentful: ${error}`);
          return 1;
        }

        let deliveryApiKey: string = '';
        let previewApiKey: string = '';
        let spaceId: string = '';

        if (token) {
          const contentfulClient = createClient({
            accessToken: token,
          });

          const spaces = await contentfulClient.getSpaces();

          const spaceChoices =
            spaces.items.map(space => ({
              name: space.name,
              value: space.sys.id,
            })) || [];

          spaceId = await client.input.select({
            message: 'Select the Contentful space to use',
            choices: spaceChoices,
          });

          if (!spaceId) {
            output.error('Failed to retrieve Contentful space');
            return 1;
          }

          const environmentsForSpace = await spaces.items
            .find(space => space.sys.id === spaceId)
            ?.getEnvironments();

          const environmentChoices = environmentsForSpace?.items.map(
            environment => ({
              name: environment.name,
              value: environment.sys.id,
            })
          );

          let selectedEnvironment;

          if (!environmentChoices) {
            selectedEnvironment = 'master';
          } else {
            selectedEnvironment = await client.input.select({
              message: 'Select the Contentful environment to use',
              choices: environmentChoices,
            });
          }

          const currentApiKeys = await contentfulClient
            .getSpace(spaceId)
            .then(space => space.getApiKeys());

          const existingDeliveryApiKey = currentApiKeys.items.find(
            apiKey => apiKey.name === 'Vercel CLI Delivery API Key'
          );

          if (existingDeliveryApiKey) {
            deliveryApiKey = existingDeliveryApiKey.accessToken;
            const previewApiKeyResponse = await fetch(
              'https://api.contentful.com/spaces/' +
                spaceId +
                '/preview_api_keys/' +
                existingDeliveryApiKey.preview_api_key.sys.id,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            const previewApiKeyData = await previewApiKeyResponse.json();

            previewApiKey = previewApiKeyData.accessToken;
          } else {
            const response = await contentfulClient
              .getSpace(spaceId)
              .then(space =>
                space.createApiKey({
                  name: 'Vercel CLI Delivery API Key',
                  description: 'Created by the Vercel CLI. ',
                  environments: [
                    {
                      sys: {
                        type: 'Link',
                        linkType: 'Environment',
                        id: selectedEnvironment,
                      },
                    },
                  ],
                })
              );

            deliveryApiKey = response.accessToken;
            const previewApiKeyId = response.preview_api_key.sys.id;

            const previewApiKeyResponse = await fetch(
              'https://api.contentful.com/spaces/' +
                spaceId +
                '/preview_api_keys/' +
                previewApiKeyId,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            const previewApiKeyData = await previewApiKeyResponse.json();

            previewApiKey = previewApiKeyData.accessToken;
          }
        }

        if (!deliveryApiKey || !previewApiKey || !spaceId) {
          output.error('Failed to retrieve Contentful Delivery API Key');
          return 1;
        }

        return [
          {
            key: 'CONTENTFUL_ACCESS_TOKEN',
            value: deliveryApiKey,
          },
          {
            key: 'CONTENTFUL_PREVIEW_ACCESS_TOKEN',
            value: previewApiKey,
          },
          {
            key: 'CONTENTFUL_SPACE_ID',
            value: spaceId,
          },
        ];
      },
    },
  ],
]);

export default integrationMap;
