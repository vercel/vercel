import fs from 'fs';
import { join, dirname } from 'path';
import Mustache from 'mustache';

/**
 * Template vars for the trampoline Python script.
 */
export interface TrampolineTemplateVars {
  moduleName: string;
  entrypointWithSuffix: string;
  vendorDir: string;
  runtimeInstallEnabled: boolean;
  uvBundleDir: string;
}

/**
 * Renders the trampoline template with the provided variables using Mustache.
 */
export function renderTrampoline(vars: TrampolineTemplateVars): string {
  const packageRoot = dirname(__dirname);
  const templatePath = join(packageRoot, 'trampoline.py.tmpl');
  const template = fs.readFileSync(templatePath, 'utf8');

  return Mustache.render(template, vars);
}
