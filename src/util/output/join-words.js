// @flow
function joinWords(words: string[] = []) {
  if (words.length === 0) {
    return ''
  } else if (words.length === 1) {
    return words[0]
  } else {
    const last = words[words.length - 1]
    const rest = words.slice(0, words.length - 1)
    return `${rest.join(', ')} and ${last}`
  }
}

export default joinWords
