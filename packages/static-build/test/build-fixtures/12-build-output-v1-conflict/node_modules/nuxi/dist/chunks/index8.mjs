function isUppercase(char = "") {
  return char.toUpperCase() === char;
}
const STR_SPLITTERS = ["-", "_", "/", "."];
function splitByCase(str, splitters = STR_SPLITTERS) {
  const parts = [];
  let buff = "";
  let previusUpper = isUppercase(str[0]);
  let previousSplitter = splitters.includes(str[0]);
  for (const char of str.split("")) {
    const isSplitter = splitters.includes(char);
    if (isSplitter) {
      parts.push(buff);
      buff = "";
      previusUpper = false;
      previousSplitter = true;
    } else if (!previousSplitter && !previusUpper && isUppercase(char)) {
      parts.push(buff);
      buff = char;
      previusUpper = true;
      previousSplitter = false;
    } else {
      buff += char;
      previusUpper = isUppercase(char);
      previousSplitter = isSplitter;
    }
  }
  if (buff) {
    parts.push(buff);
  }
  return parts;
}
function upperFirst(str) {
  if (!str) {
    return "";
  }
  return str[0].toUpperCase() + str.substr(1);
}

export { splitByCase as s, upperFirst as u };
