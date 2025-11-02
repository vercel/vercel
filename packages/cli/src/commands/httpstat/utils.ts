export const requoteArgs = (arg: string): string => {
  if (arg.includes(' ')) {
    if (arg.includes('"')) {
      return `'${arg}'`;
    } else {
      return `"${arg}"`;
    }
  }
  return arg;
};
