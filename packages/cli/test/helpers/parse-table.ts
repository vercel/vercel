export function pluckIdentifiersFromDeploymentList(output: string): {
  project: string | undefined;
  org: string | undefined;
} {
  const m = output.match(/Deployments for (.*)\/(.*)\s/);
  return {
    project: m?.[2],
    org: m?.[1],
  };
}

export function parseSpacedTableRow(output: string): string[] {
  return output
    .trim()
    .replace(/ {1} +/g, ',')
    .split(',');
}
