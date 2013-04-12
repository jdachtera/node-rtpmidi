"use strict";

// A Protocol message interface
function AbstractMessage() {
}

AbstractMessage.prototype.copyFrom = function copyFrom(data) {
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

module.exports = AbstractMessage;