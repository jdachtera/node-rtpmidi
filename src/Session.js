"use strict";

var util            = require("util"),
    EventEmitter    = require("events").EventEmitter,
    dgram           = require("dgram"),
    ControlMessage  = require("./ControlMessage"),
    MidiMessage     = require("./MidiMessage"),
    MdnsService     = require("./mdns"),
    log             = require('./log'),
    Stream          = require("./Stream");


function Session(port, localName, bonjourName, ssrc, published, ipVersion) {
    EventEmitter.apply(this);
    this.streams = [];
    this.localName = localName;
	  this.bonjourName = bonjourName;
    this.port = port || 5004;
	  this.ssrc = ssrc || Math.round(Math.random() * Math.pow(2, 8 * 4));
    this.readyState = 0;
    this.published = !!published;

    this.bundle = true;
    this.queue = [];
    this.flushQueued = false;
    this.lastFlush = 0;

    this.ipVersion = ipVersion === 6 ? 6 : 4;

    this.streamConnected = this.streamConnected.bind(this);
    this.streamDisconnected = this.streamDisconnected.bind(this);
    this.deliverMessage = this.deliverMessage.bind(this);
}

util.inherits(Session, EventEmitter);

Session.prototype.start = function start() {
    if (this.published) {
      if (this.published) {
        this.on('ready', function() {
          this.publish();
        }.bind(this));
      }
    }
    try {
		this.controlChannel = dgram.createSocket("udp" + this.ipVersion);
		this.controlChannel.on("message", this.handleMessage.bind(this));
		this.controlChannel.on("listening", this.listening.bind(this));
		this.messageChannel = dgram.createSocket("udp" + this.ipVersion);
		this.messageChannel.on("message", this.handleMessage.bind(this));
		this.messageChannel.on("listening", this.listening.bind(this));
        this.controlChannel.bind(this.port);
        this.messageChannel.bind(this.port + 1);
    } catch (e) {
        this.emit('error', e);
    }

};

Session.prototype.end = function(callback) {

	var i = -1,
    onClose = function () {
      this.readyState--;
      if (this.readyState <= 0) {
        callback && callback();
      }
    }.bind(this),
		next = function() {
			i++;
			var stream = this.streams[i];
			if (stream) {
				stream.end(next);
			} else {
        this.unpublish();

        this.controlChannel.on('close', onClose);
        this.messageChannel.on('close', onClose);

        this.controlChannel.close();
        this.messageChannel.close();
        this.published = false;
			}
		}.bind(this);

	if (this.readyState === 2) {
		next();
	} else {
		callback && callback();
	}
};

Session.prototype.now = (function () {
  var rate = 10000,
      maxValue = Math.pow(2, 32),
      tickSource,
      start
    ;

  if (process.hrtime) {
    start = process.hrtime();
    tickSource = function() {
      var hrtime = process.hrtime(start);
      return hrtime[0] + hrtime[1] / (1000 * 1000 * 1000);
    }
  } else {
    start = Date.now();
    tickSource = function() {
      return (Date.now() - start) / 1000;
    }
  }

  return function() {
    var now = Math.round(tickSource() * rate);
    return now % maxValue;
  }

})();

Session.prototype.listening = function listening() {
    this.readyState++;
    if (this.readyState == 2) {
        this.emit('ready');
    }
};

Session.prototype.handleMessage = function handleMessage(message, rinfo) {
    log(4, "Incoming Message = ", message);
    var appleMidiMessage = new ControlMessage().parseBuffer(message),
        stream;
    if (appleMidiMessage.isValid) {
        stream = this.streams.filter(function (stream) {
            return stream.ssrc == appleMidiMessage.ssrc || stream.token == appleMidiMessage.token;
        }).pop();
        this.emit('controlMessage', appleMidiMessage);


        if (!stream && appleMidiMessage.command == 'invitation') {
            stream = new Stream(this);
            stream.handleControlMessage(appleMidiMessage, rinfo);
            this.addStream(stream);

        } else if (stream) {
            stream.handleControlMessage(appleMidiMessage, rinfo);
        }
    } else {
        var rtpMidiMessage = new MidiMessage().parseBuffer(message);
        stream = this.streams.filter(function (stream) {
            return stream.ssrc == rtpMidiMessage.ssrc;
        }).pop();
        if (stream) {
            stream.handleMidiMessage(rtpMidiMessage);
        }
        this.emit('midi', rtpMidiMessage);
    }
};

