export function pluckIdentifiersFromDeploymentList(output: string): {
  project: string | undefined;
  org: string | undefined;
} {
  const project = /(?<=Deployments for )(.*)(?= under)/.exec(output);
  const org = /(?<=under )(.*)(?= \[)/.exec(output);

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
