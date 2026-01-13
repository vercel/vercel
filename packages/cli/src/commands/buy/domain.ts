import type Client from '../../util/client';
// Reuse the existing domain buy implementation
import domainsBuy from '../domains/buy';

export default async function domain(client: Client, argv: string[]) {
  // Delegate to the existing domains buy command
  return domainsBuy(client, argv);
}
