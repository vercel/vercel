exports.compare = function(a, b) {
  return a.serial.localeCompare(b.serial) ||
    // For the case serials are a same value on old logs
    a.created.getTime() - b.created.getTime();
};

exports.deserialize = function(log) {
  return Object.assign({}, log, {
    data: new Date(log.date),
    created: new Date(log.created)
  });
};
