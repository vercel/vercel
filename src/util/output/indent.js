export default (input, level) => {
  const fill = ' '.repeat(level);
  return `${fill}${input.replace(/\n/g, `\n${fill}`)}`;
};
