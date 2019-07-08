/* eslint-disable no-restricted-syntax */
// A Protocol message interface
function AbstractMessage() {}

AbstractMessage.prototype.mixin = function copyFrom(data) {
  for (const k in data) {
    // eslint-disable-next-line no-prototype-builtins
    if (data.hasOwnProperty(k)) {
      this[k] = data[k];
    }
  }
  return this;
};

AbstractMessage.prototype.parseBuffer = function parseBuffer(buffer) {
  this.buffer = buffer;
  return this;
};

AbstractMessage.prototype.generateBuffer = function generateBuffer() {
  return this;
};
AbstractMessage.prototype.isMessage = true;
AbstractMessage.prototype.isValid = true;
AbstractMessage.prototype.buffer = Buffer.alloc(0);

module.exports = AbstractMessage;
