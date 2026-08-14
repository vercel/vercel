import { describe, expect, it } from 'vitest';
import { parseDeploymentUrl } from '../../../src/util/parse-deployment-url';

describe('parseDeploymentUrl', () => {
  describe('dashboard URLs', () => {
    it('parses vercel.com dashboard URL with scope and deployment ID', () => {
      const result = parseDeploymentUrl(
        'https://vercel.com/vercel/vercel-site/3qQucGyR7QyigKYWa7idzzXeWKwG'
      );
      expect(result).toEqual({
        deploymentIdOrHost: 'dpl_3qQucGyR7QyigKYWa7idzzXeWKwG',
        scope: 'vercel',
      });
    });

    it('handles dashboard URL with dpl_ prefixed ID', () => {
      const result = parseDeploymentUrl(
        'https://vercel.com/my-team/my-project/dpl_abc123'
      );
      expect(result).toEqual({
        deploymentIdOrHost: 'dpl_abc123',
        scope: 'my-team',
      });
    });

    it('handles dashboard URL with trailing slash', () => {
      const result = parseDeploymentUrl(
        'https://vercel.com/vercel/vercel-site/abc123/'
      );
      expect(result).toEqual({
        deploymentIdOrHost: 'dpl_abc123',
        scope: 'vercel',
      });
    });

    it('does not treat other vercel.com subdomains as dashboard URLs', () => {
      const result = parseDeploymentUrl(
        'https://admin.vercel.com/some/internal/path'
      );
      expect(result).toEqual({
        deploymentIdOrHost: 'admin.vercel.com',
      });
      expect(result.scope).toBeUndefined();
    });
  });

  describe('deployment URLs', () => {
    it('extracts hostname from https deployment URL', () => {
      const result = parseDeploymentUrl('https://my-app-abc123.vercel.app');
      expect(result).toEqual({
        deploymentIdOrHost: 'my-app-abc123.vercel.app',
      });
    });

    it('extracts hostname from http deployment URL', () => {
      const result = parseDeploymentUrl('http://my-app.vercel.app');
      expect(result).toEqual({
        deploymentIdOrHost: 'my-app.vercel.app',
      });
    });
  });

  describe('deployment IDs', () => {
    it('adds dpl_ prefix to bare deployment ID', () => {
      const result = parseDeploymentUrl('3qQucGyR7QyigKYWa7idzzXeWKwG');
      expect(result).toEqual({
        deploymentIdOrHost: 'dpl_3qQucGyR7QyigKYWa7idzzXeWKwG',
      });
    });

    it('preserves dpl_ prefix if already present', () => {
      const result = parseDeploymentUrl('dpl_3qQucGyR7QyigKYWa7idzzXeWKwG');
      expect(result).toEqual({
        deploymentIdOrHost: 'dpl_3qQucGyR7QyigKYWa7idzzXeWKwG',
      });
    });

    it('does not add prefix to hostnames (contain dots)', () => {
      const result = parseDeploymentUrl('my-app.vercel.app');
      expect(result).toEqual({
        deploymentIdOrHost: 'my-app.vercel.app',
      });
    });
  });
});
