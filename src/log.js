/* eslint-disable prefer-spread */
// Forward declaration
let log;

function shouldLog(level) {
  return log.level === true || log.level >= level;
}

log = function logWrapper(level, ...args) {
  if (shouldLog(level)) {
    // eslint-disable-next-line no-console
    console.log.apply(
      console,
      Array.prototype.slice.call(args, 1),
    );
  }
};

// By default
log.level = 1;

module.exports = log;
module.exports.shouldLog = shouldLog;
