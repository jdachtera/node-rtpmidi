"use strict";

var util = require("util"),
    RTPMessage = require("./RTPMessage"),
    midiCommon = require("midi-common"),
    log = require('./log'),

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

function getDataLength(command) {
  var type = (midiCommon.commands[command] || midiCommon.commands[command & 0xf0]);
  return type ? type.dataLength || 0 : 0;
}

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
        this.length = (this.length << 8) + payload.readUInt8(1);
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
            command.deltaTime /= 100;
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
            while (payload.length > offset + data_length && !(payload.readUInt8(offset + data_length) & 0x80)) {
                data_length++;
            }
            if (payload.readUInt8(offset + data_length) !== 0xf7) {
              data_length--;
            }

            data_length++;

        } else {
            data_length = getDataLength(statusByte);
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
};

MidiMessage.prototype.generateBuffer = function generateBuffer() {
  var payload,
    payloadLength = 1,
    payloadOffset = 0,
    i,
    k,

    command,
    commandData,
    commandDataLength,
    commandDeltaTime,
    commandStatusByte = null,

    expectedDataLength,

    lastStatusByte,

    length,

    bitmask;

  this.firstHasDeltaTime = true;

  for (i = 0; i < this.commands.length; i++) {
    command = this.commands[i];
    command._length = 0;
    commandData = command.data;
    commandDataLength = commandData.length;


    if (i == 0 && command.deltaTime === 0) {
      this.firstHasDeltaTime = false;
    } else {
      commandDeltaTime = Math.round(command.deltaTime * 100);

      if (commandDeltaTime >= 0x7fffff) {
        command._length++;
      }
      if (commandDeltaTime >= 0x7fff) {
        command._length++;
      }
      if (commandDeltaTime >= 0x7f) {
        command._length++;
      }
      command._length++;
    }
    commandStatusByte = command.data[0];

    if (commandStatusByte === 0xf0) {
      expectedDataLength = 0;
      while (expectedDataLength + 1 < commandDataLength && command.data[expectedDataLength] !== 0xf7) {
        expectedDataLength++;
      }
    } else {
      expectedDataLength = getDataLength(commandStatusByte);
    }

    if (expectedDataLength + 1 !== commandDataLength) {
      command._length = 0;
    } else {
      command._length += expectedDataLength;
      if (commandStatusByte !== lastStatusByte) {
        command._hasOwnStatusByte =	true;
        lastStatusByte = commandStatusByte;
        command._length++
      } else {
        command._hasOwnStatusByte =	false;
      }
      payloadLength += command._length;
    }
  }
  length = payloadLength - 1;

  this.bigLength = length > 15;

  if (this.bigLength) {
    payloadLength++;
  }

  payload = new Buffer(payloadLength);

  bitmask = 0;
  bitmask |= this.hasJournal ? flags.hasJournal : 0;
  bitmask |= this.firstHasDeltaTime ? flags.firstHasDeltaTime : 0;
  bitmask |= this.p ? flags.p : 0;

  if (this.bigLength) {
    bitmask |= flags.bigLength;
    bitmask |= 0x0f & (length >> 8);
    payload[1] = 0xff & (length);
    payloadOffset++
  } else {
    bitmask |= 0x0f & (length);
  }

  payload[0] = bitmask;
  payloadOffset++;

  for (i = 0; i < this.commands.length; i++) {
    command = this.commands[i];

    if (command._length > 0) {
      if (i > 0 || this.firstHasDeltaTime) {
        commandDeltaTime = Math.round(command.deltaTime * 100);

        if (commandDeltaTime >= 0x7fffff) {
          payload[payloadOffset++] = 0x80 | commandDeltaTime >> 21;
        }
        if (commandDeltaTime >= 0x7fff) {
          payload[payloadOffset++] = 0x80 | commandDeltaTime >> 14;
        }
        if (commandDeltaTime >= 0x7f) {
          payload[payloadOffset++] = 0x80 | commandDeltaTime >> 7;
        }
        payload[payloadOffset++] = 0xef & commandDeltaTime;
      }

      commandData = command.data;
      commandDataLength = commandData.length;

      k = command._hasOwnStatusByte ? 0 : 1;

      while(k < commandDataLength) {
        payload[payloadOffset++] = commandData[k];
        k++;
      }
    } else {
      log(3, 'Ignoring invalid command');
    }


  }
  this.payload = payload;

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
