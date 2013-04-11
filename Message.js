// A Protocol message interface
function Message() {}

Message.prototype.copyFrom = function copyFrom(data) {
    for (var k in data) {
        if (data.hasOwnProperty(k)) {
            this[k] = data[k];
        }
    }
    return this;
};

Message.prototype.parseBuffer = function parseBuffer(buffer) {
    this.buffer = buffer;
    return this;
};

Message.prototype.generateBuffer = function generateBuffer() {
    return this;
};
Message.prototype.isMessage = true;

module.exports = Message;