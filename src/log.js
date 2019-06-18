/* eslint-disable prefer-rest-params */
/* eslint-disable no-use-before-define */
/* eslint-disable prefer-spread */
/* eslint-disable func-names */
/* eslint-disable no-multi-assign */
const shouldLog = module.exports.shouldLog = function (level) {
  return log.level === true || log.level >= level;
};

const log = module.exports = function (level) {
  if (shouldLog(level)) {
    console.log.apply(console, Array.prototype.slice.call(arguments, 1));
  }
};

log.level = 1;
