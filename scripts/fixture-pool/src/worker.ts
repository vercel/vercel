export default ({ framework, version }: { framework: string, version: string }) => {
  console.log(`Deploying fixture: ${framework}@${version}`);
  console.log(`Checking probes...`);
  console.log(`Success!`);
  return true
}
