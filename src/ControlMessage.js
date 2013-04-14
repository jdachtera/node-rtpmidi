"use strict";

var util = require("util"),
	assert = require('assert'),
    AbstractMessage = require("./AbstractMessage"),
    byteToCommand = {
        0x494E: 'invitation',
        0x4E4F: 'invitation_rejected',
        0x4F4B: 'invitation_accepted',
        0x4259: 'end',
        0x434B: 'synchronization',
        0x5253: 'receiver_feedback',
        0x524C: 'bitrate_receive_limit'
    },
	commandToByte = (function() {
		var obj = {};
		for (var key in byteToCommand) {
			if (byteToCommand.hasOwnProperty(key)) {
				obj[byteToCommand[key]] = key;
			}
		}
		return obj;
	})(),
    flags = {
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
	assert(this.start === flags.start, 'No valid control message');
    this.command = byteToCommand[buffer.readUInt16BE(2)];
	assert(!!this.command, 'Not a valid command');
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
            this.timestamp1 = [buffer.readUInt32BE(12), buffer.readUInt32BE(16)];
            this.timestamp2 = [buffer.readUInt32BE(20), buffer.readUInt32BE(24)];
            this.timestamp3 = [buffer.readUInt32BE(28), buffer.readUInt32BE(32)];
    }
    return this;
};

ControlMessage.prototype.generateBuffer = function generateBuffer() {
    var buffer;
    switch (this.command) {
        case 'invitation':
        case 'invitation_accepted':
        case 'invitation_rejected':
        case 'end':
            buffer = new Buffer(17 + Buffer.byteLength(this.name, 'utf8'));
            buffer.writeUInt16BE(this.start, 0);
            buffer.writeUInt16BE(commandToByte[this.command], 2);
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
            buffer.writeUInt16BE(commandToByte[this.command], 2);
            buffer.writeUInt32BE(this.ssrc, 4);
            buffer.writeUInt8(this.count, 8);
            buffer.writeUInt8(this.padding >>> 0xF0, 9);
            buffer.writeUInt16BE(this.padding & 0x00FFFF, 10);

            buffer.writeUInt32BE(this.timestamp1[0], 12);
            buffer.writeUInt32BE(this.timestamp1[1], 16);
            buffer.writeUInt32BE(this.timestamp2[0], 20);
            buffer.writeUInt32BE(this.timestamp2[1], 24);
            buffer.writeUInt32BE(this.timestamp3[0], 28);
            buffer.writeUInt32BE(this.timestamp3[1], 32);
            break;
		default:
			assert.fail('Not a valid command: "' + this.command + '"');
			break;
    }
    this.buffer = buffer;
    return this;
};

module.exports = ControlMessage;
