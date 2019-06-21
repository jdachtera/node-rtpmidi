const util = require("util");

const AbstractMessage = require("./AbstractMessage");

const byteToCommand = {
  0x494E: 'invitation',
  0x4E4F: 'invitation_rejected',
  0x4F4B: 'invitation_accepted',
  0x4259: 'end',
  0x434B: 'synchronization',
  0x5253: 'receiver_feedback',
  0x524C: 'bitrate_receive_limit'
};

const commandToByte = (function () {
  var obj = {};
  for (var key in byteToCommand) {
    if (byteToCommand.hasOwnProperty(key)) {
      obj[byteToCommand[key]] = parseInt(key, 10);
    }
  }
  return obj;
})();

const flags = {
  start: 0xFFFF
};

function ControlMessage(buffer) {
  AbstractMessage.apply(this);
}

util.inherits(ControlMessage, AbstractMessage);

ControlMessage.prototype.name = '';
ControlMessage.prototype.isValid = true;
ControlMessage.prototype.start = flags.start;
ControlMessage.prototype.version = 2;

ControlMessage.prototype.parseBuffer = function parseBuffer(buffer) {
  AbstractMessage.prototype.parseBuffer.apply(this, arguments);
  this.start = buffer.readUInt16BE(0);
  if (this.start !== flags.start) {
    this.isValid = false;
    return this;
  }
  this.command = byteToCommand[buffer.readUInt16BE(2)];

  switch (this.command) {
    case 'invitation':
    case 'invitation_accepted':
    case 'invitation_rejected':
    case 'end':
      this.version = buffer.readUInt32BE(4);
      this.token = buffer.readUInt32BE(8);
      this.ssrc = buffer.readUInt32BE(12);
      this.name = buffer.toString('utf-8', 16);
      break;
    case 'synchronization':
      this.ssrc = buffer.readUInt32BE(4, 8);
      this.count = buffer.readUInt8(8);
      this.padding = (buffer.readUInt8(9) << 0xF0) + buffer.readUInt16BE(10);
      this.timestamp1 = buffer.slice(12, 20); //[buffer.readUInt32BE(12), buffer.readUInt32BE(16)];
      this.timestamp2 = buffer.slice(20, 28); //[buffer.readUInt32BE(20), buffer.readUInt32BE(24)];
      this.timestamp3 = buffer.slice(28, 36); //[buffer.readUInt32BE(28), buffer.readUInt32BE(32)];
      break;
    case 'receiver_feedback':
      this.ssrc = buffer.readUInt32BE(4, 8);
      this.sequenceNumber = buffer.readUInt16BE(8);
      break;
    default:
      break;
  }
  return this;
};

ControlMessage.prototype.generateBuffer = function generateBuffer() {
  var buffer,
  commandByte = commandToByte[this.command];

  switch (this.command) {
    case 'invitation':
    case 'invitation_accepted':
    case 'invitation_rejected':
    case 'end':
      this.name = this.name || '';
      buffer = new Buffer(17 + Buffer.byteLength(this.name, 'utf8'));
      buffer.writeUInt16BE(this.start, 0);
      buffer.writeUInt16BE(commandByte, 2);
      buffer.writeUInt32BE(this.version, 4);
      buffer.writeUInt32BE(this.token, 8);
      buffer.writeUInt32BE(this.ssrc, 12);
      buffer.write(this.name, 16);
      if (this.command !== 'end') {
        buffer.writeUInt8(0, buffer.length - 1);
      }
      break;
    case 'synchronization':
      buffer = new Buffer(36);
      buffer.writeUInt16BE(this.start, 0);
      buffer.writeUInt16BE(commandByte, 2);
      buffer.writeUInt32BE(this.ssrc, 4);
      buffer.writeUInt8(this.count, 8);
      buffer.writeUInt8(this.padding >>> 0xF0, 9);
      buffer.writeUInt16BE(this.padding & 0x00FFFF, 10);
      
      this.timestamp1.copy(buffer, 12);
      this.timestamp2.copy(buffer, 20);
      this.timestamp3.copy(buffer, 28);
      
      break;
    case 'receiver_feedback':
      buffer = new Buffer(12);
      buffer.writeUInt16BE(this.start, 0);
      buffer.writeUInt16BE(commandByte, 2);
      buffer.writeUInt32BE(this.ssrc, 4);
      buffer.writeUInt16BE(this.sequenceNumber, 8);
      break;
    default:
      break;
  }
  this.buffer = buffer;
  return this;
};

module.exports = ControlMessage;
