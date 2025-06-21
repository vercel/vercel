import { client } from './client';

export function useMicrofrontends() {
  const config = {
    $schema: 'https://openapi.vercel.sh/microfrontends.json',
    applications: {
      'app-1': {
        development: {
          local: 3000,
          fallback: 'app-1.vercel.app',
        },
      },
      'app-2': {
        development: {
          local: 3001,
        },
        routing: [
          {
            group: 'group-1',
            paths: ['/app-2', '/app-2/:path*'],
          },
        ],
      },
    },
  };

  client.scenario.get('/v1/microfrontends/:dpl/config', (req, res) => {
    const { dpl } = req.params;

    if (dpl === 'dpl_non_existent') {
      res.status(404).json({
        message: 'Deployment not found',
        code: 'deployment_not_found',
      });
      return;
    }

    res.json({
      config,
    });
  });

  return config;
}
