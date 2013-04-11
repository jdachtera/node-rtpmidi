"use strict";

var util            = require("util"),
    Message         = require("./Message");

/**
 * This represents RTP Protocol message.
 * @constructor
 */
function RTPMessage() {
    Message.apply(this);
    this.version = 2;
    this.padding = false;
    this.hasExtension = false;
    this.csrcCount = 0;
    this.marker = false;
    this.payloadType = 0;
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = 0;
    this.csrcs = [];
}

util.inherits(RTPMessage, Message);

/**
 * Parses a Buffer into this RTPMessage object
 * @param {Buffer} The buffer containing a RTP Message
 * @returns {Buffer} self
 */
RTPMessage.prototype.parseBuffer = function parseBuffer(buffer) {
    if (Buffer.isBuffer(buffer)) {
        this.buffer = buffer;
        var firstByte = buffer.readUInt8(0);

        this.version = firstByte >>> 6;
        this.padding = !!(firstByte >>> 5 & 1);
        this.hasExtension = !!(firstByte >>> 4 & 1);
        this.csrcCount = firstByte & 0xF;

        var secondByte = buffer.readUInt8(1);
        this.marker = (secondByte & 0x80) == 0x80;
        this.payloadType = secondByte & 0x7f;

        this.sequenceNumber = buffer.readUInt16BE(2);
        this.timestamp = buffer.readUInt32BE(4);
        this.ssrc = buffer.readUInt32BE(8);
        var currentOffset = 12;
        for (var i = 0; i < this.csrcCount; i++) {
            this.csrcs.push(buffer.readUInt32BE(currentOffset));
            i++;
        }
        if (this.hasExtension) {
            this.extensionHeaderId = buffer.readUInt16BE(currentOffset);
            currentOffset += 2;
            this.extensionHeaderLength = buffer.readUInt16BE(currentOffset);
            currentOffset += 2;
            this.extension = buffer.slice(currentOffset, currentOffset += this.extensionHeaderLength / 32);
        }
        this.payload = buffer.slice(currentOffset);
    }
    return this;
};

/**
 * Generates the buffer of the message. It is then available as the .buffer property.
 * @returns {RTPMessage} self
 */
RTPMessage.prototype.generateBuffer = function generateBuffer() {
    var bufferLength = 12;
    bufferLength += ((this.csrcs.length > 15 ? 15 : this.csrcs.length) * 15);
    if (this.hasExtension) {
        bufferLength += 4 * (this.extension.length + 1);
    }
    var payLoadOffset = bufferLength;
    if (this.payload) {
        bufferLength += this.payload.length;
    }

    var buffer = new Buffer(bufferLength);

    var firstByte = 0;
    firstByte |= this.version << 6;
    firstByte |= this.padding ? 0x20 : 0;
    firstByte |= this.hasExtension ? 0x10 : 0;
    firstByte |= (this.csrcs.length > 15 ? 15 : this.csrcs.length);

    var secondByte = this.payloadType | (this.marker ? 0x80 : 0);

    buffer.writeUInt8(firstByte				, 0);
    buffer.writeUInt8(secondByte    		, 1);
    buffer.writeUInt16BE(this.sequenceNumber, 2);
    buffer.writeUInt32BE(this.timestamp	<< 0, 4);

    buffer.writeUInt32BE(this.ssrc			, 8);

    for (var i = 0; i < this.csrcs && i < 15; i++) {
        buffer.writeUInt32BE(this.csrcs[i], 12 + (4 * i));
    }

    if (Buffer.isBuffer(this.extension)) {
        var length = Math.ceil(this.extension.length / 32);
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