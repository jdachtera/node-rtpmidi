"use strict";

var util = require("util"),
    RTPMessage = require("./RTPMessage"),
    types_data_length = {
        0xe0: 2,
        0xd0: 1,
        0xc0: 1,
        0xb0: 2,
        0xa0: 2,
        0x90: 2,
        0x80: 2
    },
    flags = {
        systemMessage: 0xf0,
        maskDeltaTimeByte: 0xef,
        maskLengthInFirstByte: 0x0f,
        deltaTimeHasNext: 0x80,
        commandStart: 0x80,
        bigLength: 0x80,
        hasJournal: 0x40,
        firstHasDeltaTime: 0x20,
        p: 0x10
    };

function MidiMessage() {
    RTPMessage.apply(this);
    this.bigLength = false;
    this.hasJournal = false;
    this.firstHasDeltaTime = false;
    this.p = false;
    this.commands = [];
    this.isValid = true;
    this.payloadType = 0x61;
}

util.inherits(MidiMessage, RTPMessage);

MidiMessage.prototype.parseBuffer = function parseBuffer(buffer) {
    RTPMessage.prototype.parseBuffer.apply(this, arguments);
    var payload = this.payload,
        firstByte = payload.readUInt8(0),
        commandStartOffset,
        offset,
        statusByte,
        lastStatusByte = null,
        hasOwnStatusByte,
        data_length;

    this.bigLength = !!(firstByte & flags.bigLength);
    this.hasJournal = !!(firstByte & flags.hasJournal);
    this.firstHasDeltaTime = !!(firstByte & flags.firstHasDeltaTime);
    this.p = !!(firstByte & flags.p);

    this.length = (firstByte & flags.maskLengthInFirstByte);

    if (this.bigLength) {
        this.length = this.length << 8 + payload.readUInt8(1);
    }

    // Read the command section
    commandStartOffset = this.bigLength ? 2 : 1;
    offset = commandStartOffset;

    while (offset < this.length + commandStartOffset - 1) {
        var command = {
            deltaTime: 0
        };
        // Decode the delta time
        if (this.commands.length || this.firstHasDeltaTime) {
            for (var k = 0; k < 3; k++) {
                var currentOctet = payload.readUInt8(offset);
                offset++;
                command.deltaTime <<= 7;
                command.deltaTime += currentOctet & flags.maskDeltaTimeByte;
                if (!(currentOctet & flags.deltaTimeHasNext)) {
                    break;
                }
            }
        }

        statusByte = payload.readUInt8(offset);
        hasOwnStatusByte = (statusByte & 0x80) == 0x80;
        if (hasOwnStatusByte) {
            lastStatusByte = statusByte;
            offset++;
        } else if (lastStatusByte) {
            statusByte = lastStatusByte;
        }
        if (statusByte === 0xf0) {
            data_length = 1;
            while (payload.length > offset + data_length && payload.readUInt8(offset + data_length) !== 0xf7) {
                data_length++;
            }
        } else {
            data_length = types_data_length[statusByte & 0xf0];
        }
        command.data = new Buffer(1 + data_length);
        command.data[0] = statusByte;
        if (payload.length < offset + data_length) {
            this.isValid = false;
            return;
        }
        if (data_length) {
            payload.copy(command.data, 1, offset, offset + data_length);
            offset += data_length;
        }

        this.commands.push(command);
    }
    return this;
};

MidiMessage.prototype.generateBuffer = function generateBuffer() {
    var payload = [],
        i,
        command,
        statusByte,
        lastStatusByte,
        bitmask,
        d,
        data_length;

    for (i = 0; i < this.commands.length; i++) {
        command = this.commands[i];
        if (i == 0 && command.deltaTime === 0) {
            this.firstHasDeltaTime = false;
        } else {
            d = command.deltaTime;

            if (d >= 0x7fffff) {
                payload.push((0x80 | d >> 21))
            }
            if (d >= 0x7fff) {
                payload.push((0x80 | d >> 14))
            }
            if (d >= 0x7f) {
                payload.push((0x80 | d >> 7))
            }
            payload.push(0xef & d);
        }
        statusByte = command.data[0];
        data_length = (types_data_length[statusByte & 0xf0] || 0);

        if (data_length + 1 !== command.data.length) {
            this.isValid = false;
            return this;
        }
        if (statusByte !== lastStatusByte) {
            lastStatusByte = statusByte;
            payload.push.apply(payload, command.data);
        } else {
            payload.push.apply(payload, command.data.slice(1));
        }
    }

    this.bigLength = payload.length > 15;

    bitmask = 0;
    bitmask |= this.bigLength ? (flags.bigLength | payload.length >> 8) : payload.length;
    bitmask |= this.hasJournal ? flags.hasJournal : 0;
    bitmask |= this.firstHasDeltaTime ? flags.firstHasDeltaTime : 0;
    bitmask |= this.p ? flags.p : 0;

    if (this.bigLength) {
        payload.unshift(0xff & payload.length, 1);
    }

    payload.unshift(bitmask);
    this.payload = new Buffer(payload);

    RTPMessage.prototype.generateBuffer.apply(this);
    return this;
};

module.exports = MidiMessage;
