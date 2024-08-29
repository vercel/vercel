import { Integration } from '../../src/commands/integration/add';
import { client } from './client';

const integrations: Record<string, Integration> = {
  acme: {
    id: 'acme',
    name: 'Acme Integration',
    slug: 'acme',
    products: [
      {
        id: 'acme-product',
        name: 'Acme Product',
        slug: 'acme',
        type: 'storage',
        shortDescription: 'The Acme product',
      },
    ],
  },
  'acme-external': {
    id: 'acme-external',
    name: 'Acme Integration External',
    slug: 'acme-external',
  },
  'acme-no-products': {
    id: 'acme-no-products',
    name: 'Acme Integration No Products',
    slug: 'acme-no-products',
    products: [],
  },
};

export function useIntegration() {
  client.scenario.get(
    '/:version/integrations/integration/:slug',
    (req, res) => {
      const { slug } = req.params;
      const integration = integrations[slug];

      if (!integration) {
        res.statusCode = 404;
        res.end();
        return;
      }

      res.json(integration);
    }
  );
}
