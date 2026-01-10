import { describe, test, expect } from 'vitest';
import {
  extractContext,
  extractTeamId,
  extractProjectId,
  parseOidcToken,
} from './token-parser';
import { VaultTokenError } from './errors';

describe('token-parser', () => {
  describe('parseOidcToken', () => {
    test('should parse valid token', () => {
      const token = createToken({
        owner_id: 'team_123',
        project_id: 'prj_456',
        environment: 'production',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'test',
      });

      const claims = parseOidcToken(token);

      expect(claims.owner_id).toBe('team_123');
      expect(claims.project_id).toBe('prj_456');
      expect(claims.environment).toBe('production');
    });

    test('should throw VaultTokenError on invalid token', () => {
      expect(() => parseOidcToken('invalid-token')).toThrow(VaultTokenError);
    });
  });

  describe('extractContext', () => {
    test('should extract context from valid token', () => {
      const token = createToken({
        owner_id: 'team_123',
        project_id: 'prj_456',
        environment: 'production',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'test',
      });

      const context = extractContext(token);

      expect(context).toEqual({
        teamId: 'team_123',
        projectId: 'prj_456',
        environment: 'production',
      });
    });

    test('should throw VaultTokenError on missing owner_id', () => {
      const token = createToken({
        project_id: 'prj_456',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'test',
      });

      expect(() => extractContext(token)).toThrow(VaultTokenError);
      expect(() => extractContext(token)).toThrow(
        /OIDC token missing required claims/
      );
    });

    test('should throw VaultTokenError on missing project_id', () => {
      const token = createToken({
        owner_id: 'team_123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'test',
      });

      expect(() => extractContext(token)).toThrow(VaultTokenError);
      expect(() => extractContext(token)).toThrow(
        /OIDC token missing required claims/
      );
    });
  });

  describe('extractTeamId', () => {
    test('should extract team ID from token', () => {
      const token = createToken({
        owner_id: 'team_789',
        project_id: 'prj_456',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'test',
      });

      expect(extractTeamId(token)).toBe('team_789');
    });

    test('should throw VaultTokenError on missing owner_id', () => {
      const token = createToken({
        project_id: 'prj_456',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'test',
      });

      expect(() => extractTeamId(token)).toThrow(VaultTokenError);
      expect(() => extractTeamId(token)).toThrow(
        /OIDC token does not contain owner_id claim/
      );
    });
  });

  describe('extractProjectId', () => {
    test('should extract project ID from token', () => {
      const token = createToken({
        owner_id: 'team_123',
        project_id: 'prj_abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'test',
      });

      expect(extractProjectId(token)).toBe('prj_abc');
    });

    test('should throw VaultTokenError on missing project_id', () => {
      const token = createToken({
        owner_id: 'team_123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'test',
      });

      expect(() => extractProjectId(token)).toThrow(VaultTokenError);
      expect(() => extractProjectId(token)).toThrow(
        /OIDC token does not contain project_id claim/
      );
    });
  });
});

function createToken(payload: Record<string, unknown>): string {
  const base64Payload = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `eyJhbGciOiJIUzI1NiJ9.${base64Payload}.signature`;
}
