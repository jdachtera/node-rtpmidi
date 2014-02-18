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
    //if (isNotLocalSession(remoteSession)) {
        manager.emit('remoteSessionAdded', {remoteSession: remoteSession});
    //}

}.bind(this));

MdnsService.on('remoteSessionDown', function(remoteSession) {
    //if (isNotLocalSession(remoteSession)) {
        manager.emit('remoteSessionRemoved', {remoteSession: remoteSession});
    //}
}.bind(this));

function generateRandomInteger(octets) {
	return Math.round(Math.random() * Math.pow(2, 8 * octets));
}

function createSession(config, dontSave) {
    config = config || {};
    config.bonjourName = config.bonjourName || os.hostname() + (sessions.length ? ('-' + sessions.length) : '');
	  config.localName = config.localName || 'Session ' + (sessions.length + 1);
	  config.ssrc = config.ssrc || generateRandomInteger(4);
    config.port = config.port || 5006;
    config.activated = config.hasOwnProperty('activated') ? config.activated : true;
    config.published = config.hasOwnProperty('published') ? config.published : true;
    config.streams = config.streams || [];

    var session = new Session(config.port, config.localName, config.bonjourName, config.ssrc);

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
    return session;
}
function removeSession(session) {
	if (session) {
		session.end(function() {
			sessions.splice(sessions.indexOf(session));
			console.log(sessions);
			manager.emit('sessionRemoved', {session: session});
		}.bind(this));
	}
}

function changeSession(config) {
	var session = getSessionBySsrc(config.ssrc);
	if (session) {
		var restart = false, republish = false;

		if (config.hasOwnProperty('bonjourName')  && config.bonjourName !== session.bonjourName) {
			session.bonjourName = config.bonjourName;
			republish = true;
		}
		if (config.hasOwnProperty('localName') && config.localName !== session.localName) {
			session.localName = config.localName;
		}
		if (config.hasOwnProperty('port')  && config.port !== session.port) {
			session.port = config.port;
			restart = true;
			republish = true;
		}

		var cb = function() {
			session.removeListener('ready', cb);
			if (config.published !== false && republish) {
				session.publish();
			}
			this.emit('sessionChanged', {session: session});
		}.bind(this);


		if (config.published === false || republish || config.activated == false) {
			session.unpublish();
		}

		if ((config.hasOwnProperty('activated') && config.activated !== (session.readyState === 2)) || restart) {
			session.end(function() {
				this.emit('sessionChanged', {session: session});
				console.log(config, restart);
				if (config.activated !== false || restart) {
					session.on('ready', cb);
					session.start();
				}
			}.bind(this))
		} else {
			cb();
		}
	}
}

function getSessionConfiguration() {
    return sessions.map(function(session) {
        return session.toJSON(true);
    });
}

function isNotLocalSession(config) {
	for (var i = 0;i < sessions.length; i++) {
		var session = sessions[i];
        if (session.bonjourName == config.name && session.port == config.port) {
            return false;
        }
    }
    return true;
}

function getSessionByName(name) {
	for (var i = 0;i < sessions.length; i++) {
		var session = sessions[i];
        if (session.name === name) {
            return session;
        }
    }
    return null;
}

function getSessionByPort(port) {
	for (var i = 0;i < sessions.length; i++) {
		var session = sessions[i];
        if (session.port === port) {
            return session;
        }
    }
    return null;
}

function getSessionBySsrc(ssrc) {
	for (var i = 0;i < sessions.length; i++) {
		var session = sessions[i];
		if (session.ssrc == ssrc) {
			return session;
		}
	}
	return null;
}

process.on('SIGINT', function() {
	reset(function() {
		process.exit();
	})
});

function reset(callback) {
	var i = -1;
	function next() {
		i++;
		var session = sessions[i];
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
manager.getSessions = function() {
    return sessions.slice();
};
manager.getRemoteSessions = function() {
    return MdnsService.getRemoteSessions().slice(); //filter(isNotLocalSession);
};
manager.storageHandler = function(handler) {
    storageHandler = handler;
};
manager.storageHandler(function(config, callback) {
    switch(config.method) {
        case 'read':
            callback(null, JSON.parse(inMemoryStore['sessions'] || '[]'));
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