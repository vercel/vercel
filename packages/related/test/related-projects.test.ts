import { relatedProjects } from '../src/related-projects';
import type { VercelRelatedProjects } from '../src/types';

describe('relatedProjects', () => {
  const mockEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...mockEnv };
  });

  afterEach(() => {
    process.env = mockEnv;
  });

  test('throws an error if VERCEL_RELATED_PROJECTS is missing and noThrow is false', () => {
    delete process.env.VERCEL_RELATED_PROJECTS;

    expect(() => relatedProjects()).toThrow(
      'Missing required environment variable: VERCEL_RELATED_PROJECTS'
    );
  });

  test('returns an empty array if VERCEL_RELATED_PROJECTS is missing and noThrow is true', () => {
    delete process.env.VERCEL_RELATED_PROJECTS;

    expect(relatedProjects({ noThrow: true })).toEqual([]);
  });

  test('throws an error if VERCEL_RELATED_PROJECTS contains invalid JSON and noThrow is false', () => {
    process.env.VERCEL_RELATED_PROJECTS = 'invalid-json';

    expect(() => relatedProjects()).toThrow(
      'Invalid JSON in VERCEL_RELATED_PROJECTS'
    );
  });

  test('returns an empty array if VERCEL_RELATED_PROJECTS contains invalid JSON and noThrow is true', () => {
    process.env.VERCEL_RELATED_PROJECTS = 'invalid-json';

    expect(relatedProjects({ noThrow: true })).toEqual([]);
  });

  test('parses and returns valid VERCEL_RELATED_PROJECTS JSON', () => {
    const mockProjects: VercelRelatedProjects = [
      {
        project: { id: '123', name: 'test-project' },
        production: { url: 'test-project.vercel.app', alias: 'test.com' },
        preview: { branch: 'feature-branch' },
      },
    ];
    process.env.VERCEL_RELATED_PROJECTS = JSON.stringify(mockProjects);

    expect(relatedProjects()).toEqual(mockProjects);
  });

  test('parses and returns an empty array if VERCEL_RELATED_PROJECTS is valid JSON but empty', () => {
    process.env.VERCEL_RELATED_PROJECTS = JSON.stringify([]);

    expect(relatedProjects()).toEqual([]);
  });
});
