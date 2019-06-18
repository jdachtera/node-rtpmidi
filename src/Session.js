/* eslint-disable no-buffer-constructor */
/* eslint-disable no-param-reassign */
/* eslint-disable no-shadow */
/* eslint-disable no-restricted-properties */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-plusplus */
/* eslint-disable func-names */
/* eslint-disable space-before-function-paren */
/* eslint-disable no-var */

const util = require('util');
const { EventEmitter } = require('events');
const dgram = require('dgram');

const ControlMessage = require('./ControlMessage');
const MidiMessage = require('./MidiMessage');
const MdnsService = require('./mdns');
const log = require('./log');
const Stream = require('./Stream');

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
  this.lastMessageTime = 0;

  this.ipVersion = ipVersion === 6 ? 6 : 4;

  this.streamConnected = this.streamConnected.bind(this);
  this.streamDisconnected = this.streamDisconnected.bind(this);
  this.deliverMessage = this.deliverMessage.bind(this);

  this.controlChannel = dgram.createSocket(`udp${this.ipVersion}`);
  this.controlChannel.on('message', this.handleMessage.bind(this));
  this.controlChannel.on('listening', this.listening.bind(this));
  this.controlChannel.on('error', this.emit.bind(this, 'error'));
  this.messageChannel = dgram.createSocket(`udp${this.ipVersion}`);
  this.messageChannel.on('message', this.handleMessage.bind(this));
  this.messageChannel.on('listening', this.listening.bind(this));
  this.messageChannel.on('error', this.emit.bind(this, 'error'));

  this.rate = 10000;

  this.startTime = Date.now() / 1000 * this.rate;
  this.startTimeHr = process.hrtime();
}

util.inherits(Session, EventEmitter);

Session.prototype.start = function start() {
  if (this.published) {
    if (this.published) {
      this.on('ready', () => {
        this.publish();
      });
    }
  }

  this.controlChannel.bind(this.port);
  this.messageChannel.bind(this.port + 1);
};

Session.prototype.end = function (callback) {
  let i = -1;

  const onClose = function () {
    this.readyState--;
    if (this.readyState <= 0) {
      callback && callback();
    }
  }.bind(this);

  var next = function () {
    i++;
    const stream = this.streams[i];
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

Session.prototype.now = function () {
  const hrtime = process.hrtime(this.startTimeHr);
  return Math.round(((hrtime[0] + hrtime[1] / 1000 / 1000 / 1000)) * this.rate) % 0xffffffff;
};

Session.prototype.listening = function listening() {
  this.readyState++;
  if (this.readyState === 2) {
    this.emit('ready');
  }
};

Session.prototype.handleMessage = function handleMessage(message, rinfo) {
  log(4, 'Incoming Message = ', message);
  const appleMidiMessage = new ControlMessage().parseBuffer(message);

  let stream;
  if (appleMidiMessage.isValid) {
    stream = this.streams.filter(stream => stream.ssrc === appleMidiMessage.ssrc
      || stream.token === appleMidiMessage.token).pop();
    this.emit('controlMessage', appleMidiMessage);

    if (!stream && appleMidiMessage.command == 'invitation') {
      stream = new Stream(this);
      stream.handleControlMessage(appleMidiMessage, rinfo);
      this.addStream(stream);
    } else if (stream) {
      stream.handleControlMessage(appleMidiMessage, rinfo);
    }
  } else {
    const rtpMidiMessage = new MidiMessage().parseBuffer(message);
    stream = this.streams.filter(
      stream => stream.ssrc === rtpMidiMessage.ssrc,
    ).pop();
    if (stream) {
      stream.handleMidiMessage(rtpMidiMessage);
    }
    this.emit('midi', rtpMidiMessage);
  }
};

Session.prototype.sendUdpMessage = function sendMessage(rinfo, message, callback) {
  message.generateBuffer();

  if (message.isValid) {
    (rinfo.port % 2 === 0 ? this.controlChannel
      : this.messageChannel
    ).send(
      message.buffer, 0,
      message.buffer.length,
      rinfo.port, rinfo.address,
      () => {
        log(4, 'Outgoing Message = ', message.buffer, rinfo.port, rinfo.address);
        callback && callback();
      },
    );
  } else {
    log(3, 'Ignoring invalid message', message);
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

Session.prototype.flushQueue = function () {
  const streams = this.getStreams();

  const queue = this.queue.slice(0);

  const now = this.now();

  this.queue.length = 0;
  this.flushQueued = false;

  queue.sort((a, b) => a.comexTime - b.comexTime);

  let messageTime = queue[0].comexTime;

  if (messageTime > now) {
    messageTime = now;
  }

  queue.forEach((message, i) => {
    message.deltaTime = message.comexTime - messageTime;
  });

  const message = {
    timestamp: now,
    commands: queue,
  };

  for (let i = 0; i < streams.length; i++) {
    streams[i].sendMessage(message);
  }
};

Session.prototype.sendMessage = function sendMessage(comexTime, command) {
  if (arguments.length === 1) {
    comexTime = this.now();
    command = arguments[0];
  } else {
    comexTime -= this.startTime;
  }

  if (!Buffer.isBuffer(command)) {
    command = new Buffer(command);
  }

  this.queue.push({ comexTime, data: command });
  this.queueFlush();
};

Session.prototype.connect = function connect(rinfo) {
  const stream = new Stream(this);

  rinfo = {
    address: (this.ipVersion === 6 && rinfo.addressV6) ? rinfo.addressV6+
      : rinfo.address,
    port: rinfo.port,
  };

  this.addStream(stream);
  stream.connect(rinfo);
};

Session.prototype.streamConnected = function streamConnected(event) {
  this.emit('streamAdded', {
    stream: event.stream,
  });
};

Session.prototype.streamDisconnected = function streamDisconnected(event) {
  this.removeStream(event.stream);
  this.emit('streamRemoved', {
    stream: event.stream,
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

Session.prototype.deliverMessage = function (comexTime, message) {
  this.lastMessageTime = this.lastMessageTime || comexTime;
  const deltaTime = comexTime - this.lastMessageTime;
  this.lastMessageTime = comexTime;
  this.emit('message', deltaTime / this.rate, message, comexTime + this.startTime);
};

Session.prototype.getStreams = function getStreams() {
  return this.streams.filter(item => item.isConnected);
};

Session.prototype.getStream = function getStream(ssrc) {
  for (let i = 0; i < this.streams.length; i++) {
    if (this.streams[i].ssrc === ssrc) {
      return this.streams[i];
    }
  }
  return null;
};

Session.prototype.publish = function () {
  MdnsService.publish(this);
};

Session.prototype.unpublish = function () {
  MdnsService.unpublish(this);
};

Session.prototype.toJSON = function (includeStreams) {
  return {
    bonjourName: this.bonjourName,
    localName: this.localName,
    ssrc: this.ssrc,
    port: this.port,
    published: this.published,
    activated: this.readyState >= 2,
    streams: includeStreams ? this.getStreams().map(stream => stream.toJSON()) : undefined,
  };
};

module.exports = Session;
