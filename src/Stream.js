// 'use strict';

const util = require("util");
const EventEmitter = require('events').EventEmitter;

const ControlMessage = require("./ControlMessage.js");
const hrtimer = require('./hrtimer');
const log = require('./log');
const MidiMessage = require("./MidiMessage.js");

// Helper functions
function generateRandomInteger(octets) {
  return Math.round(Math.random() * (8 * octets ** 2);
}

function writeUInt64BE(buffer, value) {
  const str = pad((value).toString(16), 16);	
  buffer.writeUInt32BE(0, 0);
  buffer.writeUInt32BE(parseInt(str.slice(8), 16), 4);
}

function readUInt64BE(buffer, i){
  i = i || 0;
  return buffer.readUInt32BE(i + 4);
}

function pad(number, length) {
  number = typeof number === 'string' ? number : Math.round(number || 0).toString(10);
  while (number.length < length) {
    number = '0' + number;
  }
  return number;
}

function Stream(session) {
  EventEmitter.apply(this);
  this.session = session;
  this.token = null;
  this.ssrc = null;
  this.rinfo1 = null;
  this.rinfo2 = null;
  this.name = '';
  this.lastSentSequenceNr = Math.round(Math.random() * 0xffff);
  this.firstReceivedSequenceNumber = -1;
  this.lastReceivedSequenceNumber = -1;
  this.lostSequenceNumbers = [];
  this.latency = null;
  this.subscribers = [];
  this.isConnected = false;
  this.receiverFeedbackTimeout = null;
  this.lastMessageTime = 0;
  this.timeDifference = null;
  this.isInitiator = false;
}

util.inherits(Stream, EventEmitter);

Stream.prototype.connect = function(rinfo) {
  this.isInitiator = true;
  var counter = 0;
  this.connectionInterval = setInterval(function () {
    if (counter < 40 && this.ssrc === null) {
      this.sendInvitation(rinfo);
      counter++;
    } else {
      clearInterval(this.connectionInterval);
      if (!this.ssrc) {
        log(1, "Server at " + rinfo.address + ':' + rinfo.port + ' did not respond.');
      }
    }
  }.bind(this), 1500);
};

Stream.prototype.handleControlMessage = function handleControlMessage(message, rinfo) {
  var commandName = message.command;
  var handlerName = 'handle';
  handlerName += commandName.slice(0, 1).toUpperCase();
  handlerName += commandName.slice(1);
  if (this[handlerName]) {
    // Artificial latency (for testing):
    // setTimeout(this[handlerName].bind(this, message, rinfo), 100);
    
    this[handlerName](message, rinfo);
  }
  this.emit('control-message', message);
};

Stream.prototype.handleMidiMessage = function handleMidiMessage(message) {
  if (this.firstReceivedSequenceNumber !== -1) {
    for (var i = this.lastReceivedSequenceNumber + 1; i < message.sequenceNumber; i++) {
      this.lostSequenceNumbers.push(i);
    }
  } else {
    this.firstReceivedSequenceNumber = message.sequenceNumber;
  }
  
  this.lastReceivedSequenceNumber = message.sequenceNumber;
  
  var messageTime = this.timeDifference - this.latency + message.timestamp;
  var now = this.session.now();
  
  message.commands.forEach(function(command) {
    messageTime += command.deltaTime;		
    this.emit('message',  messageTime , command.data);
  }.bind(this));
  
  clearTimeout(this.receiverFeedbackTimeout);
  this.receiverFeedbackTimeout = setTimeout(this.sendReceiverFeedback.bind(this), 1000);
};

Stream.prototype.handleInvitation_accepted = function handleInvitation_accepted(message, rinfo) {
  if (this.rinfo1 === null) {
    log(1, "Invitation Accepted by " + message.name);
    this.name = message.name;
    this.ssrc = message.ssrc;
    this.rinfo1 = rinfo;
    this.sendInvitation({
      address: rinfo.address,
      port: rinfo.port + 1
    });
    this.isConnected = true;
    this.emit('connected', {
      stream: this
    });
  } else if (this.rinfo2 === null) {
    log(1, "Data channel to " + this.name + " established");
    this.emit('established', {
      stream: this
    });
    this.rinfo2 = rinfo;
    var count = 0;
    this.syncInterval = setInterval(function () {
      this.sendSynchronization();
      count++;
      if (count > 10 || this.timeDifference) {
        clearInterval(this.syncInterval);
        this.syncInterval = setInterval(function () {
          this.sendSynchronization();
        }.bind(this), 10000)
      }
    }.bind(this), 1500);
  }
};

Stream.prototype.handleInvitation_rejected = function handleInvitation_accepted(message, rinfo) {
  clearInterval(this.connectionInterval);
  log(1, 'Invititation was rejected by ' + rinfo.address + ':' + rinfo.port);
  this.session.removeStream(this);
};

Stream.prototype.handleInvitation = function handleInvitation(message, rinfo) {
  if (this.rinfo1 === null) {
    this.rinfo1 = rinfo;
    this.token = message.token;
    this.name = message.name;
    this.ssrc = message.ssrc;
    log(1, "Got an invitation from " + message.name + " on channel 1");
  } else if (this.rinfo2 == null) {
    this.rinfo2 = rinfo;
    log(1, "Got an invitation from " + message.name + " on channel 2");
    this.isConnected = true;
    this.emit('connected', {
      stream: this
    });
  }
  this.sendInvitationAccepted(rinfo);
};

Stream.prototype.handleSynchronization = function handleSynchronization(message) {
  this.sendSynchronization(message);
};

Stream.prototype.handleEnd = function handleEndstream() {
  log(1, this.name + " ended the stream");
  clearInterval(this.syncInterval);
  this.isConnected = false;
  this.emit('disconnected', {
    stream: this
  });
};

Stream.prototype.handleReceiver_feedback = function(message) {
  log(4, 'Got receiver feedback', 'SSRC ' + message.ssrc + ' is at ' + message.sequenceNumber + '. Current is ' + this.lastSentSequenceNr);
};

Stream.prototype.sendInvitation = function sendInvitation(rinfo) {
  if (!this.token) {
    this.token = generateRandomInteger(4);
  }
  this.session.sendUdpMessage(rinfo, new ControlMessage().mixin({
    command: 'invitation',
    token: this.token,
    ssrc: this.session.ssrc,
    name: this.session.bonjourName
  }));
};

Stream.prototype.sendInvitationAccepted = function sendInvitationAccepted(rinfo) {
  
  this.session.sendUdpMessage(rinfo, new ControlMessage().mixin({
    command: 'invitation_accepted',
    token: this.token,
    ssrc: this.session.ssrc,
    name: this.session.bonjourName
  }));
};

Stream.prototype.sendEndstream = function sendEndstream(callback) {
  this.session.sendUdpMessage(this.rinfo1, new ControlMessage().mixin({
    command: 'end',
    token: this.token,
    ssrc: this.session.ssrc,
    name: this.name
  }), callback);
};

Stream.prototype.sendSynchronization = function sendSynchronization(incomingSyncMessage) {
  var now = this.session.now();
  var count = incomingSyncMessage ? incomingSyncMessage.count : -1;    
  var answer = new ControlMessage();
  
  answer.command = 'synchronization';
  answer.timestamp1 = count !== -1 ? incomingSyncMessage.timestamp1 : new Buffer(8);
  answer.timestamp2 = count !== -1 ? incomingSyncMessage.timestamp2 : new Buffer(8);
  answer.timestamp3 = count !== -1 ? incomingSyncMessage.timestamp3 : new Buffer(8);
  answer.count = count + 1;
  answer.ssrc = this.session.ssrc;
  answer.token = this.token;
  var timestamp;
  switch (count) {
    case -1:
    writeUInt64BE(answer.timestamp1, now);
    if (this.timeDifference) {
      writeUInt64BE(answer.timestamp2, now - this.timeDifference);
    } else {
      writeUInt64BE(answer.timestamp2, 0);
    }
    if (this.latency) {
      writeUInt64BE(answer.timestamp3, now + this.latency);
    } else {
      writeUInt64BE(answer.timestamp3, 0);
    }			
    break;
    case 0:			
    //this.timeDifference = now - readUInt64BE(incomingSyncMessage.timestamp1);
    writeUInt64BE(answer.timestamp2, now);
    writeUInt64BE(answer.timestamp3, now - this.timeDifference);
    break;
    case 1:			
    writeUInt64BE(answer.timestamp3, now);			
    this.latency = readUInt64BE(incomingSyncMessage.timestamp3) - readUInt64BE(incomingSyncMessage.timestamp1);
    this.timeDifference = Math.round(readUInt64BE(incomingSyncMessage.timestamp3) - readUInt64BE(incomingSyncMessage.timestamp2)) - this.latency;			
    break;
    case 2:			            
    
    break;		
  }
  
  // Debug stuff
  this.logSynchronization(incomingSyncMessage, answer)
  
  if (answer.count < 3) {
    this.session.sendUdpMessage(this.rinfo2, answer);
  } else {		
    this.sendSynchronization();
  }
};

Stream.prototype.logSynchronization = function(incomingSyncMessage, answer) {
  if (log.shouldLog(3)) {
    var count = incomingSyncMessage ? incomingSyncMessage.count : -1;
    if (count === 0 || count === -1) {
      console.log('')
      console.log('T', 'C', 'Timestamp 1         ', 'Timestamp 2         ', 'Timestamp 3         ', 'Latency   ', ' Time difference     ', 'Rate ');
    }
    if (incomingSyncMessage) {
      console.log(
        'I',
        incomingSyncMessage.count,
        pad(readUInt64BE(incomingSyncMessage.timestamp1), 20),
        pad(readUInt64BE(incomingSyncMessage.timestamp2), 20),
        pad(readUInt64BE(incomingSyncMessage.timestamp3), 20),
        pad(this.latency, 10),
        (this.timeDifference < 0 ? '-' : ' ') +
        pad(Math.abs(this.timeDifference), 20),
        this.session.rate
        );
      }
      if (answer.count < 3) {
        console.log(
          'O',
          answer.count,
          pad(readUInt64BE(answer.timestamp1), 20),
          pad(readUInt64BE(answer.timestamp2), 20),
          pad(readUInt64BE(answer.timestamp3), 20),
          pad(this.latency, 10),
          (this.timeDifference < 0 ? '-' : ' ') +
          pad(Math.abs(this.timeDifference), 20),
          this.session.rate
          );
        }
        if (this.timeDifference) {
          var d = new Date;d.setTime(this.timeDifference/10);
        }
      }
    };
    
    Stream.prototype.sendReceiverFeedback = function(callback) {
      if (this.lostSequenceNumbers.length) {
        log(2, 'Lost packages: ', this.lostSequenceNumbers);
      }
      this.session.sendUdpMessage(this.rinfo1, new ControlMessage().mixin({
        command: 'receiver_feedback',
        ssrc: this.session.ssrc,
        sequenceNumber: this.lastReceivedSequenceNumber
      }), callback);
    };
    
    Stream.prototype.sendMessage = function sendMessage(message, callback) {
      if (this.latency === null || this.timeDifference === null) {
        return;
      }
      message = new MidiMessage().mixin(message);
      message.ssrc = this.session.ssrc;
      message.sequenceNumber = this.lastSentSequenceNr = (this.lastSentSequenceNr + 1) % 0x10000;    
      this.session.sendUdpMessage(this.rinfo2, message, callback);
    };
    
    Stream.prototype.end = function end(callback) {
      clearInterval(this.syncInterval);
      clearInterval(this.connectionInterval);
      if (this.isConnected) {
        this.sendEndstream(function() {
          this.emit('disconnected', {
            stream: this
          });
          this.isConnected = false;
          callback && callback();
        }.bind(this));
      } else {
        callback && callback()
      }
    };
    
    Stream.prototype.toJSON = function() {
      return {
        address: this.rinfo1.address,
        ssrc: this.ssrc,
        port: this.rinfo1.port,
        name: this.name
      };
    };
    
    module.exports = Stream;
    