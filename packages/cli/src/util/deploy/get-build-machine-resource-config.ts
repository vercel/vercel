import type { Deployment } from '@vercel-internals/types';

export type BuildMachineResourceConfig = {
  cores?: number;
  memory?: number;
  machine?: NonNullable<
    NonNullable<Deployment['resourceConfig']>['buildMachine']
  >['purchaseType'];
  selectionType?: NonNullable<
    NonNullable<Deployment['resourceConfig']>['buildMachine']
  >['machineSelectionType'];
  selectionSource?: NonNullable<
    NonNullable<Deployment['resourceConfig']>['buildMachine']
  >['selectionSource'];
};

export function getBuildMachineResourceConfig(
  deployment: Pick<Deployment, 'resourceConfig'>
): BuildMachineResourceConfig | undefined {
  const buildMachine = deployment.resourceConfig?.buildMachine;
  if (!buildMachine) {
    return undefined;
  }

  const fields = {
    cores: buildMachine.cores,
    memory: buildMachine.memory,
    machine: buildMachine.purchaseType,
    selectionType: buildMachine.machineSelectionType,
    selectionSource: buildMachine.selectionSource,
  } satisfies BuildMachineResourceConfig;

  return Object.values(fields).some(value => value !== undefined)
    ? fields
    : undefined;
}
