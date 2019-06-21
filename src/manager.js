/* eslint-disable no-prototype-builtins */

const { EventEmitter } = require('events');
const os = require('os');

const Session = require('./Session');
const MdnsService = require('./mdns');

const manager = new EventEmitter();

const sessions = [];
const inMemoryStore = {};
let storageHandler;

MdnsService.on('remoteSessionUp', (remoteSession) => {
  manager.emit('remoteSessionAdded', { remoteSession });
});

MdnsService.on('remoteSessionDown', (remoteSession) => {
  manager.emit('remoteSessionRemoved', { remoteSession });
});

function createSession(config = {}, dontSave) {
  const conf = config;
  conf.bonjourName = conf.bonjourName
    || os.hostname() + (sessions.length ? `-${sessions.length}` : '');
  conf.localName = conf.localName || `Session ${sessions.length + 1}`;
  conf.activated = conf.hasOwnProperty('activated') ? conf.activated : true;
  conf.published = conf.hasOwnProperty('published') ? conf.published : true;
  conf.streams = conf.streams || [];

  const session = new Session(
    conf.port,
    conf.localName, conf.bonjourName,
    conf.ssrc, conf.published, conf.ipVersion,
  );

  sessions.push(session);

  if (conf.activated) {
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

function getSessionByName(name) {
  for (let i = 0; i < sessions.length; i += 1) {
    const session = sessions[i];
    if (session.name === name) {
      return session;
    }
  }
  return null;
}

function getSessionByPort(port) {
  for (let i = 0; i < sessions.length; i += 1) {
    const session = sessions[i];
    if (session.port === port) {
      return session;
    }
  }
  return null;
}

function getSessionBySsrc(ssrc) {
  for (let i = 0; i < sessions.length; i += 1) {
    const session = sessions[i];
    if (session.ssrc === ssrc) {
      return session;
    }
  }
  return null;
}

function changeSession(config) {
  const session = getSessionBySsrc(config.ssrc);
  if (session) {
    let restart = false;
    let republish = false;

    if (config.hasOwnProperty('bonjourName')
      && config.bonjourName !== session.bonjourName) {
      session.bonjourName = config.bonjourName;
      republish = true;
    }
    if (config.hasOwnProperty('localName')
      && config.localName !== session.localName) {
      session.localName = config.localName;
    }
    if (config.hasOwnProperty('port') && config.port !== session.port) {
      session.port = config.port;
      restart = true;
      republish = true;
    }

    const cb = () => {
      session.removeListener('ready', cb);
      if (config.published !== false && republish) {
        session.publish();
      }
      this.emit('sessionChanged', { session });
    };

    if (config.published === false
      || republish || config.activated === false) {
      session.unpublish();
    }

    if ((config.hasOwnProperty('activated')
      && config.activated !== (session.readyState === 2)) || restart) {
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

function reset(callback) {
  let i = -1;
  function next() {
    i += 1;
    const session = sessions[i];
    if (session) {
      session.end(next);
    } else {
      callback && callback();
    }
  }
  next();
}

process.on('SIGINT', () => {
  reset(() => {
    process.exit();
  });
});

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

manager.getSessions = () => sessions;

manager.getRemoteSessions = () => MdnsService.getRemoteSessions();

manager.storageHandler = (handler) => {
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

manager.restoreSessions = () => {
  storageHandler({
    method: 'read',
  }, (err, sessionConfig) => {
    sessionConfig.forEach((config) => {
      createSession(config, true);
    });
  });
};

manager.saveSessions = () => {
  storageHandler({
    method: 'write',
    sessions: sessions.map(s => s.toJSON()),
  }, () => {});
};

module.exports = manager;
