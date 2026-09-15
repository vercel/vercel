import type { Project } from '@vercel-internals/types';
import type Client from '../../util/client';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import {
  advancedSettingDefinitions,
  displayAdvanced,
  formatSettingValue,
  getCurrentSetting,
  hasSetting,
  readAdvanced,
  settingLabels,
  settingOrder,
  type AdvancedPreviewRow,
  type ProjectSettingsUpdate,
} from './update-setting-definitions';

function getAdvancedResultValue(
  project: Project,
  row: AdvancedPreviewRow
): string {
  const definition = advancedSettingDefinitions.find(
    candidate => candidate.key === row.key
  );
  return definition
    ? displayAdvanced(definition, readAdvanced(definition, project))
    : row.next;
}

export function printChangePreview({
  project,
  previousSettings,
  requestedSettings,
  changedSettings,
  advancedRows,
}: {
  project: Project;
  previousSettings: ProjectSettingsUpdate;
  requestedSettings: ProjectSettingsUpdate;
  changedSettings: string[];
  advancedRows: AdvancedPreviewRow[];
}): void {
  printAlignedLabel('Project', project.name);
  for (const key of settingOrder) {
    if (!hasSetting(requestedSettings, key) || !changedSettings.includes(key)) {
      continue;
    }
    const previous = formatSettingValue(key, previousSettings[key] ?? null);
    const next = formatSettingValue(key, requestedSettings[key] ?? null);
    printAlignedLabel(settingLabels[key], `${previous} → ${next}`);
  }
  for (const row of advancedRows) {
    if (!row.changed) {
      continue;
    }
    printAlignedLabel(row.label, `${row.previous} → ${row.next}`);
  }
}

export function writeUpdateResult({
  changedSettings,
  project,
  previousSettings,
  requestedSettings,
  advancedRows,
  asJson,
  client,
}: {
  changedSettings: string[];
  project: Project;
  previousSettings: ProjectSettingsUpdate;
  requestedSettings: ProjectSettingsUpdate;
  advancedRows: AdvancedPreviewRow[];
  asJson: boolean;
  client: Client;
}): void {
  const changed = changedSettings.length > 0;
  if (asJson) {
    const settings: Record<string, unknown> = {};
    for (const key of settingOrder) {
      if (hasSetting(requestedSettings, key)) {
        settings[key] = getCurrentSetting(project, key);
      }
    }
    for (const row of advancedRows) {
      const definition = advancedSettingDefinitions.find(
        candidate => candidate.key === row.key
      );
      if (definition) {
        settings[row.key] = readAdvanced(definition, project) ?? null;
      }
    }
    client.stdout.write(
      `${JSON.stringify(
        {
          changed,
          changedSettings,
          projectId: project.id,
          projectName: project.name,
          settings,
        },
        null,
        2
      )}\n`
    );
    return;
  }

  printAlignedLabel(changed ? 'Updated' : 'Unchanged', 'Project Settings', {
    gutter: '✓',
  });
  printAlignedLabel('Project', project.name);
  for (const key of settingOrder) {
    if (!hasSetting(requestedSettings, key)) {
      continue;
    }
    const previous = previousSettings[key] ?? null;
    const next = getCurrentSetting(project, key);
    const value = changedSettings.includes(key)
      ? `${formatSettingValue(key, previous)} → ${formatSettingValue(key, next)}`
      : formatSettingValue(key, next);
    printAlignedLabel(settingLabels[key], value);
  }
  for (const row of advancedRows) {
    const result = getAdvancedResultValue(project, row);
    const value = row.changed ? `${row.previous} → ${result}` : result;
    printAlignedLabel(row.label, value);
  }
}
