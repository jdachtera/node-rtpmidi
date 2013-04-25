'use strict';

var Session         = require('./Session'),
    MdnsService     = require('./MdnsService'),
    os              = require("os"),
    assert          = require("assert"),
    sessions        = [],
    remoteSessions  = MdnsService.getRemoteSessions(),
    inMemoryStore   = {},
    storageHandler,
    manager = module.exports = new EventEmitter();

MdnsService.on('remoteSessionUp', function(remoteSession) {
    if (!isLocalSession(remoteSession)) {
        remoteSessions.push(remoteSession);
        manager.emit('remoteSessionAdded', {remoteSession: remoteSession});
    }

}.bind(this));

MdnsService.on('remoteSessionDown', function(remoteSession) {
    if (!this.isLocalSession(remoteSession)) {
        remoteSessions.splice(remoteSessions.indexOf(remoteSession));
        manager.emit('remoteSessionRemoved', {remoteSession: remoteSession});
    }
}.bind(this));

function createSession(config, dontSave) {
    config = config || {};
    config.name = config.name || os.hostname() + (sessions.length ? ('-' + sessions.length) : '');
    config.port = config.port || 5004;
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
        storageHandler({method: 'write', sessions: [session.getJsonConfiguration()]}, function() {});
    }
}
function removeSession(session) {
    session.end();
    sessions.splice(sessions.indexOf(session));
    manager.emit('sessionRemoved', {session: session});
}

function getSessionConfiguration() {
    return sessions.map(function(session) {
        return session.getJsonConfiguration(true);
    });
}

function isLocalSession(config) {
    for (var i = 0, session = sessions[i]; i < sessions.length; i++) {
        if (session.name == config.name && session.port == config.port) {
            return true;
        }
    }
    return false;
}

function getSessionByName(name) {
    for (var i = 0, session = sessions[i]; i < sessions.length; i++) {
        if (session.name === name) {
            return session;
        }
    }
    return null;
}

function reset() {
    this.sessions.forEach(function(session) {
        session.end();
    });
}

manager.createSession = createSession;
manager.removeSession = removeSession;
manager.getSessionByName = getSessionByName;
manager.reset = reset;
manager.getSessions = function() {
    return sessions.slice();
};
manager.getRemoteSessions = function() {
    return remoteSessions.splice();
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