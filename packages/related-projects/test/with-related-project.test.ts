import { withRelatedProject } from '../src/with-related-project';
import { relatedProjects } from '../src/related-projects';
import type { VercelRelatedProjects } from '../src/types';

jest.mock('../src/related-projects', () => ({
  relatedProjects: jest.fn(),
}));

describe('withRelatedProject', () => {
  const mockEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...mockEnv };
  });

  afterEach(() => {
    process.env = mockEnv;
    jest.clearAllMocks();
  });

  test('returns defaultHost if no related projects are found', () => {
    (relatedProjects as jest.Mock).mockReturnValue([]);

    expect(
      withRelatedProject({
        projectName: 'test-project',
        defaultHost: 'https://default.com',
      })
    ).toBe('https://default.com');
  });

  test('returns defaultHost if project is not found in related projects', () => {
    const mockProjects: VercelRelatedProjects = [
      {
        project: { id: '123', name: 'another-project' },
        production: { url: 'another-project.vercel.app', alias: 'another.com' },
        preview: { branch: 'feature-branch' },
      },
    ];
    (relatedProjects as jest.Mock).mockReturnValue(mockProjects);

    expect(
      withRelatedProject({
        projectName: 'test-project',
        defaultHost: 'https://default.com',
      })
    ).toBe('https://default.com');
  });

  test('returns preview branch URL when VERCEL_ENV is preview', () => {
    process.env.VERCEL_ENV = 'preview';
    const mockProjects: VercelRelatedProjects = [
      {
        project: { id: '123', name: 'test-project' },
        production: { url: 'test-project.vercel.app', alias: 'test.com' },
        preview: { branch: 'feature-branch' },
      },
    ];
    (relatedProjects as jest.Mock).mockReturnValue(mockProjects);

    expect(
      withRelatedProject({
        projectName: 'test-project',
        defaultHost: 'https://default.com',
      })
    ).toBe('https://feature-branch');
  });

  test('returns production alias URL when VERCEL_ENV is production and alias is present', () => {
    process.env.VERCEL_ENV = 'production';
    const mockProjects: VercelRelatedProjects = [
      {
        project: { id: '123', name: 'test-project' },
        production: { url: 'test-project.vercel.app', alias: 'test.com' },
        preview: { branch: 'feature-branch' },
      },
    ];
    (relatedProjects as jest.Mock).mockReturnValue(mockProjects);

    expect(
      withRelatedProject({
        projectName: 'test-project',
        defaultHost: 'https://default.com',
      })
    ).toBe('https://test.com');
  });

  test('returns production URL when VERCEL_ENV is production and alias is missing', () => {
    process.env.VERCEL_ENV = 'production';
    const mockProjects: VercelRelatedProjects = [
      {
        project: { id: '123', name: 'test-project' },
        production: { url: 'test-project.vercel.app' },
        preview: { branch: 'feature-branch' },
      },
    ];
    (relatedProjects as jest.Mock).mockReturnValue(mockProjects);

    expect(
      withRelatedProject({
        projectName: 'test-project',
        defaultHost: 'https://default.com',
      })
    ).toBe('https://test-project.vercel.app');
  });

  test('returns defaultHost if VERCEL_ENV is production and both alias and URL are missing', () => {
    process.env.VERCEL_ENV = 'production';
    const mockProjects: VercelRelatedProjects = [
      {
        project: { id: '123', name: 'test-project' },
        production: {},
        preview: { branch: 'feature-branch' },
      },
    ];
    (relatedProjects as jest.Mock).mockReturnValue(mockProjects);

    expect(
      withRelatedProject({
        projectName: 'test-project',
        defaultHost: 'https://default.com',
      })
    ).toBe('https://default.com');
  });

  test('returns defaultHost if VERCEL_ENV is not set', () => {
    delete process.env.VERCEL_ENV;
    const mockProjects: VercelRelatedProjects = [
      {
        project: { id: '123', name: 'test-project' },
        production: { url: 'test-project.vercel.app', alias: 'test.com' },
        preview: { branch: 'feature-branch' },
      },
    ];
    (relatedProjects as jest.Mock).mockReturnValue(mockProjects);

    expect(
      withRelatedProject({
        projectName: 'test-project',
        defaultHost: 'https://default.com',
      })
    ).toBe('https://default.com');
  });
});
