import fs from 'fs';
import { join, dirname } from 'path';

/**
 * Template variables for the trampoline Python script.
 */
export interface TrampolineTemplateVars {
  /** Python module name for the handler */
  moduleName: string;
  /** Entrypoint file path with .py suffix */
  entrypointWithSuffix: string;
  /** Vendor directory name (default: _vendor) */
  vendorDir: string;
  /** Whether runtime dependency installation is enabled */
  runtimeInstallEnabled: boolean;
  /** Directory containing bundled uv binary */
  uvBundleDir: string;
}

/**
 * Renders the trampoline template with the provided variables.
 *
 * The template uses a simple syntax:
 * - {{variableName}} for variable substitution
 * - {{#variableName}}...{{/variableName}} for conditional blocks (included when truthy)
 *
 * @param vars Template variables
 * @returns Rendered Python trampoline code
 */
export function renderTrampoline(vars: TrampolineTemplateVars): string {
  // The template file is located at the package root (one level up from dist/)
  // __dirname points to the dist/ directory when the package is installed
  const packageRoot = dirname(__dirname);
  const templatePath = join(packageRoot, 'trampoline.py.tmpl');
  let template = fs.readFileSync(templatePath, 'utf8');

  // Handle conditional blocks: {{#runtimeInstallEnabled}}...{{/runtimeInstallEnabled}}
  // If the condition is false, remove the entire block including markers
  // If the condition is true, keep the content but remove the markers
  template = template.replace(
    /# \{\{#runtimeInstallEnabled\}\}\n([\s\S]*?)# \{\{\/runtimeInstallEnabled\}\}\n/g,
    (_, content) => (vars.runtimeInstallEnabled ? content : '')
  );

  // Replace simple variable placeholders: {{variableName}}
  template = template.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    const value = vars[varName as keyof TrampolineTemplateVars];
    if (value === undefined) {
      throw new Error(`Unknown template variable: ${varName}`);
    }
    // Convert boolean to string if needed (shouldn't happen for remaining vars)
    return String(value);
  });

  return template;
}
