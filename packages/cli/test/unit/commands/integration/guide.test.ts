import { beforeEach, describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

const singleProductIntegration = {
  id: 'oac_test123',
  slug: 'neon',
  name: 'Neon',
  products: [
    {
      id: 'iap_test1',
      slug: 'neon',
      name: 'Neon',
      shortDescription: 'Serverless Postgres',
      metadataSchema: {
        type: 'object',
        properties: {},
      },
      guides: [
        {
          framework: 'nextjs',
          title: 'Next.js',
          steps: [
            {
              title: 'Install the driver',
              content:
                'Run `npm install @neondatabase/serverless` to install the driver.',
            },
            {
              title: 'Create a connection',
              content:
                'Use the following code:\n\n```javascript\nimport { neon } from "@neondatabase/serverless";\nconst sql = neon(process.env.DATABASE_URL);\n```',
            },
          ],
        },
      ],
      snippets: [
        {
          name: 'Neon serverless driver',
          language: 'javascript',
          content:
            'import { neon } from "@neondatabase/serverless";\nconst sql = neon(process.env.DATABASE_URL);',
        },
      ],
      resourceLinks: [
        {
          title: 'Neon Docs',
          href: 'https://neon.tech/docs/introduction',
        },
      ],
    },
  ],
};

const multiGuideIntegration = {
  id: 'oac_test789',
  slug: 'supabase',
  name: 'Supabase',
  products: [
    {
      id: 'iap_test4',
      slug: 'supabase',
      name: 'Supabase',
      shortDescription: 'Open source Firebase alternative',
      metadataSchema: {
        type: 'object',
        properties: {},
      },
      guides: [
        {
          framework: 'nextjs',
          title: 'Next.js',
          steps: [
            {
              title: 'Install Supabase',
              content: 'Run `npm install @supabase/supabase-js`',
            },
          ],
        },
        {
          framework: 'remix',
          title: 'Remix',
          steps: [
            {
              title: 'Install Supabase for Remix',
              content: 'Run `npm install @supabase/supabase-js`',
            },
          ],
        },
      ],
      snippets: [],
      resourceLinks: [],
    },
  ],
};

const multiProductIntegration = {
  id: 'oac_test456',
  slug: 'aws',
  name: 'AWS',
  products: [
    {
      id: 'iap_test2',
      slug: 'aws-dynamodb',
      name: 'Amazon DynamoDB',
      shortDescription: 'Serverless distributed NoSQL',
      metadataSchema: {
        type: 'object',
        properties: {},
      },
      guides: [
        {
          framework: 'nextjs',
          title: 'Next.js',
          steps: [
            {
              title: 'Install dependencies',
              content:
                'Run:\n```bash\nnpm install @aws-sdk/client-dynamodb\n```',
            },
          ],
        },
      ],
      snippets: [
        {
          name: 'DynamoDB SDK',
          language: 'typescript',
          content: 'import { DynamoDBClient } from "@aws-sdk/client-dynamodb";',
        },
      ],
      resourceLinks: [],
    },
    {
      id: 'iap_test3',
      slug: 'aws-dsql',
      name: 'Amazon Aurora DSQL',
      shortDescription: 'Serverless PostgreSQL',
      metadataSchema: {
        type: 'object',
        properties: {},
      },
      guides: [],
      snippets: [],
      resourceLinks: [],
    },
  ],
};

describe('integration', () => {
  describe('guide', () => {
    beforeEach(() => {
      useUser();
    });

    describe('--help', () => {
      it('tracks telemetry', async () => {
        client.setArgv('integration', 'guide', '--help');
        const exitCode = await integrationCommand(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'flag:help',
            value: 'integration:guide',
          },
        ]);
      });
    });

    describe('errors', () => {
      it('should error when no argument passed', async () => {
        client.setArgv('integration', 'guide');
        const exitCode = await integrationCommand(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: You must specify an integration.'
        );
      });

      it('should error when integration fetch fails', async () => {
        client.scenario.get(
          '/v2/integrations/integration/nonexistent',
          (_req, res) => {
            res.status(404).json({ error: { message: 'Not found' } });
          }
        );

        client.setArgv('integration', 'guide', 'nonexistent');
        const exitCode = await integrationCommand(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: Failed to fetch integration "nonexistent"'
        );
      });

      it('should error when product slug not found in multi-product integration', async () => {
        client.scenario.get('/v2/integrations/integration/aws', (_req, res) => {
          res.json(multiProductIntegration);
        });

        client.setArgv('integration', 'guide', 'aws/nonexistent-product');
        const exitCode = await integrationCommand(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: Product "nonexistent-product" not found'
        );
      });
    });

    describe('single-product integration', () => {
      beforeEach(() => {
        client.scenario.get(
          '/v2/integrations/integration/neon',
          (_req, res) => {
            res.json(singleProductIntegration);
          }
        );
      });

      it('should display guide for single-product integration', async () => {
        client.setArgv('integration', 'guide', 'neon');
        const exitCode = await integrationCommand(client);
        expect(exitCode).toEqual(0);
        await expect(client.stdout).toOutput('# Neon');
      });

      it('tracks telemetry with known integration slug', async () => {
        client.setArgv('integration', 'guide', 'neon');
        await integrationCommand(client);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:guide',
            value: 'guide',
          },
          {
            key: 'argument:integration',
            value: 'neon',
          },
        ]);
      });
    });

    describe('multi-product integration', () => {
      beforeEach(() => {
        client.scenario.get('/v2/integrations/integration/aws', (_req, res) => {
          res.json(multiProductIntegration);
        });
      });

      it('should display guide when product slug is specified', async () => {
        client.setArgv('integration', 'guide', 'aws/aws-dynamodb');
        const exitCode = await integrationCommand(client);
        expect(exitCode).toEqual(0);
        await expect(client.stdout).toOutput('# Amazon DynamoDB');
      });

      it('should prompt for product selection in TTY mode', async () => {
        client.setArgv('integration', 'guide', 'aws');
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('has multiple products');

        // Select the first option (DynamoDB)
        client.stdin.write('\n');

        const exitCode = await exitCodePromise;
        expect(exitCode).toEqual(0);
      });

      it('should error in non-TTY mode without product slug', async () => {
        (client.stdin as any).isTTY = false;
        client.setArgv('integration', 'guide', 'aws');
        const exitCode = await integrationCommand(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          'has multiple products. Specify one with'
        );
      });
    });

    describe('--framework flag', () => {
      beforeEach(() => {
        client.scenario.get(
          '/v2/integrations/integration/supabase',
          (_req, res) => {
            res.json(multiGuideIntegration);
          }
        );
      });

      it('should select the specified framework guide', async () => {
        client.setArgv(
          'integration',
          'guide',
          'supabase',
          '--framework',
          'remix'
        );
        const exitCode = await integrationCommand(client);
        expect(exitCode).toEqual(0);
        await expect(client.stdout).toOutput('Install Supabase for Remix');
      });

      it('should error when framework is not found', async () => {
        client.setArgv(
          'integration',
          'guide',
          'supabase',
          '--framework',
          'angular'
        );
        const exitCode = await integrationCommand(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: Framework "angular" not found'
        );
      });

      it('tracks --framework telemetry', async () => {
        client.setArgv(
          'integration',
          'guide',
          'supabase',
          '--framework',
          'nextjs'
        );
        await integrationCommand(client);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:guide',
            value: 'guide',
          },
          {
            key: 'option:framework',
            value: '[REDACTED]',
          },
          {
            key: 'argument:integration',
            value: 'supabase',
          },
        ]);
      });
    });
  });
});
