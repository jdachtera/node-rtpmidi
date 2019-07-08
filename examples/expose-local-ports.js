const midi = require('midi');

const hrNow = (function () {
  const ts = Date.now() / 1000;

  const hrtime = process.hrtime();

  const diff = ts - (hrtime[0] + hrtime[1] / 1000 / 1000 / 1000);

  return function (rate) {
    const hrtime = process.hrtime();
    return Math.round((diff + (hrtime[0] + hrtime[1] / 1000 / 1000 / 1000)) * rate);
  };
}());

const rtpmidi = require('../');

const inputs = {};

const outputs = {};

const sessions = {};

const i = new midi.input();

const o = new midi.output();

let isRunning = false;

const latency = 0;

let throttled = false;

const messageQueue = [];

let timeout;

const now = hrNow(10000);

let port = 5008;

let portMap = { outputs: [], inputs: [] };

rtpmidi.log.level = 2;

function run() {
  const now = hrNow(10000);

  let entry;

  while (messageQueue.length && messageQueue[messageQueue.length - 1][1] - now < latency) {
    entry = messageQueue.pop();
    outputs[entry[0]].sendMessage(entry[2]);
  }

  if (messageQueue.length) {
    isRunning = true;
    if (messageQueue[messageQueue.length - 1][1] - now >= 5) {
      setTimeout(run, messageQueue[messageQueue.length - 1][1] - now + latency);
      throttled = true;
    } else {
      setImmediate(run);
      throttled = false;
    }
  } else {
    isRunning = false;
  }
}

function getPorts() {
  const inputCount = i.getPortCount();

  const outputCount = o.getPortCount();

  let id;

  const portMap = { inputs: [], outputs: [] };

  for (id = 0; id < inputCount; id++) {
    if (!inputs[id]) {
      inputs[id] = new midi.input();
      inputs[id].openPort(id);
    }
    portMap.inputs.push(i.getPortName(id));
  }

  for (id = 0; id < outputCount; id++) {
    if (!outputs[id]) {
      outputs[id] = new midi.output();
      outputs[id].openPort(id);
    }
    portMap.outputs.push(o.getPortName(id));
  }
  this.portMap = portMap;
  return portMap;
}

function sendMidi(id, comexTime, data) {
  const { length } = messageQueue;

  let i;

  let wasInserted = false;

  if (Buffer.isBuffer(data)) {
    data = Array.prototype.slice.call(data, 0);
  }

  if (now > comexTime) {
    outputs[id].sendMessage(data);
    return;
  }

  for (i = 0; i < length; i++) {
    if (messageQueue[i][1] > comexTime) {
      messageQueue.splice(i + 1, 0, arguments);
      wasInserted = true;
      break;
    }
  }
  if (!wasInserted) {
    messageQueue.unshift(arguments);
  }

  if (!isRunning) {
    run();
  } else if (throttled && now - comexTime < 5) {
    clearTimeout(timeout);
    run();
  }
}

function getSession(name) {
  if (!sessions[name]) {
    sessions[name] = rtpmidi.manager.createSession({ port, bonjourName: name });
    port += 2;
  }
  return sessions[name];
}

function exposePorts() {
  portMap = getPorts();

  portMap.outputs.forEach((name, id) => {
    const session = getSession(name);
    session.on('message', (deltaTime, message, comexTime) => {
      sendMidi(id, comexTime, message);
    });
  });

  portMap.inputs.forEach((name, id) => {
    const session = getSession(name);
    let lastMessageTime = 0;

    inputs[id].on('message', (deltaTime, message) => {
      lastMessageTime = (lastMessageTime || hrNow(10000)) + Math.round(deltaTime * 10000);
      session.sendMessage(lastMessageTime, message);
    });
  });
}

exposePorts();
