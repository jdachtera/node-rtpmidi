var util = require("util"),
EventEmitter = require("events").EventEmitter;

function MTC() {
  EventEmitter.apply(this);
  this.hours = 0;
  this.minutes = 0;
  this.seconds = 0;
  this.frames = 0;
  this.type = 0;
  this.songPosition = 0;
};

util.inherits(MTC, EventEmitter);


MTC.prototype.setSource = function(sessionOrStream) {
  sessionOrStream.on('message', function(deltaTime, message) {
    if (message[0] === 0xf1) {
      this.applyQuarterTime(message);
    } else if (
      message[0] == 0xf0 &&
      message[1] == 0x7f &&
      message[3] == 0x01 &&
      message[4] == 0x01
      ) {
        this.applyFullTime(message)
      } else if (message[0] == 0xf2) {
        this.applySongPosition(message);
      }
    }.bind(this));
  };
  
  
  MTC.prototype.applySongPosition = function(message) {
    var before = this.songPosition;
    this.songPosition = message[2];
    this.songPosition <<= 7;
    this.songPosition |= message[1];
    if (this.songPosition !== before) {
      this.emit('change');
    }
  };
  
  MTC.prototype.applyFullTime = function(message) {
    var originalString = this.toString();
    
    this.type = (message[5] >> 5) & 0x3;
    
    this.hours = message[5] & 0x1f;
    this.minutes = message[6];
    this.seconds = message[7];
    this.frames = message[8];
    
    if (this.toString() !== originalString) {
      this.emit('change');
    }
  };
  
  // Build the MTC timestamp of 8 subsequent quarter time commands
  // http://www.blitter.com/~russtopia/MIDI/~jglatt/tech/mtc.htm
  MTC.prototype.applyQuarterTime = function(message) {
    
    var quarterTime = message[1],
    type = (quarterTime >> 4) & 0x7,
    nibble = quarterTime & 0x0f,
    operator;
    
    if (type % 2 === 0) {
      // Low nibble
      operator = 0xf0;		
    } else {
      // High nibble
      nibble = nibble << 4;
      operator = 0x0f;
    }
    
    switch(type) {
      case 0:
      case 1:
      this.frames = this.frames & operator | nibble;
      break;
      case 2:		
      case 3:
      this.seconds = this.seconds & operator | nibble;
      break;
      case 4:
      case 5:
      this.minutes = this.minutes & operator | nibble;
      break;
      case 6:
      this.hours = this.hours & operator | nibble;
      break;
      case 7:
      this.type = (nibble >> 5) & 0x3;
      nibble = nibble & 0x10;
      this.hours = this.hours & operator | nibble;
      this.emit('change');
      break;
    }
  };
  
  function pad(number) {
    if (number < 10) {
      return '0' + number;
    } else {
      return number.toString();
    }
  }
  
  MTC.prototype.getSMTPEString = function() {
    return pad(this.hours) + ':' + pad(this.minutes) + ':' + pad(this.seconds) + ':' + pad(this.frames);
  }
  
  module.exports = MTC;
  