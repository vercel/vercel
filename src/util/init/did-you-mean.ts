// @ts-ignore
import distance from 'jaro-winkler';

export default didYouMean;

/**
 * Guess user's intention with jaro-winkler algorithm (with "-" awared)
 */
function didYouMean(input: string, list: string[], threshold: number = 0.5) {
  const rated = list.map(item => [dashAwareDistance(input, item), item]);
  const found = rated.filter(item => item[0] > threshold);
  if (found.length) {
    const highestRated = found.reduce((accu, curr) => {
      return accu[0] > curr[0] ? accu : curr
    });
    return highestRated[1];
  }
}

/**
 * jaro-winkler distance with "-" awared
 */
function dashAwareDistance(word: string, dashWord: string) {
  const fullDistance = distance(word, dashWord);
  const distances = dashWord.split('-').map(w => distance(w, word));
  const meanDistance = distances.reduce((accu, curr) => accu + curr) / distances.length;
  return fullDistance > meanDistance ? fullDistance : meanDistance;
}
