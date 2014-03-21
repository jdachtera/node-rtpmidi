var log = module.exports = function(level) {
  if (log.level === true || log.level >= level) {
    console.log.apply(console, Array.prototype.slice.call(arguments, 1));
  }
};

log.level = 1;


