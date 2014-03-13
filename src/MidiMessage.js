"use strict";

var util = require("util"),
    RTPMessage = require("./RTPMessage"),
    types_data_length = {

        // Channel Messages
        0x80: 2, // Note Off
        0x90: 2, // Note On
        0xa0: 2, // Polyphonic aftertouch
        0xb0: 2, // Control/Mode Change
        0xc0: 1, // Program Change
        0xd0: 1, // Channel Aftertouch
        0xe0: 2, // Pitch Wheel

        // System Common Messages
        /*
        0xf0: SysEx Start, length is determined by SysEx end byte
        */
        0xf1: 1, // Quarter time
        0xf2: 2, // Song Position Pointer
        0xf3: 1, // Song select
        /*
        0xf4: Undefined
        0xf5: Undefined
        */
        0xf6: 0, // Tune request (no data)
        /*
        0xf7: End of SysEx
        */

        // System Realtime Messages
        0xf8: 0, // Timing clock
        0xfa: 0, // Start
        0xfb: 0, // Continue
        0xfc: 0, // Stop
        /*
        0xfd: Undefined
        */
        0xfe: 0, // Active Sensing
        0xff: 0  // System Reset
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

        // Parse SysEx
        if (statusByte === 0xf0) {
            data_length = 0;
            while (payload.length > offset + data_length && payload.readUInt8(offset + data_length) !== 0xf7) {
                data_length++;
            }
            data_length++;

        } else {
            data_length = types_data_length[statusByte] || types_data_length[statusByte & 0xf0];
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
    if (this.hasJournal) {        
        this.journal = this.parseJournal(this.payload.slice(offset));            
    }
    return this;
};

MidiMessage.prototype.parseJournal = function(payload) {
    var journal = {};
    var journalHeader = payload[0];

    journal.singlePacketLoss = !!(journalHeader & 0x80);
    journal.hasSystemJournal = !!(journalHeader & 0x40);
    journal.hasChannelJournal = !!(journalHeader & 0x20);
    journal.enhancedEncoding = !!(journalHeader & 0x10);
    
    journal.checkPointPacketSequenceNumber = payload.readUInt16BE(1);
    journal.channelJournals = [];

    var journalOffset = 3;

    if (journal.hasSystemJournal) {
        var systemJournal = journal.systemJournal =  {};
        systemJournal.presentChapters = {};
        systemJournal.presentChapters.S = !!(payload[journalOffset] & 0x80);
        systemJournal.presentChapters.D = !!(payload[journalOffset] & 0x40);
        systemJournal.presentChapters.V = !!(payload[journalOffset] & 0x20);
        systemJournal.presentChapters.Q = !!(payload[journalOffset] & 0x10);
        systemJournal.presentChapters.F = !!(payload[journalOffset] & 0x08);
        systemJournal.presentChapters.X = !!(payload[journalOffset] & 0x04);
        systemJournal.length = ((payload[journalOffset] & 0x3) << 8) | payload[journalOffset + 1];
        journalOffset += systemJournal.length;
    }

    if (journal.hasChannelJournal) {
        var channel = 0,
            channelJournal;

        journal.totalChannels = (journalHeader & 0x0f) + 1;
        while (channel < journal.totalChannels && journalOffset < payload.length) {
            channelJournal = {};
            channelJournal.channel = (payload[journalOffset] >> 3) & 0x0f;
            channelJournal.s = !!(payload[journalOffset] & 0x80);
            channelJournal.h = !!(payload[journalOffset] & 0x01);
            channelJournal.length = ((payload[journalOffset] & 0x3) << 8) | payload[journalOffset + 1];
            channelJournal.presentChapters = {};
            channelJournal.presentChapters.P = !!(payload[journalOffset + 2] & 0x80);
            channelJournal.presentChapters.C = !!(payload[journalOffset + 2] & 0x40);
            channelJournal.presentChapters.M = !!(payload[journalOffset + 2] & 0x20);
            channelJournal.presentChapters.W = !!(payload[journalOffset + 2] & 0x10);
            channelJournal.presentChapters.N = !!(payload[journalOffset + 2] & 0x08);
            channelJournal.presentChapters.E = !!(payload[journalOffset + 2] & 0x04);
            channelJournal.presentChapters.T = !!(payload[journalOffset + 2] & 0x02);
            channelJournal.presentChapters.A = !!(payload[journalOffset + 2] & 0x01);

            journalOffset += channelJournal.length;

            journal.channelJournals.push(channelJournal);

            channel++;
        }
    }
    return journal;
}

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

        if (statusByte === 0xf0) {
          data_length = 0;
          while (data_length + 1 < command.data.length && command.data[data_length] !== 0xf7) {
            data_length++;
          }
        } else {
          data_length = (types_data_length[statusByte & 0xf0] || 0);
        }

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

MidiMessage.prototype.toJSON = function() {
    return {
        commands: this.commands.map(function(command) {
            return {
                deltaTime: command.deltaTime,
                data: Array.prototype.slice.apply(command.data)
            };
        })
    };
};

module.exports = MidiMessage;
