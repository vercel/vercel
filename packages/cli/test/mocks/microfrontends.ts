import { client } from './client';

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

export function useMicrofrontendsNotEnabled() {
  client.scenario.get(
    '/v1/microfrontends/projects/:projectIdOrName/production-mfe-config',
    (req, res) => {
      res.status(404).json({
        message: 'Project is not part of a microfrontends group',
        code: 'microfrontends_not_enabled',
      });
    }
  );
}

export function useMicrofrontendsForProject() {
  client.scenario.get(
    '/v1/microfrontends/projects/:projectIdOrName/production-mfe-config',
    (req, res) => {
      res.json({
        config,
      });
    }
  );
}

export function useMicrofrontendsDeploymentNotFound() {
  client.scenario.get('/v1/microfrontends/:dpl/config', (req, res) => {
    res.status(404).json({
      message: 'Deployment not found',
      code: 'deployment_not_found',
    });
  });
}

export function useMicrofrontendsForDeployment() {
  client.scenario.get('/v1/microfrontends/:dpl/config', (req, res) => {
    res.json({
      config: {
        $schema: 'https://openapi.vercel.sh/microfrontends.json',
        applications: {
          'app-1': {
            development: {
              local: 3000,
              fallback: 'app-1.vercel.app',
            },
          },
        },
      },
    });
  });

  return config;
}
