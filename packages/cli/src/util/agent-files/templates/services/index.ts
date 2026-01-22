import { renderCronSection } from './cron';
import { renderBlobSection } from './blob';
import { renderKVSection } from './kv';
import { renderPostgresSection } from './postgres';
import { renderEdgeSection } from './edge';
import { renderMarketplaceSection } from './marketplace';

export function renderServicesSection(): string {
  return `## Vercel Services & Features

${renderCronSection()}
${renderBlobSection()}
${renderKVSection()}
${renderPostgresSection()}
${renderEdgeSection()}
${renderMarketplaceSection()}`;
}

export {
  renderCronSection,
  renderBlobSection,
  renderKVSection,
  renderPostgresSection,
  renderEdgeSection,
  renderMarketplaceSection,
};
