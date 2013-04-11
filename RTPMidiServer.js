"use strict";

var util                = require("util"),
    EventEmitter        = require("events").EventEmitter,
    dgram               = require("dgram"),
    AppleMidiMessage    = require("./AppleMidiMessage"),
    RTPMidiMessage      = require("./RTPMidiMessage"),
    RTPMidiSession      = require("./RTPMidiSession");

function RTPMidiServer(port, name) {
    EventEmitter.apply(this);
    this.sessions = [];
    this.bonjourName = name;
    this.port = port || 5004;
    this.readyState = 0;

    this.debug = false;
    this.controlChannel = dgram.createSocket("udp4");
    this.controlChannel.on("message", this.handleMessage.bind(this));
    this.controlChannel.on("listening", this.listening.bind(this));
    this.messageChannel = dgram.createSocket("udp4");
    this.messageChannel.on("message", this.handleMessage.bind(this));
    this.messageChannel.on("listening", this.listening.bind(this));

    this.sessionConnected = this.sessionConnected.bind(this)
    this.sessionDisconnected = this.sessionDisconnected.bind(this);

    process.on( 'SIGINT', this.shutdown.bind(this));
}

util.inherits(RTPMidiServer, EventEmitter);

RTPMidiServer.prototype.start = function start() {
    try {
        this.controlChannel.bind(this.port);
        this.messageChannel.bind(this.port + 1);
    } catch(e) {
        this.emit('error', e);
    }
};
RTPMidiServer.prototype.now = (function () {
    if (process.hrtime) {
        var start = process.hrtime();
        return function() {
            var hrtime = process.hrtime(start);
            var now = Math.round((hrtime[0] * 10e9 + hrtime[1]) / 10e5);
            return now;
        };
    } else {
        var start = Date.now();
        return function now() {
            return (Date.now() - start) * 10;
        };
    }

})();
RTPMidiServer.prototype.log = function log() {
    if (this.debug) {
        console.log.apply(console, arguments);
    }
};
RTPMidiServer.prototype.listening = function listening() {
    this.readyState++;
    if (this.readyState == 2) {
        this.emit('ready');
    }
};
RTPMidiServer.prototype.handleMessage = function handleMessage(message, rinfo) {

    this.log("Incoming Message = ", message);
    var appleMidiMessage = new AppleMidiMessage().parseBuffer(message),
        session;
    if (appleMidiMessage.isValid) {
        session = this.sessions.filter(function(session) {
            return session.targetSSRC == appleMidiMessage.ssrc || session.token == appleMidiMessage.token;
        }).pop();
        this.emit('controlMessage', appleMidiMessage);

        if (!session && appleMidiMessage.command == 'invitation') {
            session = new RTPMidiSession(this);
            session.handleControlMessage(appleMidiMessage, rinfo);
            this.addSession(session);

        } else if (session) {
            session.handleControlMessage(appleMidiMessage, rinfo);
        }
    } else {
        var rtpMidiMessage = new RTPMidiMessage().parseBuffer(message);
        session = this.sessions.filter(function(session) {
            return session.targetSSRC == rtpMidiMessage.ssrc;
        }).pop();
        if (session) {
            session.handleMidiMessage(rtpMidiMessage);
        }
        this.emit('midi', rtpMidiMessage);
    }
};
RTPMidiServer.prototype.sendMessage = function sendMessage(rinfo, message, callback) {
    message.generateBuffer();

    if (true || message instanceof RTPMidiMessage) {
        //console.log(message);
    }

    if (message.isValid) {

        (rinfo.port % 2 == 0 ? this.controlChannel : this.messageChannel).send(message.buffer, 0, message.buffer.length, rinfo.port, rinfo.address, function() {
            this.log("Outgoing Message = ", message.buffer);
            callback && callback();
        }.bind(this));
    } else {
        console.error("Ignoring invalid message");
    }
};
RTPMidiServer.prototype.sendMidiMessage = function sendMidiMessage(ssrc, commands) {
    if (ssrc) {
        var session = this.getSession(ssrc);
        if (session) {
            session.sendMessage({commands: commands});
            return true;
        }
        return false;
    } else {
        for (var i = 0; i < this.sessions.length; i++) {
            this.sessions[i].sendMessage({commands: commands});
        }
        return true;
    }
};
RTPMidiServer.prototype.shutdown = function shutdown() {
    this.log("Shutting down...");
    this.sessions.forEach(function(session) {
        session.end();
    });
    setTimeout(process.exit.bind(process), 100);
};
RTPMidiServer.prototype.connect = function connect(rinfo) {
    var session = new RTPMidiSession(this);
    this.addSession(session);
    var counter = 0;
    var connectionInterval = setInterval(function() {
        if (counter < 40 && session.targetSSRC === null) {
            session.sendInvitation(rinfo);
            counter++;
        } else {
            clearInterval(connectionInterval);
            if (!session.targetSSRC) {
                console.log("Server at " + rinfo.address + ':' + rinfo.port + ' did not respond.');
            }
        }
    }, 1500);

};
RTPMidiServer.prototype.sessionConnected = function sessionConnected(event) {
    this.emit('sessionAdded', {session: event.session});
};
RTPMidiServer.prototype.sessionDisconnected = function sessionDisconnected(event) {
    this.removeSession(event.session);
    this.emit('sessionRemoved', {session: event.session});
};
RTPMidiServer.prototype.addSession = function addSession(session) {
    session.on('connected', this.sessionConnected);
    session.on('disconnected', this.sessionDisconnected);
    this.sessions.push(session);
};
RTPMidiServer.prototype.removeSession = function removeSession(session) {
    session.removeListener('connected', this.sessionConnected);
    session.removeListener('disconnected', this.sessionDisconnected);
    this.sessions.splice(this.sessions.indexOf(session));
};
RTPMidiServer.prototype.getSessions = function getSessions() {
    return this.sessions.filter(function(item) {
        return item.isConnected;
    });
};
RTPMidiServer.prototype.getSession = function getSession(ssrc) {
    for (var i=0; i < this.sessions.length; i++) {
        if (this.sessions[i].targetSSRC === ssrc) {
            return this.sessions[i];
        }
    }
    return null;
};

module.exports = RTPMidiServer;