// A Protocol message interface
function AbstractMessage() {}

AbstractMessage.prototype.mixin = function copyFrom(data) {
  for (var k in data) {
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
AbstractMessage.prototype.buffer = new Buffer(0);

module.exports = AbstractMessage;
