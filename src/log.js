var log = module.exports = function(level) {
  if (shouldLog(level)) {
    console.log.apply(console, Array.prototype.slice.call(arguments, 1));
  }
};

var shouldLog = module.exports.shouldLog = function(level) {
  return log.level === true || log.level >= level;
}

log.level = 1;
