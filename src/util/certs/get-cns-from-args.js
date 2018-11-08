export default function getCnsFromArgs(args) {
  return args
    .reduce((res, item) => [...res, ...item.split(',')], [])
    .filter(i => i);
}
