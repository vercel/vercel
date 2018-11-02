module.exports = (metadata) => {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === 'string') {
    metadata = [metadata];
  }

  const parsed = {}
  metadata.forEach(item => {
    const [key, value] = item.split('=');
    parsed[key] = value || ''
  })

  return parsed;
}
