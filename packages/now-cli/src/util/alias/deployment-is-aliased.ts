import { Deployment } from '../../types';
import Client from '../client';
import getAliases from './get-aliases';

export default async function deploymentIsAliased(
  client: Client,
  deployment: Deployment
) {
  const aliases = await getAliases(client);
  return aliases.some(alias => alias.deploymentId === deployment.uid);
}
