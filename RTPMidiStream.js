"use strict";

var util                = require("util"),
    EventEmitter        = require('events').EventEmitter,
    ControlMessage      = require("./ControlMessage.js"),
    RTPMidiMessage      = require("./RTPMidiMessage.js");

// Helper functions
function generateRandomInteger (octets) {
    return Math.round(Math.random() * Math.pow(2, 8 * octets));
}

function RTPMidiStream(session) {
    EventEmitter.apply(this);
    this.session = session;
    this.token = null;
    this.sourceSSRC = generateRandomInteger(4);
    this.targetSSRC = null;
    this.rinfo1 = null;
    this.rinfo2 = null;
    this.name = '';
    this.lastSentSequenceNr = Math.round(Math.random() * 0xffff);
    this.latency = null;
    this.subscribers = [];
    this.isConnected = false;
}

util.inherits(RTPMidiStream, EventEmitter);

RTPMidiStream.prototype.handleControlMessage = function handleControlMessage(message, rinfo) {
    var commandName = message.command;
    var handlerName = 'handle';
    handlerName += commandName.slice(0,1).toUpperCase();
    handlerName += commandName.slice(1);
    if (this[handlerName]) {
        this[handlerName](message, rinfo);
    }
    this.emit('control-message', message);
};

RTPMidiStream.prototype.handleMidiMessage = function handleMidiMessage(message) {
    this.emit('message', {message: message});
};

RTPMidiStream.prototype.handleInvitation_accepted = function handleInvitation_accepted(message, rinfo) {
    if (this.rinfo1 === null ) {
        console.log("Invitation Accepted by " + message.name);
        this.name = message.name;
        this.targetSSRC = message.ssrc;
        this.rinfo1 = rinfo;
        this.sendInvitation({address: rinfo.address, port: rinfo.port + 1});
        this.isConnected = true;
        this.emit('connected', {stream: this});
    } else if (this.rinfo2 === null) {
        console.log("Data channel to " + this.name + " established");
        this.rinfo2 = rinfo;
        var count = 0;
        this.syncInterval = setInterval(function() {
            this.sendSynchronization();
            count++;
            if (count > 10) {
                clearInterval(this.syncInterval);
                this.syncInterval = setInterval(function() {
                    this.sendSynchronization();
                }.bind(this), 10000)
            }
        }.bind(this), 1500);
    }
};

RTPMidiStream.prototype.handleInvitation = function handleInvitation(message, rinfo) {
    if (this.rinfo1 ===null) {
        this.rinfo1 = rinfo;
        this.token = message.token;
        this.name = message.name;
        this.targetSSRC = message.ssrc;
        console.log("Got an invitation from " + message.name + " on channel 1");
    } else if (this.rinfo2 == null) {
        this.rinfo2 = rinfo;
        console.log("Got an invitation from " + message.name + " on channel 2");
        this.isConnected = true;
        this.emit('connected', {stream: this});
    }
    this.sendInvitationAccepted(rinfo);
};

RTPMidiStream.prototype.handleSynchronization = function handleSynchronization(message, rinfo) {
    this.sendSynchronization(message);
};

RTPMidiStream.prototype.handleEndstream = function handleEndstream() {
    console.log(this.name + " ended the stream");
    clearInterval(this.syncInterval);
    this.isConnected = false;
    this.emit('disconnected', {stream: this});
};

RTPMidiStream.prototype.sendInvitation = function sendInvitation(rinfo) {
    if (!this.token) {
        this.token = generateRandomInteger(4);
    }
    this.session.sendMessage(rinfo, new ControlMessage().copyFrom({
        command: 'invitation',
        token: this.token,
        ssrc: this.sourceSSRC,
        name: this.session.bonjourName
    }));
};

RTPMidiStream.prototype.sendInvitationAccepted = function sendInvitationAccepted(rinfo) {
    this.session.sendMessage(rinfo, new ControlMessage().copyFrom({
        command: 'invitation_accepted',
        token: this.token,
        ssrc: this.sourceSSRC,
        name: this.session.bonjourName
    }));
};

RTPMidiStream.prototype.sendEndstream = function sendEndstream() {
    this.session.sendMessage(this.rinfo1, new ControlMessage().copyFrom({
        command: 'end',
        token: this.token,
        ssrc: this.sourceSSRC,
        name: this.name
    }));
};

RTPMidiStream.prototype.sendSynchronization = function sendSynchronization(incomingSyncMessage) {
    incomingSyncMessage = incomingSyncMessage || {count: -1};
    var answer = new ControlMessage()
        .copyFrom({
            command: 'synchronization',
            timestamp1: [0x00000000, 0],
            timestamp2: [0x00000000, 0],
            timestamp3: [0x00000000, 0],
            count: -1
        })
        .copyFrom(incomingSyncMessage);
    answer.ssrc = this.sourceSSRC;
    answer.token = this.token;
    var timestamp = this.session.now();
    switch(answer.count) {
        case -1:
            answer.timestamp1[1] = timestamp;
            break;
        case 0:
            answer.timestamp2[1] = timestamp;
            break;
        case 1:
            this.latency = (timestamp - incomingSyncMessage.timestamp1[1]);

            //incomingSyncMessage.timestamp2[1] + ((incomingSyncMessage.timestamp3[1] - incomingSyncMessage.timestamp1[1]) / 2) - timestamp;
            answer.timestamp3[1] = timestamp;
            break;
        case 2:
            this.latency = (incomingSyncMessage.timestamp3[1] - incomingSyncMessage.timestamp1[1]);
            //incomingSyncMessage.timestamp3[1] + ((incomingSyncMessage.timestamp3[1] - incomingSyncMessage.timestamp1[1]) / 2) - timestamp;
            break;
    }
    answer.count++;
    if (answer.count < 3) {
        this.session.sendMessage(this.rinfo2, answer);
    }
    console.log("Synchronizing. Latency: " + this.latency);
};

RTPMidiStream.prototype.sendMessage = function sendMessage(message, callback) {
    var message = new RTPMidiMessage().copyFrom(message)
    message .ssrc = this.sourceSSRC;
    message.sequenceNumber = this.lastSentSequenceNr = (this.lastSentSequenceNr + 1) % 0xf0000;
    message.timestamp = this.session.now();
    this.session.sendMessage(this.rinfo2, message, callback);
};

RTPMidiStream.prototype.end = function end() {
    if (this.isConnected) {
        this.sendEndstream();
    }
    clearInterval(this.syncInterval);
    this.isConnected = false;
    this.emit('disconnected', {stream: this});
};

module.exports = RTPMidiStream;