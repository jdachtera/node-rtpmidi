"use strict";

var util = require("util"),
    Message = require("./Message"),
    commands = {
        invitation: 0x494E,
        invitation_rejected: 0x4E4F,
        invitation_accepted: 20299,
        end: 0x4259,
        synchronization: 0x434B,
        receiver_feedback: 0x5253,
        bitrate_receive_limit: 0x524C
    },
    flags = {
        start: 0xFFFF
    };

function ControlMessage(buffer) {
    Message.apply(this);
    this.start = flags.start;
    this.version = 2;
}

util.inherits(ControlMessage, Message);

ControlMessage.prototype.name = '';
ControlMessage.prototype.isValid = true;

ControlMessage.prototype.parseBuffer = function parseBuffer(buffer) {
    this.buffer = buffer;
    if (Buffer.isBuffer(buffer)) {
        this.start = buffer.readUInt16BE(0);
        if (this.start !== flags.start) {
            this.isValid = false;
            return this;
        }
        var commandInt = buffer.readUInt16BE(2);
        for (var command in commands) {
            if (commandInt === commands[command]) {
                this.command = command;
            }
        }
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
            buffer.writeUInt16BE(commands[this.command], 2);
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
            buffer.writeUInt16BE(commands[this.command], 2);
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
    }
    this.buffer = buffer;
    return this;
};

module.exports = ControlMessage;

