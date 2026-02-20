import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import contract from '../../../../src/commands/contract';
import type { FocusContractCommitment } from '../../../../src/util/billing/focus-contract-commitment';

function createMockCommitment(
  overrides: Partial<FocusContractCommitment> = {}
): FocusContractCommitment {
  return {
    ContractId: 'sub_123456',
    ContractPeriodStart: '2025-01-01T00:00:00.000Z',
    ContractPeriodEnd: '2026-01-01T00:00:00.000Z',
    BillingCurrency: 'USD',
    ContractCommitmentCategory: 'Spend',
    ContractCommitmentCost: 20,
    ContractCommitmentDescription: 'Pro plan monthly commitment',
    ContractCommitmentId: 'commitment_123',
    ContractCommitmentPeriodStart: '2025-01-01T00:00:00.000Z',
    ContractCommitmentPeriodEnd: '2025-02-01T00:00:00.000Z',
    ContractCommitmentQuantity: undefined,
    ContractCommitmentType: 'Pro',
    ContractCommitmentUnit: 'USD',
    ...overrides,
  };
}

function useContractCommitments(
  commitments: FocusContractCommitment[] | null = []
) {
  client.scenario.get('/v1/billing/contract-commitments', (_req, res) => {
    if (commitments === null || commitments.length === 0) {
      // Simulate empty response (API returns nothing when no commitments)
      res.end();
    } else {
      res.json(commitments);
    }
  });
}

describe('contract', () => {
  describe('--help', () => {
    it('should display help and track telemetry', async () => {
      client.setArgv('contract', '--help');
      const exitCode = await contract(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'contract',
        },
      ]);
    });

    it('should display help with options', async () => {
      client.setArgv('contract', '--help');
      await contract(client);

      const output = client.getFullOutput();
      expect(output).toContain('Show contract information');
      expect(output).toContain('--format');
    });
  });

  describe('with team context', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
    });

    it('should fetch and display contract commitments', async () => {
      const mockCommitments = [
        createMockCommitment({
          ContractCommitmentType: 'Pro',
          ContractCommitmentCategory: 'Spend',
          ContractCommitmentCost: 20,
        }),
      ];
      useContractCommitments(mockCommitments);

      client.setArgv('contract');
      const exitCode = await contract(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('Pro');
      expect(output).toContain('Spend');
    });

    it('should display Enterprise usage commitments', async () => {
      const mockCommitments = [
        createMockCommitment({
          ContractCommitmentType: 'Enterprise',
          ContractCommitmentCategory: 'Usage',
          ContractCommitmentCost: undefined,
          ContractCommitmentQuantity: 1000000,
          ContractCommitmentUnit: 'MIUs',
          ContractCommitmentDescription: 'Enterprise MIU allocation',
        }),
      ];
      useContractCommitments(mockCommitments);

      client.setArgv('contract');
      const exitCode = await contract(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('Enterprise');
      expect(output).toContain('Usage');
    });

    it('should output JSON with --format json', async () => {
      const mockCommitments = [
        createMockCommitment({
          ContractCommitmentType: 'Pro',
          ContractCommitmentCategory: 'Spend',
          ContractCommitmentCost: 20,
        }),
      ];
      useContractCommitments(mockCommitments);

      client.setArgv('contract', '--format', 'json');
      const exitCode = await contract(client);

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput();
      const json = JSON.parse(output);
      expect(json.commitments).toHaveLength(1);
      expect(json.commitments[0].commitmentType).toEqual('Pro');
      expect(json.commitments[0].commitmentCategory).toEqual('Spend');
      expect(json.commitments[0].commitmentCost).toEqual(20);
    });

    it('should track telemetry for format option', async () => {
      useContractCommitments([]);

      client.setArgv('contract', '--format', 'json');
      await contract(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:format', value: 'json' },
      ]);
    });

    it('should handle empty response', async () => {
      useContractCommitments([]);

      client.setArgv('contract');
      const exitCode = await contract(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('No contract commitments found');
    });

    it('should group multiple commitments by contract', async () => {
      const mockCommitments = [
        createMockCommitment({
          ContractId: 'sub_123',
          ContractCommitmentId: 'commitment_1',
          ContractCommitmentPeriodStart: '2025-01-01T00:00:00.000Z',
          ContractCommitmentPeriodEnd: '2025-02-01T00:00:00.000Z',
        }),
        createMockCommitment({
          ContractId: 'sub_123',
          ContractCommitmentId: 'commitment_2',
          ContractCommitmentPeriodStart: '2025-02-01T00:00:00.000Z',
          ContractCommitmentPeriodEnd: '2025-03-01T00:00:00.000Z',
        }),
      ];
      useContractCommitments(mockCommitments);

      client.setArgv('contract');
      const exitCode = await contract(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('Contract: sub_123');
    });
  });
});
