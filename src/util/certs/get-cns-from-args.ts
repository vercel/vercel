export default function getCnsFromArgs(args: string[]) {
  return args
    .reduce((res: string[], item: string) => [...res, ...item.split(',')], [])
    .filter(i => i);
}
