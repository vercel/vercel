const areaRegex = /\[([^\]]+)\]/g;

function parseAreas(line) {
  const areaChunk = line.split(' ')?.[0] || '';
  const areas = areaChunk.match(areaRegex);
  if (!areas) {
    return ['UNCATEGORIZED'];
  }

  return areas.map(area => area.substring(1, area.length - 1));
}

function groupLog(logLines) {
  const grouped = {};

  for (let line of logLines) {
    let areas = parseAreas(line);
    for (let area of areas) {
      grouped[area] ||= [];
      grouped[area].push(line);
    }
  }

  return grouped;
}

module.exports = groupLog;
