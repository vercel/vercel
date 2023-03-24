export function pluckIdentifiersFromDeploymentList(output: string): {
  project: string | undefined;
  org: string | undefined;
} {
  const project = output.match(/(?<=Deployments for )(.*)(?= under)/);
  const org = output.match(/(?<=under )(.*)(?= \[)/);

  return {
    project: project?.[0],
    org: org?.[0],
  };
}

export function parseSpacedTableRow(output: string): string[] {
  return output
    .trim()
    .replace(/ {1} +/g, ',')
    .split(',');
}
