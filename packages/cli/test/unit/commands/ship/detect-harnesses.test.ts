import { describe, expect, it } from 'vitest';
import {
  availableHarnesses,
  detectHarnesses,
  HARNESS_DEFINITIONS,
  type DetectedHarness,
} from '../../../../src/commands/ship/detect-harnesses';

function harness(
  id: string,
  status: DetectedHarness['status']
): DetectedHarness {
  return {
    id: id as DetectedHarness['id'],
    label: id,
    status,
    adapterPackage: `@ai-sdk/harness-${id}`,
    installHint: `npm i -g ${id}`,
    detail: '',
  };
}

describe('ship harness detection', () => {
  describe('HARNESS_DEFINITIONS', () => {
    it('has a unique id per harness', () => {
      const ids = HARNESS_DEFINITIONS.map(d => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('declares an adapter package for every harness', () => {
      for (const definition of HARNESS_DEFINITIONS) {
        expect(definition.adapterPackage).toMatch(/^@ai-sdk\/harness-/);
      }
    });

    it('declares an install hint for every harness with a local CLI', () => {
      for (const definition of HARNESS_DEFINITIONS) {
        if (definition.bin) {
          expect(definition.installHint.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('detectHarnesses', () => {
    it('returns one result per definition', async () => {
      const detected = await detectHarnesses();
      expect(detected).toHaveLength(HARNESS_DEFINITIONS.length);
    });

    it('reports a known status and a detail for each', async () => {
      const detected = await detectHarnesses();
      for (const result of detected) {
        expect(['ready', 'unverified', 'missing']).toContain(result.status);
        expect(result.detail).toBeTruthy();
      }
    });

    it('reports harnesses with no local CLI as missing', async () => {
      const detected = await detectHarnesses();
      const noCliIds = HARNESS_DEFINITIONS.filter(d => !d.bin).map(d => d.id);

      for (const id of noCliIds) {
        const result = detected.find(candidate => candidate.id === id);
        expect(result?.status).toBe('missing');
      }
    });

    it('never reports a binPath for a missing harness', async () => {
      const detected = await detectHarnesses();
      for (const result of detected) {
        if (result.status === 'missing') {
          expect(result.binPath).toBeUndefined();
        }
      }
    });
  });

  describe('availableHarnesses', () => {
    it('drops missing harnesses', () => {
      const result = availableHarnesses([
        harness('codex', 'missing'),
        harness('pi', 'ready'),
      ]);

      expect(result.map(h => h.id)).toEqual(['pi']);
    });

    it('orders ready before unverified', () => {
      const result = availableHarnesses([
        harness('opencode', 'unverified'),
        harness('codex', 'ready'),
      ]);

      expect(result.map(h => h.id)).toEqual(['codex', 'opencode']);
    });

    it('orders alphabetically within the same status', () => {
      const result = availableHarnesses([
        harness('pi', 'ready'),
        harness('claude-code', 'ready'),
        harness('codex', 'ready'),
      ]);

      expect(result.map(h => h.id)).toEqual(['claude-code', 'codex', 'pi']);
    });

    it('returns an empty array when nothing is available', () => {
      expect(availableHarnesses([harness('codex', 'missing')])).toEqual([]);
    });
  });
});
