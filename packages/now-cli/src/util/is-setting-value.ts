import { SettingValue } from '@now/frameworks';

export function isSettingValue(setting: any): setting is SettingValue {
  return setting && typeof setting.value === 'string';
}
