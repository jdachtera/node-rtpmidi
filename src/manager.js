'use strict';

var Session         = require('./Session'),
    MdnsService     = require('./mdns'),
    os              = require("os"),
    assert          = require("assert"),
    sessions        = [],
    EventEmitter    = require("events").EventEmitter,
    inMemoryStore   = {},
    storageHandler,
    manager = module.exports = new EventEmitter();

MdnsService.on('remoteSessionUp', function(remoteSession) {
    if (isNotLocalSession(remoteSession)) {
        manager.emit('remoteSessionAdded', {remoteSession: remoteSession});
    }

}.bind(this));

MdnsService.on('remoteSessionDown', function(remoteSession) {
    if (isNotLocalSession(remoteSession)) {
        manager.emit('remoteSessionRemoved', {remoteSession: remoteSession});
    }
}.bind(this));

function createSession(config, dontSave) {
    config = config || {};
    config.name = config.name || os.hostname() + (sessions.length ? ('-' + sessions.length) : '');
    config.port = config.port || 5006;
    config.activated = config.hasOwnProperty('activated') ? config.activated : true;
    config.published = config.hasOwnProperty('published') ? config.published : true;
    config.streams = config.streams || [];

    var session = new Session(config.port, config.name);

    sessions.push(session);

    if (config.published) {
        session.on('ready', function() {
            session.publish();
        });
    }
    if (config.activated) {
        session.start();
    }
    manager.emit('sessionAdded', {session: session});

    if (!dontSave) {
        storageHandler({method: 'write', sessions: [session.toJSON()]}, function() {});
    }
}
function removeSession(session) {
    session.end();
    sessions.splice(sessions.indexOf(session));
    manager.emit('sessionRemoved', {session: session});
}

function getSessionConfiguration() {
    return sessions.map(function(session) {
        return session.toJSON(true);
    });
}

function isNotLocalSession(config) {
    for (var i = 0, session = sessions[i]; i < sessions.length; i++) {
        if (session.name == config.name && session.port == config.port) {
            return false;
        }
    }
    return true;
}

function getSessionByName(name) {
    for (var i = 0, session = sessions[i]; i < sessions.length; i++) {
        if (session.name === name) {
            return session;
        }
    }
    return null;
}

function getSessionByPort(port) {
    for (var i = 0, session = sessions[i]; i < sessions.length; i++) {
        if (session.port === port) {
            return session;
        }
    }
    return null;
}

function reset() {
    sessions.forEach(function(session) {
        session.end();
    });
}

function startDiscovery() {
    MdnsService.start();
}

function stopDiscovery() {
    MdnsService.stop();
}

manager.createSession = createSession;
manager.removeSession = removeSession;
manager.getSessionByName = getSessionByName;
manager.getSessionByPort = getSessionByPort;
manager.startDiscovery = startDiscovery;
manager.stopDiscovery = stopDiscovery;
manager.stopDiscovery = stopDiscovery;
manager.reset = reset;
manager.getSessions = function() {
    return sessions.slice();
};
manager.getRemoteSessions = function() {
    return MdnsService.getRemoteSessions().filter(isNotLocalSession);
};
manager.storageHandler = function(handler) {
    storageHandler = handler;
};
manager.storageHandler(function(config, callback) {
    switch(config.method) {
        case 'read':
            callback(null, JSON.parse(inMemoryStore['sessions'] || '[{}]'));
            break;
        case 'write':
            inMemoryStore['sessions'] = JSON.stringify(config.sessions || []);
            callback(null);
            break;
        default:
            callback({message: 'Wrong method.'});
    }
});

storageHandler({method: 'read'}, function(err, sessionConfig) {
    sessionConfig.forEach(function(config) {
        createSession(config, true);
    });
});