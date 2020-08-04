import Client from '../client';
import { Project } from '../../types';
import { URLSearchParams } from 'url';

export async function findProjectsForDomain(
  client: Client,
  domainName: string
): Promise<Project[] | Error> {
  try {
    const limit = 50;
    let result: Project[] = [];

    const query = new URLSearchParams({
      hasProductionDomains: '1',
      limit: limit.toString(),
      domain: domainName,
    });

    for (let i = 0; i < 1000; i++) {
      const response = await client.fetch<Project[]>(`/v2/projects/?${query}`);
      result.push(...response);

      if (response.length !== limit) {
        break;
      }

      const [latest] = response.sort((a, b) => b.updatedAt - a.updatedAt);
      query.set('from', latest.updatedAt.toString());
    }

    return result;
  } catch (err) {
    if (err.status < 500) {
      return err;
    }

    throw err;
  }
}
