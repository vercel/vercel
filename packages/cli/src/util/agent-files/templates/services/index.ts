import { renderStorageSection } from './storage';
import { renderComputeSection } from './compute';
import { renderAIIntegrationsSection } from './ai-integrations';

export function renderServicesSection(): string {
  return [
    renderStorageSection(),
    renderComputeSection(),
    renderAIIntegrationsSection(),
  ].join('');
}

export {
  renderStorageSection,
  renderComputeSection,
  renderAIIntegrationsSection,
};