Session.prototype.sendUdpMessage = function sendMessage(rinfo, message, callback) {
    message.generateBuffer();

    if (message.isValid) {
        (rinfo.port % 2 == 0 ? this.controlChannel : this.messageChannel).send(message.buffer, 0, message.buffer.length, rinfo.port, rinfo.address, function () {
          log(4, "Outgoing Message = ", message.buffer, rinfo.port, rinfo.address);
          callback && callback();
        }.bind(this));
    } else {
        log(3, "Ignoring invalid message", message);
    }
};

Session.prototype.queueFlush = function() {
  if (this.bundle) {
    if (!this.flushQueued) {
      this.flushQueued = true;
      setImmediate(this.flushQueue.bind(this));
    }
  } else {
    this.flushQueue();
  }
};

Session.prototype.flushQueue = function() {
  var streams = this.getStreams(),
    queue = this.queue.slice(0);
  this.queue.length = 0;
  this.flushQueued = false;

  for (var i = 0; i < streams.length; i++) {
    streams[i].sendMessage({
      commands: queue
    });
  }
};

Session.prototype.sendMessage = function sendMessage(deltaTime, command) {
  var now = this.now();

  if (arguments.length === 1) {
    deltaTime = 0;
    if (this.queue.length && this.lastFlush) {
      deltaTime += (now - this.lastFlush) / 10000;
    }
    command = arguments[0];
  } else if (this.queue.length === 0) {
    deltaTime -= now - this.lastFlush;
  }

  this.lastFlush = now;

  if (!Buffer.isBuffer(command)) {
    command = new Buffer(command);
  }
  this.queue.push({deltaTime: deltaTime, data: command});
  this.queueFlush();
};

Session.prototype.connect = function connect(rinfo) {
    var stream = new Stream(this);

    rinfo = {address: (this.ipVersion === 6 && rinfo.addressV6) ? rinfo.addressV6 : rinfo.address, port: rinfo.port};

    this.addStream(stream);
    stream.connect(rinfo);
};

Session.prototype.streamConnected = function streamConnected(event) {
    this.emit('streamAdded', {
        stream: event.stream
    });
};

Session.prototype.streamDisconnected = function streamDisconnected(event) {
    this.removeStream(event.stream);
    this.emit('streamRemoved', {
        stream: event.stream
    });
};

Session.prototype.addStream = function addStream(stream) {
    stream.on('connected', this.streamConnected);
    stream.on('disconnected', this.streamDisconnected);
    stream.on('message', this.deliverMessage);
    this.streams.push(stream);
};

Session.prototype.removeStream = function removeStream(stream) {

    stream.removeListener('connected', this.streamConnected);
    stream.removeListener('disconnected', this.streamDisconnected);
    stream.removeListener('message', this.deliverMessage);
    this.streams.splice(this.streams.indexOf(stream));
};

Session.prototype.deliverMessage = function(deltaTime, message) {
    this.emit('message', deltaTime, message);
};

Session.prototype.getStreams = function getStreams() {
    return this.streams.filter(function (item) {
        return item.isConnected;
    });
};

Session.prototype.getStream = function getStream(ssrc) {
    for (var i = 0; i < this.streams.length; i++) {
        if (this.streams[i].ssrc === ssrc) {
            return this.streams[i];
        }
    }
    return null;
};

Session.prototype.publish = function() {
    MdnsService.publish(this);
    this.published = true;
};

Session.prototype.unpublish = function() {
    MdnsService.unpublish(this);
    this.published = false;
};

Session.prototype.toJSON = function(includeStreams) {
    return {
        bonjourName: this.bonjourName,
		localName: this.localName,
		ssrc: this.ssrc,
        port: this.port,
        published: this.published,
        activated: this.readyState >=2,
        streams: includeStreams ? this.getStreams().map(function(stream) {
            return stream.toJSON();
        }) : undefined
    };
};

module.exports = Session;
