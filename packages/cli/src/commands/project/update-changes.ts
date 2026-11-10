import type {
  JSONObject,
  Project,
  ProjectSandboxConfig,
} from '@vercel-internals/types';
import type Client from '../../util/client';
import {
  displayAdvanced,
  getCurrentSetting,
  hasSetting,
  isSameSettingValue,
  isSandboxSettingKey,
  readAdvanced,
  settingOrder,
  type AdvancedPreviewRow,
  type AdvancedSettingDefinition,
  type AdvancedValue,
  type PatchBody,
  type ProjectSettingsUpdate,
  type ProvidedAdvancedSetting,
} from './update-setting-definitions';

export interface ProjectSettingsChanges {
  previousSettings: ProjectSettingsUpdate;
  changedSettings: string[];
  body: PatchBody;
  advancedRows: AdvancedPreviewRow[];
}

function ensureResourceConfig(body: PatchBody): Record<string, unknown> {
  body.resourceConfig ??= {};
  return body.resourceConfig as Record<string, unknown>;
}

function applyAdvanced(
  definition: AdvancedSettingDefinition,
  body: PatchBody,
  value: AdvancedValue
): void {
  switch (definition.target) {
    case 'resourceConfig':
      ensureResourceConfig(body)[definition.field] = value;
      break;
    case 'project':
      body[definition.field] = value;
      break;
  }
}

export function computeSettingsChanges(
  project: Project,
  requestedSettings: ProjectSettingsUpdate,
  providedAdvanced: readonly ProvidedAdvancedSetting[]
): ProjectSettingsChanges {
  const previousSettings: ProjectSettingsUpdate = {};
  const changedSettings: string[] = [];
  const body: PatchBody = {};
  let mergedSandbox: ProjectSandboxConfig | undefined;
  if (
    hasSetting(requestedSettings, 'sandboxRegion') ||
    hasSetting(requestedSettings, 'sandboxFailoverRegions')
  ) {
    mergedSandbox = { ...project.sandbox };
    if (hasSetting(requestedSettings, 'sandboxRegion')) {
      const region = requestedSettings.sandboxRegion;
      if (region === null || region === undefined) {
        delete mergedSandbox.region;
      } else {
        mergedSandbox.region = region;
      }
    }
    if (hasSetting(requestedSettings, 'sandboxFailoverRegions')) {
      mergedSandbox.failoverRegions =
        requestedSettings.sandboxFailoverRegions ?? [];
    }
  }

  for (const key of settingOrder) {
    if (!hasSetting(requestedSettings, key)) {
      continue;
    }
    const previous = getCurrentSetting(project, key);
    const next = requestedSettings[key] ?? null;
    Object.assign(previousSettings, { [key]: previous });
    if (!isSameSettingValue(previous, next)) {
      changedSettings.push(key);
      if (!isSandboxSettingKey(key)) {
        body[key] = next;
      }
    }
  }

  if (
    mergedSandbox &&
    (changedSettings.includes('sandboxRegion') ||
      changedSettings.includes('sandboxFailoverRegions'))
  ) {
    body.sandbox = mergedSandbox;
  }

  const advancedRows: AdvancedPreviewRow[] = [];
  for (const { definition, value } of providedAdvanced) {
    const previous = readAdvanced(definition, project);
    const changed = previous !== value;
    advancedRows.push({
      key: definition.key,
      label: definition.label,
      previous: displayAdvanced(definition, previous),
      next: displayAdvanced(definition, value),
      changed,
    });
    if (changed) {
      changedSettings.push(definition.key);
      applyAdvanced(definition, body, value);
    }
  }

  return {
    previousSettings,
    changedSettings,
    body,
    advancedRows,
  };
}

export async function patchProjectSettings(
  client: Client,
  project: Project,
  body: PatchBody
): Promise<Project> {
  return client.fetch<Project>(
    `/v9/projects/${encodeURIComponent(project.id)}`,
    {
      method: 'PATCH',
      accountId: project.accountId,
      body: body as JSONObject,
    }
  );
}
