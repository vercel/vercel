export default (input: string, level: number) => {
  const fill = ' '.repeat(level);
  return `${fill}${input.replace(/\n/g, `\n${fill}`)}`;
};
