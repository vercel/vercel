import type Client from '../../util/client';
import output from '../../output-manager';
import getProjectByDeployment from '../../util/projects/get-project-by-deployment';

interface DeploymentCreateResponsePartial {
  inspectorUrl: string;
  id: string;
}

/**
 * Requests a rolling release document.
 * @param {Client} client - The Vercel client instance
 * @param {string} projectId - The projectId to request the rolling release for
 * @param {string} teamId - The team to request the rolling release for
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function startRollingRelease({
  client,
  dpl,
  projectId,
  teamId,
  yes,
}: {
  client: Client;
  dpl: string;
  projectId: string;
  teamId: string;
  yes: boolean;
}): Promise<number> {
  const { deployment } = await getProjectByDeployment({
    client,
    deployId: dpl,
  });

  let promoteByCreation = false;
  if (deployment.target !== 'production') {
    if (yes) {
      promoteByCreation = true;
    } else {
      const question =
        'This deployment is not a production deployment and cannot be directly promoted. A new deployment will be built using your production environment. Are you sure you want to continue?';
      promoteByCreation = await client.input.confirm(question, false);
      if (!promoteByCreation) {
        output.error('Canceled');
        return 0;
      }
    }
  }

  if (promoteByCreation) {
    const newDeployment = (await client.fetch(
      `/v13/deployments?teamId=${deployment.ownerId}`,
      {
        body: {
          deploymentId: deployment.id,
          name: projectId,
          target: 'production',
          meta: {
            action: 'promote',
          },
        },
        accountId: deployment.ownerId,
        method: 'POST',
      }
    )) as DeploymentCreateResponsePartial;

    output.log(
      `Successfully created new deployment at ${newDeployment.inspectorUrl}`
    );
    return 0;
  }
  // request the promotion
  await client.fetch(
    `/v10/projects/${projectId}/promote/${deployment.id}?teamId=${teamId}`,
    {
      body: {}, // required
      json: false,
      method: 'POST',
    }
  );
  output.log('Successfully started rolling release');
  return 0;
}
