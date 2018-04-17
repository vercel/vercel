// @flow
export default function getInstanceIndex() {
  const instancesIndex = {}
  let items = 0

  return (instanceId: string) => {
    if (instancesIndex[instanceId] === undefined) {
      instancesIndex[instanceId] = items
      items += 1
    }

    return instancesIndex[instanceId]
  }
}
