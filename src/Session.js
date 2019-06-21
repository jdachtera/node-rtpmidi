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
  // RTP related
  this.streams = [];
  this.localName = localName;
  this.bonjourName = bonjourName;
  this.port = port || 5004;
  this.ssrc = ssrc || Math.round(Math.random() * (2 ** (8 * 4)));
  this.readyState = 0;
  this.published = !!published;
  // State
  this.bundle = true;
  this.queue = [];
  this.flushQueued = false;
  this.lastFlush = 0;
  this.lastMessageTime = 0;
  // IPV
  this.ipVersion = ipVersion === 6 ? 6 : 4;
  // Streams
  this.streamConnected = this.streamConnected.bind(this);
  this.streamDisconnected = this.streamDisconnected.bind(this);
  this.deliverMessage = this.deliverMessage.bind(this);
  // Socket handling
  this.controlChannel = dgram.createSocket(`udp${this.ipVersion}`);
  this.controlChannel.on('message', this.handleMessage.bind(this));
  this.controlChannel.on('listening', this.listening.bind(this));
  this.controlChannel.on('error', this.emit.bind(this, 'error'));
  this.messageChannel = dgram.createSocket(`udp${this.ipVersion}`);
  this.messageChannel.on('message', this.handleMessage.bind(this));
  this.messageChannel.on('listening', this.listening.bind(this));
  this.messageChannel.on('error', this.emit.bind(this, 'error'));
  // Message delivery Rate
  this.rate = 10000;
  // Start timing
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
  // Bind channels to session port
  this.controlChannel.bind(this.port);
  this.messageChannel.bind(this.port + 1);
};

Session.prototype.end = function end(callback) {
  let i = -1;
  const onClose = () => {
    this.readyState -= 1;
    if (this.readyState <= 0) {
      callback && callback();
    }
  };
  const next = () => {
    i += 1;
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
  };

  if (this.readyState === 2) {
    next();
  } else {
    callback && callback();
  }
};

Session.prototype.now = function now() {
  const hrtime = process.hrtime(this.startTimeHr);
  return Math.round(
    ((hrtime[0] + hrtime[1] / 1000 / 1000 / 1000)) * this.rate,
  ) % 0xffffffff;
};

Session.prototype.listening = function listening() {
  this.readyState += 1;
  if (this.readyState === 2) {
    this.emit('ready');
  }
};

Session.prototype.handleMessage = function handleMessage(message, rinfo) {
  log(4, 'Incoming Message = ', message);
  const appleMidiMessage = new ControlMessage().parseBuffer(message);
  let stream;
  if (appleMidiMessage.isValid) {
    stream = this.streams.filter((streamItem) => {
      return (streamItem.ssrc === appleMidiMessage.ssrc)
        || (streamItem.token === appleMidiMessage.token);
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
    const rtpMidiMessage = new MidiMessage().parseBuffer(message);
    stream = this.streams.filter(
      streamItem => streamItem.ssrc === rtpMidiMessage.ssrc,
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
    try {
      (
        rinfo.port % 2 === 0 ? this.controlChannel : this.messageChannel
      ).send(
        message.buffer,
        0,
        message.buffer.length,
        rinfo.port, rinfo.address,
        () => {
          log(4, 'Outgoing Message = ', message.buffer, rinfo.port, rinfo.address);
          callback && callback();
        },
      );
    } catch (error) {
      log(3, error);
    }
  } else {
    log(3, 'Ignoring invalid message', message);
  }
};

Session.prototype.queueFlush = function queueFlush() {
  if (this.bundle) {
    if (!this.flushQueued) {
      this.flushQueued = true;
      setImmediate(this.flushQueue.bind(this));
    }
  } else {
    this.flushQueue();
  }
};

Session.prototype.flushQueue = function flushQueue() {
  const streams = this.getStreams();
  const queue = this.queue.slice(0);
  const now = this.now();

  this.queue.length = 0;
  this.flushQueued = false;

  queue.sort((a, b) => {
    return a.comexTime - b.comexTime;
  });

  let messageTime = queue[0].comexTime;

  if (messageTime > now) {
    messageTime = now;
  }

  queue.forEach((message) => {
    // eslint-disable-next-line no-param-reassign
    message.deltaTime = message.comexTime - messageTime;
  });

  const message = {
    timestamp: now,
    commands: queue,
  };

  for (let i = 0; i < streams.length; i += 1) {
    streams[i].sendMessage(message);
  }
};

Session.prototype.sendMessage = function sendMessage(comexTime, command, ...args) {
  let cTime = comexTime;
  let cmd;

  if (arguments.length === 1) {
    cTime = this.now();
    [cmd] = args; // Picks first arg using array destructing
  } else {
    cTime = comexTime - this.startTime;
  }

  if (!Buffer.isBuffer(command)) {
    cmd = Buffer.from(command);
  }

  this.queue.push({ cTime, data: cmd });
  this.queueFlush();
};

Session.prototype.connect = function connect(rinfo) {
  const stream = new Stream(this);
  const info = {
    address: (this.ipVersion === 6 && rinfo.addressV6) ? rinfo.addressV6 : rinfo.address,
    port: rinfo.port,
  };

  this.addStream(stream);
  stream.connect(info);
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

Session.prototype.deliverMessage = function deliverMessage(comexTime, message) {
  this.lastMessageTime = this.lastMessageTime || comexTime;
  const deltaTime = comexTime - this.lastMessageTime;
  this.lastMessageTime = comexTime;
  this.emit('message', deltaTime / this.rate, message, comexTime + this.startTime);
};

Session.prototype.getStreams = function getStreams() {
  return this.streams.filter((item) => {
    return item.isConnected;
  });
};

Session.prototype.getStream = function getStream(ssrc) {
  for (let i = 0; i < this.streams.length; i += 1) {
    if (this.streams[i].ssrc === ssrc) {
      return this.streams[i];
    }
  }
  return null;
};

Session.prototype.publish = function publish() {
  MdnsService.publish(this);
};

Session.prototype.unpublish = function unpublish() {
  MdnsService.unpublish(this);
};

Session.prototype.toJSON = function toJSON(includeStreams) {
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
