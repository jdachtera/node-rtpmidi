"use strict";

var util = require("util"),
    EventEmitter = require('events').EventEmitter,
    ControlMessage = require("./ControlMessage.js"),
    MidiMessage = require("./MidiMessage.js");

// Helper functions

function generateRandomInteger(octets) {
    return Math.round(Math.random() * Math.pow(2, 8 * octets));
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
}

util.inherits(Stream, EventEmitter);

Stream.prototype.handleControlMessage = function handleControlMessage(message, rinfo) {
    var commandName = message.command;
    var handlerName = 'handle';
    handlerName += commandName.slice(0, 1).toUpperCase();
    handlerName += commandName.slice(1);
    if (this[handlerName]) {
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

    message.commands.forEach(function(command) {
        this.emit('message', command.deltaTime, command.data);
    }.bind(this));

    clearTimeout(this.receiverFeedbackTimeout);
    this.receiverFeedbackTimeout = setTimeout(this.sendReceiverFeedback.bind(this), 1000);
};

Stream.prototype.handleInvitation_accepted = function handleInvitation_accepted(message, rinfo) {
    if (this.rinfo1 === null) {
        this.session.log("Invitation Accepted by " + message.name);
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
        this.session.log("Data channel to " + this.name + " established");
        this.rinfo2 = rinfo;
        var count = 0;
        this.syncInterval = setInterval(function () {
            this.sendSynchronization();
            count++;
            if (count > 10) {
                clearInterval(this.syncInterval);
                this.syncInterval = setInterval(function () {
                    this.sendSynchronization();
                }.bind(this), 10000)
            }
        }.bind(this), 1500);
    }
};

Stream.prototype.handleInvitation = function handleInvitation(message, rinfo) {
    if (this.rinfo1 === null) {
        this.rinfo1 = rinfo;
        this.token = message.token;
        this.name = message.name;
        this.ssrc = message.ssrc;
        this.session.log("Got an invitation from " + message.name + " on channel 1");
    } else if (this.rinfo2 == null) {
        this.rinfo2 = rinfo;
        this.session.log("Got an invitation from " + message.name + " on channel 2");
        this.isConnected = true;
        this.emit('connected', {
            stream: this
        });
    }
    this.sendInvitationAccepted(rinfo);
};

Stream.prototype.handleSynchronization = function handleSynchronization(message, rinfo) {
    this.sendSynchronization(message);
};

Stream.prototype.handleEnd = function handleEndstream() {
    this.session.log(this.name + " ended the stream");
    clearInterval(this.syncInterval);
    this.isConnected = false;
    this.emit('disconnected', {
        stream: this
    });
};

Stream.prototype.handleReceiver_feedback = function(message, rinfo) {
  this.session.log('Got receiver feedback', 'SSRC ' + message.ssrc + ' is at ' + message.sequenceNumber + '. Current is ' + this.lastSentSequenceNr);
};

Stream.prototype.sendInvitation = function sendInvitation(rinfo) {
    if (!this.token) {
        this.token = generateRandomInteger(4);
    }
    this.session.sendControlMessage(rinfo, new ControlMessage().mixin({
        command: 'invitation',
        token: this.token,
        ssrc: this.session.ssrc,
        name: this.session.bonjourName
    }));
};

Stream.prototype.sendInvitationAccepted = function sendInvitationAccepted(rinfo) {
    this.session.sendControlMessage(rinfo, new ControlMessage().mixin({
        command: 'invitation_accepted',
        token: this.token,
        ssrc: this.session.ssrc,
        name: this.session.bonjourName
    }));
};

Stream.prototype.sendEndstream = function sendEndstream(callback) {
    this.session.sendControlMessage(this.rinfo1, new ControlMessage().mixin({
        command: 'end',
        token: this.token,
        ssrc: this.session.ssrc,
        name: this.name
    }), callback);
};

Stream.prototype.sendSynchronization = function sendSynchronization(incomingSyncMessage) {
    var count = incomingSyncMessage ? incomingSyncMessage.count : -1;
    var now = this.session.now();
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
            timestamp = answer.timestamp1;
            break;
        case 0:
            timestamp = answer.timestamp2;
            break;
        case 1:
            timestamp = answer.timestamp3;
            this.latency = (now - incomingSyncMessage.timestamp1.readUInt32BE(4)) / 2;
            break;
        case 2:
            this.latency = (incomingSyncMessage.timestamp3.readUInt32BE(4) - incomingSyncMessage.timestamp1.readUInt32BE(4)) / 2;
            break;
    }

    if (timestamp) {
      timestamp.writeUInt32BE(0, 0);
      timestamp.writeUInt32BE(now, 4);
    }

    if (answer.count < 3) {
        this.session.sendControlMessage(this.rinfo2, answer);
    }
    this.session.log("Synchronizing. Latency: " + this.latency);
};

Stream.prototype.sendReceiverFeedback = function(callback) {
    if (this.lostSequenceNumbers.length) {
        this.session.log('Lost packages: ', lostSequenceNumbers);
    }
    this.session.sendControlMessage(this.rinfo1, new ControlMessage().mixin({
        command: 'receiver_feedback',
        ssrc: this.session.ssrc,
        sequenceNumber: this.lastReceivedSequenceNumber
    }), callback);
}

Stream.prototype.sendMessage = function sendMessage(message, callback) {
    var message = new MidiMessage().mixin(message)
    message.ssrc = this.session.ssrc;
    message.sequenceNumber = this.lastSentSequenceNr = (this.lastSentSequenceNr + 1) % 0xf0000;
    message.timestamp = this.session.now();
    this.session.sendControlMessage(this.rinfo2, message, callback);
};

Stream.prototype.end = function end(callback) {
    clearInterval(this.syncInterval);
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
