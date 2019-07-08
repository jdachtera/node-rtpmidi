/* eslint-disable no-mixed-operators */
/* eslint-disable no-bitwise */
const util = require('util');

const AbstractMessage = require('./AbstractMessage');

/**
* This represents a RTP Protocol message.
* @constructor
*/
function RTPMessage() {
  AbstractMessage.apply(this);
  this.csrcs = [];
}

util.inherits(RTPMessage, AbstractMessage);

RTPMessage.prototype.version = 2;
RTPMessage.prototype.padding = false;
RTPMessage.prototype.hasExtension = false;
RTPMessage.prototype.csrcCount = 0;
RTPMessage.prototype.marker = false;
RTPMessage.prototype.payloadType = 0;
RTPMessage.prototype.sequenceNumber = 0;
RTPMessage.prototype.timestamp = 0;
RTPMessage.prototype.ssrc = 0;
RTPMessage.prototype.payload = Buffer.alloc(0);

/**
* Parses a Buffer into this RTPMessage object
* @param {Buffer} The buffer containing a RTP AbstractMessage
* @returns {Buffer} self
*/
RTPMessage.prototype.parseBuffer = function parseBuffer(buffer, ...args) {
  let currentOffset;

  AbstractMessage.prototype.parseBuffer.apply(this, args);
  const firstByte = buffer.readUInt8(0);

  this.version = firstByte >>> 6;
  this.padding = !!(firstByte >>> 5 & 1);
  this.hasExtension = !!((firstByte >>> 4) & 1);
  this.csrcCount = firstByte & 0xF;

  const secondByte = buffer.readUInt8(1);
  this.marker = (secondByte & 0x80) === 0x80;
  this.payloadType = secondByte & 0x7f;

  this.sequenceNumber = buffer.readUInt16BE(2);
  this.timestamp = buffer.readUInt32BE(4);
  this.ssrc = buffer.readUInt32BE(8);
  currentOffset = 12;
  for (let i = 0; i < this.csrcCount; i += 2) {
    this.csrcs.push(buffer.readUInt32BE(currentOffset));
  }
  if (this.hasExtension) {
    this.extensionHeaderId = buffer.readUInt16BE(currentOffset);
    currentOffset += 2;
    this.extensionHeaderLength = buffer.readUInt16BE(currentOffset);
    currentOffset += 2;
    this.extension = buffer.slice(currentOffset, currentOffset += this.extensionHeaderLength / 32);
  }
  this.payload = buffer.slice(currentOffset);

  return this;
};

/**
* Generates the buffer of the message. It is then available as the .buffer property.
* @returns {RTPMessage} self
*/
RTPMessage.prototype.generateBuffer = function generateBuffer() {
  let bufferLength = 12;
  let i;
  let length;

  bufferLength += ((this.csrcs.length > 15 ? 15 : this.csrcs.length) * 15);
  if (this.hasExtension) {
    bufferLength += 4 * (this.extension.length + 1);
  }
  const payLoadOffset = bufferLength;
  if (Buffer.isBuffer(this.payload)) {
    bufferLength += this.payload.length;
  }

  const buffer = Buffer.alloc(bufferLength);

  let firstByte = 0;
  firstByte |= this.version << 6;
  firstByte |= this.padding ? 0x20 : 0;
  firstByte |= this.hasExtension ? 0x10 : 0;
  firstByte |= (this.csrcs.length > 15 ? 15 : this.csrcs.length);

  const secondByte = this.payloadType | (this.marker ? 0x80 : 0);

  buffer.writeUInt8(firstByte, 0);
  buffer.writeUInt8(secondByte, 1);
  buffer.writeUInt16BE(this.sequenceNumber, 2);
  buffer.writeUInt32BE(this.timestamp << 0, 4);

  buffer.writeUInt32BE(this.ssrc, 8);

  for (i = 0; i < this.csrcs && i < 15; i += 1) {
    buffer.writeUInt32BE(this.csrcs[i], 12 + (4 * i));
  }

  if (this.hasExtension) {
    length = Math.ceil(this.extension.length / 32);
    buffer.writeUInt16BE(this.extensionHeaderId, 12 + (4 * i));
    buffer.writeUInt16BE(length, 14 + (4 * i));
    this.extension.copy(buffer, 16 + (4 * i));
  }

  if (Buffer.isBuffer(this.payload)) {
    this.payload.copy(buffer, payLoadOffset);
  }

  this.buffer = buffer;
  return this;
};

module.exports = RTPMessage;
