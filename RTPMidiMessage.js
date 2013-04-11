"use strict";

var util            = require("util"),
    RTPMessage      = require("./RTPMessage"),
    types_data_length = {
        0xe0: 2, 0xd0: 1, 0xc0: 1, 0xb0: 2, 0xa0: 2, 0x90: 2, 0x80: 2
    },
    flags = {
        system_message: 0xf0
    };

// Helper functions
function intToArray(int, numberOfOctets) {
    var array = [],
        i = numberOfOctets -1;
    while (i >= 0) {
        var div = Math.pow(2, 8 * i);
        array.push(Math.floor(int / div));
        int = int % div;
        i--;
    }
    return array;
}

function pad(string, count) {
    while (string.length < count) {
        string = '0' + string;
    }
    return string;
}

function RTPMidiMessage() {
    RTPMessage.apply(this);
    this.bigLength = false;
    this.hasJournal = false;
    this.firstHasDeltaTime = false;
    this.p = false;
    this.commands = [];
    this.isValid = true;
    this.payloadType = 0x61;
}

util.inherits(RTPMidiMessage, RTPMessage);

RTPMidiMessage.prototype.parseBuffer = function parseBuffer(buffer) {
    RTPMessage.prototype.parseBuffer.apply(this, arguments);
    if (Buffer.isBuffer(buffer)) {
        var payload = this.payload;
        var bitmask = payload.readInt8(0).toString(2);
        this.bigLength = !!parseInt(bitmask[0], 2);
        this.hasJournal = !!parseInt(bitmask[1], 2);
        this.firstHasDeltaTime = !!parseInt(bitmask[2], 2);
        this.p = !!parseInt(bitmask[3], 2);
        if (this.bigLength) {
            this.length = parseInt(bitmask.slice(4) + payload.readInt8(1).toString(2), 2);
        } else {
            this.length = parseInt(bitmask.slice(4), 2);
        }

        // Read the command section
        var commandStartOffset = this.bigLength ? 2 : 1;
        var offset = commandStartOffset;
        var lastStatusByte = null;
        while (offset < this.length + commandStartOffset -1) {
            var command = {};
            // Decode the delta time
            if (this.commands.length == 0 && this.firstHasDeltaTime === false) {
                command.deltaTime = 0;
            } else {
                var deltaTimeBitMask = '';
                for (var k = 0; k < 3; k++) {
                    var currentOctet = payload.readInt8(offset).toString(2);
                    offset++;
                    deltaTimeBitMask += currentOctet.slice(1);
                    if (currentOctet[1] !== '1') {
                        break;
                    }
                }
                command.deltaTime = parseInt(deltaTimeBitMask, 2);
            }
            var statusByte = payload[offset];
            var hasOwnStatusByte = (statusByte & 0x80) == 0x80;
            if(hasOwnStatusByte) {
                lastStatusByte = statusByte;
                offset++;
            } else if (lastStatusByte)  {
                statusByte = lastStatusByte;
            }
            var data_length = types_data_length[statusByte & 0xf0] || 0;
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
    }
    return this;
};

RTPMidiMessage.prototype.generateBuffer = function generateBuffer() {
    var payload = [],
        lastStatusOctet = null,
        i, command,
        statusByte, lastStatusByte,
        headerBuffer, buffer;

    for (i = 0; i < this.commands.length; i++) {
        command = this.commands[i];
        if (i == 0 && command.deltaTime === 0) {
            this.firstHasDeltaTime = false;
        } else {
            var d = command.deltaTime.toString(2);
            if (command.deltaTime <= 0xef) {
                payload.push.apply(payload, intToArray(parseInt(d.slice(24), 2), 1));
            } else if (command.deltaTime <= 0xefff) {
                payload.push.apply(payload, intToArray(parseInt('1' + d.slice(18, 25) + '0' + d.slice(25)), 2));
            } else if (command.deltaTime <= 0xefffff) {
                payload.push.apply(payload, intToArray(parseInt('1' + d.slice(11, 18) + '1' + d.slice(18, 25) + '0' + d.slice(25)), 3));
            } else if (command.deltaTime <= 0xefffffff) {
                payload.push.apply(payload, intToArray(parseInt('1' + d.slice( 4, 11) + '1' + d.slice(11, 18) + '1' + '1' + d.slice(18, 25) + '0' + d.slice(25)), 4));
            }
        }
        statusByte = command.data[0];
        var data_length = (types_data_length[statusByte & 0xf0] || 0);

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

    var bitmask = '';

    this.bigLength = payload.length > 15;

    bitmask += this.bigLength ? '1' : '0';
    bitmask += this.hasJournal ? '1' : '0';
    bitmask += this.firstHasDeltaTime ? '1' : '0';
    bitmask += this.p ? '1' : '0';

    bitmask += pad(payload.length.toString(2), this.bigLength ? 12 : 4);
    var bytes = intToArray(parseInt(bitmask, 2), this.bigLength ? 2 : 1);

    buffer = new Buffer(payload.length + bytes.length);
    for (i = 0; i < bytes.length; i++) {
        buffer[i] = bytes[i];
    }

    for (i = 0; i < payload.length; i++) {
        buffer[i + bytes.length] = payload[i];
    }
    this.payload = buffer;

    RTPMessage.prototype.generateBuffer.apply(this);
    return this;
};

module.exports = RTPMidiMessage;



