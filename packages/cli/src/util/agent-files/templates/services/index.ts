import { renderCronSection } from './cron';
import { renderWorkflowSection } from './workflow';
import { renderAIGatewaySection } from './ai-gateway';
import { renderBlobSection } from './blob';
import { renderKVSection } from './kv';
import { renderPostgresSection } from './postgres';
import { renderEdgeSection } from './edge';
import { renderMarketplaceSection } from './marketplace';

export function renderServicesSection(): string {
  return [
    renderCronSection(),
    renderWorkflowSection(),
    renderAIGatewaySection(),
    renderBlobSection(),
    renderKVSection(),
    renderPostgresSection(),
    renderEdgeSection(),
    renderMarketplaceSection(),
  ].join('');
}

export {
  renderCronSection,
  renderWorkflowSection,
  renderAIGatewaySection,
  renderBlobSection,
  renderKVSection,
  renderPostgresSection,
  renderEdgeSection,
  renderMarketplaceSection,
};
