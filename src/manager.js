/* eslint-disable no-var */
/* eslint-disable vars-on-top */
/* eslint-disable func-names */
/* eslint-disable no-plusplus */
/* eslint-disable no-multi-assign */
/* eslint-disable no-param-reassign */
/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-properties */

const os = require('os');
const { EventEmitter } = require('events');

const MdnsService = require('./mdns');
const Session = require('./Session');

const sessions = [];
const inMemoryStore = {};

let storageHandler;

const manager = module.exports = new EventEmitter();

MdnsService.on('remoteSessionUp', (remoteSession) => {
  // if (isNotLocalSession(remoteSession)) {
  manager.emit('remoteSessionAdded', { remoteSession });
  // }
});

MdnsService.on('remoteSessionDown', (remoteSession) => {
  // if (isNotLocalSession(remoteSession)) {
  manager.emit('remoteSessionRemoved', { remoteSession });
  // }
});

// eslint-disable-next-line no-unused-vars
function generateRandomInteger(octets) {
  return Math.round(Math.random() * Math.pow(2, 8 * octets));
}

function createSession(config, dontSave) {
  config = config || {};
  config.bonjourName = config.bonjourName || os.hostname() + (sessions.length ? (`-${sessions.length}`) : '');
  config.localName = config.localName || `Session ${sessions.length + 1}`;
  config.activated = config.hasOwnProperty('activated') ? config.activated : true;
  config.published = config.hasOwnProperty('published') ? config.published : true;
  config.streams = config.streams || [];

  const session = new Session(
    config.port,
    config.localName,
    config.bonjourName, config.ssrc,
    config.published,
    config.ipVersion,
  );

  sessions.push(session);

  if (config.activated) {
    session.start();
  }
  manager.emit('sessionAdded', { session });

  if (!dontSave) {
    manager.saveSessions();
  }
  return session;
}
function removeSession(session) {
  if (session) {
    session.end(() => {
      sessions.splice(sessions.indexOf(session));
      manager.emit('sessionRemoved', { session });
    });
  }
}

function changeSession(config) {
  const session = getSessionBySsrc(config.ssrc);
  if (session) {
    let restart = false; let republish = false;

    if (config.hasOwnProperty('bonjourName') && config.bonjourName !== session.bonjourName) {
      session.bonjourName = config.bonjourName;
      republish = true;
    }
    if (config.hasOwnProperty('localName') && config.localName !== session.localName) {
      session.localName = config.localName;
    }
    if (config.hasOwnProperty('port') && config.port !== session.port) {
      session.port = config.port;
      restart = true;
      republish = true;
    }

    var cb = function () {
      session.removeListener('ready', cb);
      if (config.published !== false && republish) {
        session.publish();
      }
      this.emit('sessionChanged', { session });
    }.bind(this);

    if (config.published === false || republish || config.activated == false) {
      session.unpublish();
    }

    if ((config.hasOwnProperty('activated') && config.activated !== (session.readyState === 2)) || restart) {
      session.end(() => {
        this.emit('sessionChanged', { session });
        if (config.activated !== false || restart) {
          session.on('ready', cb);
          session.start();
        }
      });
    } else {
      cb();
    }
  }
}

function getSessionByName(name) {
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (session.name === name) {
      return session;
    }
  }
  return null;
}

function getSessionByPort(port) {
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (session.port === port) {
      return session;
    }
  }
  return null;
}

function getSessionBySsrc(ssrc) {
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (session.ssrc == ssrc) {
      return session;
    }
  }
  return null;
}

process.on('SIGINT', () => {
  reset(() => {
    process.exit();
  });
});

function reset(callback) {
  let i = -1;
  function next() {
    i++;
    const session = sessions[i];
    if (session) {
      session.end(next);
    } else {
      callback && callback();
    }
  }
  next();
}

function startDiscovery() {
  MdnsService.start();
}

function stopDiscovery() {
  MdnsService.stop();
}

manager.createSession = createSession;
manager.removeSession = removeSession;
manager.changeSession = changeSession;
manager.getSessionByName = getSessionByName;
manager.getSessionBySsrc = getSessionBySsrc;
manager.getSessionByPort = getSessionByPort;
manager.startDiscovery = startDiscovery;
manager.stopDiscovery = stopDiscovery;
manager.stopDiscovery = stopDiscovery;
manager.reset = reset;
manager.getSessions = function () {
  return sessions;
};
manager.getRemoteSessions = function () {
  return MdnsService.getRemoteSessions(); // filter(isNotLocalSession);
};
manager.storageHandler = function (handler) {
  storageHandler = handler;
};
manager.storageHandler((config, callback) => {
  switch (config.method) {
    case 'read':
      callback(null, JSON.parse(inMemoryStore.sessions || '[]'));
      break;
    case 'write':
      inMemoryStore.sessions = JSON.stringify(config.sessions || []);
      callback(null);
      break;
    default:
      callback({ message: 'Wrong method.' });
  }
});

manager.restoreSessions = function () {
  storageHandler({ method: 'read' }, (err, sessionConfig) => {
    sessionConfig.forEach((config) => {
      createSession(config, true);
    });
  });
};

manager.saveSessions = function () {
  storageHandler({ method: 'write', sessions: sessions.map(s => s.toJSON()) }, () => {});
};
