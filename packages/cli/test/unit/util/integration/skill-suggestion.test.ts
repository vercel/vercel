import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { getSkillSuggestionForProduct } from '../../../../src/util/integration/skill-suggestion';

describe('getSkillSuggestionForProduct', () => {
  beforeEach(() => {
    client.reset();
  });

  it('returns command when product has both agentSkillName and agentSkillUrl', async () => {
    client.scenario.get(
      '/v2/integrations/integration/acme/owned',
      (_req, res) => {
        res.json({
          id: 'acme',
          slug: 'acme',
          name: 'Acme',
          products: [
            {
              id: 'acme-db',
              slug: 'acme-db',
              name: 'Acme DB',
              agentSkillName: 'acme-db-skill',
              agentSkillUrl: 'https://example.com/SKILL.md',
            },
          ],
        });
      }
    );

    const result = await getSkillSuggestionForProduct(
      client,
      'acme',
      'acme-db'
    );
    expect(result).toEqual({
      name: 'acme-db-skill',
      url: 'https://example.com/SKILL.md',
      command:
        "npx skills add https://example.com/SKILL.md --skill 'acme-db-skill'",
    });
  });

  it('returns null when agentSkillUrl is missing', async () => {
    client.scenario.get(
      '/v2/integrations/integration/acme/owned',
      (_req, res) => {
        res.json({
          id: 'acme',
          slug: 'acme',
          name: 'Acme',
          products: [
            {
              id: 'acme-db',
              slug: 'acme-db',
              name: 'Acme DB',
              agentSkillName: 'acme-db-skill',
            },
          ],
        });
      }
    );

    const result = await getSkillSuggestionForProduct(
      client,
      'acme',
      'acme-db'
    );
    expect(result).toBeNull();
  });

  it('returns null when agentSkillName is missing', async () => {
    client.scenario.get(
      '/v2/integrations/integration/acme/owned',
      (_req, res) => {
        res.json({
          id: 'acme',
          slug: 'acme',
          name: 'Acme',
          products: [
            {
              id: 'acme-db',
              slug: 'acme-db',
              name: 'Acme DB',
              agentSkillUrl: 'https://example.com/SKILL.md',
            },
          ],
        });
      }
    );

    const result = await getSkillSuggestionForProduct(
      client,
      'acme',
      'acme-db'
    );
    expect(result).toBeNull();
  });

  it('returns null when both fields are empty strings', async () => {
    client.scenario.get(
      '/v2/integrations/integration/acme/owned',
      (_req, res) => {
        res.json({
          id: 'acme',
          slug: 'acme',
          name: 'Acme',
          products: [
            {
              id: 'acme-db',
              slug: 'acme-db',
              name: 'Acme DB',
              agentSkillName: '   ',
              agentSkillUrl: '',
            },
          ],
        });
      }
    );

    const result = await getSkillSuggestionForProduct(
      client,
      'acme',
      'acme-db'
    );
    expect(result).toBeNull();
  });

  it('returns null when product is not found in response', async () => {
    client.scenario.get(
      '/v2/integrations/integration/acme/owned',
      (_req, res) => {
        res.json({
          id: 'acme',
          slug: 'acme',
          name: 'Acme',
          products: [
            {
              id: 'acme-db',
              slug: 'acme-db',
              name: 'Acme DB',
              agentSkillName: 'acme-db-skill',
              agentSkillUrl: 'https://example.com/SKILL.md',
            },
          ],
        });
      }
    );

    const result = await getSkillSuggestionForProduct(
      client,
      'acme',
      'nonexistent-product'
    );
    expect(result).toBeNull();
  });

  it('returns null when the /owned fetch errors', async () => {
    client.scenario.get(
      '/v2/integrations/integration/missing/owned',
      (_req, res) => {
        res.status(404);
        res.end();
      }
    );

    const result = await getSkillSuggestionForProduct(
      client,
      'missing',
      'any-product'
    );
    expect(result).toBeNull();
  });

  it('shell-quotes skill names containing spaces and single quotes', async () => {
    client.scenario.get(
      '/v2/integrations/integration/acme/owned',
      (_req, res) => {
        res.json({
          id: 'acme',
          slug: 'acme',
          name: 'Acme',
          products: [
            {
              id: 'acme-db',
              slug: 'acme-db',
              name: 'Acme DB',
              agentSkillName: "Acme's DB Skill",
              agentSkillUrl: 'https://example.com/SKILL.md',
            },
          ],
        });
      }
    );

    const result = await getSkillSuggestionForProduct(
      client,
      'acme',
      'acme-db'
    );
    expect(result?.command).toBe(
      "npx skills add https://example.com/SKILL.md --skill 'Acme'\\''s DB Skill'"
    );
  });
});
