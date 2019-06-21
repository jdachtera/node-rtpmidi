"use strict";

var util = require("util"),
RTPMessage = require("./RTPMessage"),
midiCommon = require("midi-common"),
log = require('./log'),

flag_systemMessage = 0xf0,
flag_maskDeltaTimeByte = 0x7f,
flag_maskLengthInFirstByte = 0x0f,
flag_deltaTimeHasNext = 0x80,
flag_commandStart = 0x80,
flag_bigLength = 0x80,
flag_hasJournal = 0x40,
flag_firstHasDeltaTime = 0x20,
flag_p = 0x10;


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
  
  this.bigLength = !!(firstByte &  flag_bigLength);
  this.hasJournal = !!(firstByte &  flag_hasJournal);
  this.firstHasDeltaTime = !!(firstByte &  flag_firstHasDeltaTime);
  this.p = !!(firstByte &  flag_p);
  
  this.length = (firstByte &  flag_maskLengthInFirstByte);
  
  if (this.bigLength) {
    this.length = (this.length << 8) + payload.readUInt8(1);
  }
  
  // Read the command section
  commandStartOffset = this.bigLength ? 2 : 1;
  offset = commandStartOffset;
  
  while (offset < this.length + commandStartOffset - 1) {
    var command = {},
    deltaTime = 0;
    
    // Decode the delta time
    if (this.commands.length || this.firstHasDeltaTime) {
      for (var k = 0; k < 4; k++) {
        var currentOctet = payload.readUInt8(offset);
        
        deltaTime <<= 7;
        deltaTime |= currentOctet &  flag_maskDeltaTimeByte;
        offset++;
        if (!(currentOctet &  flag_deltaTimeHasNext)) {
          break;
        }
      }
    }
    command.deltaTime = deltaTime;
    
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
    if (!(command.data[0] === 0xf0 && command.data[command.data.length - 1] !== 0xf7)) {
      this.commands.push(command);
    } else {          
      return this;
    }
    
  }
  if (this.hasJournal) {
    this.journalOffset = offset;
    this.journal = this.parseJournal();      
  }
  return this;
};

MidiMessage.prototype.parseJournal = function() {
  var offset = this.journalOffset, payload = this.payload, presentChapters;
  
  var journal = {};
  var journalHeader = payload[offset];
  
  journal.singlePacketLoss = !!(journalHeader & 0x80);
  journal.hasSystemJournal = !!(journalHeader & 0x40);
  journal.hasChannelJournal = !!(journalHeader & 0x20);
  journal.enhancedEncoding = !!(journalHeader & 0x10);
  
  journal.checkPointPacketSequenceNumber = payload.readUInt16BE(offset + 1);
  journal.channelJournals = [];
  
  offset += 3;
  
  if (journal.hasSystemJournal) {
    var systemJournal = journal.systemJournal =  {};
    presentChapters = systemJournal.presentChapters = {};
    presentChapters.S = !!(payload[offset] & 0x80);
    presentChapters.D = !!(payload[offset] & 0x40);
    presentChapters.V = !!(payload[offset] & 0x20);
    presentChapters.Q = !!(payload[offset] & 0x10);
    presentChapters.F = !!(payload[offset] & 0x08);
    presentChapters.X = !!(payload[offset] & 0x04);
    systemJournal.length = ((payload[offset] & 0x3) << 8) | payload[offset + 1];
    offset += systemJournal.length;
  }
  
  if (journal.hasChannelJournal) {
    var channel = 0,
    channelJournal;
    
    journal.totalChannels = (journalHeader & 0x0f) + 1;
    while (channel < journal.totalChannels && offset < payload.length) {
      channelJournal = {};
      channelJournal.channel = (payload[offset] >> 3) & 0x0f;
      channelJournal.s = !!(payload[offset] & 0x80);
      channelJournal.h = !!(payload[offset] & 0x01);
      channelJournal.length = ((payload[offset] & 0x3) << 8) | payload[offset + 1];
      presentChapters = channelJournal.presentChapters = {};
      presentChapters.P = !!(payload[offset + 2] & 0x80);
      presentChapters.C = !!(payload[offset + 2] & 0x40);
      presentChapters.M = !!(payload[offset + 2] & 0x20);
      presentChapters.W = !!(payload[offset + 2] & 0x10);
      presentChapters.N = !!(payload[offset + 2] & 0x08);
      presentChapters.E = !!(payload[offset + 2] & 0x04);
      presentChapters.T = !!(payload[offset + 2] & 0x02);
      presentChapters.A = !!(payload[offset + 2] & 0x01);
      
      offset += channelJournal.length;
      
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
      commandDeltaTime = Math.round(command.deltaTime);
      
      if (commandDeltaTime >= 0x7f7f7f) {
        command._length++;
      }
      if (commandDeltaTime >= 0x7f7f) {
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
  bitmask |= this.hasJournal ?  flag_hasJournal : 0;
  bitmask |= this.firstHasDeltaTime ?  flag_firstHasDeltaTime : 0;
  bitmask |= this.p ?  flag_p : 0;
  
  if (this.bigLength) {
    bitmask |=  flag_bigLength;
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
        commandDeltaTime = Math.round(command.deltaTime);
        
        if (commandDeltaTime >= 0x7f7f7f) {
          payload.writeUInt8(0x80 | (0x7f & (commandDeltaTime >> 21)), payloadOffset++);
        }
        if (commandDeltaTime >= 0x7f7f) {
          payload.writeUInt8(0x80 | (0x7f & (commandDeltaTime >> 14)), payloadOffset++);
        }
        if (commandDeltaTime >= 0x7f) {
          payload.writeUInt8(0x80 | (0x7f & (commandDeltaTime >> 7)), payloadOffset++);
        }
        payload.writeUInt8(0x7f & commandDeltaTime, payloadOffset++);
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
