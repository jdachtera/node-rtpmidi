var util            = require('util'),
EventEmitter    = require('events').EventEmitter

var api = {
  bonjour: function(method, params) {
    var parameters = {
      "regType":"_apple-midi._udp",
      "interfaceName":"eth0",
      "subscribe": true
    };
    for (var k in params) {
      parameters[k] = params[k];
    }
    return api.futureToEventEmitter(PalmCall.call('palm://com.palm.zeroconf', method, parameters));
  },
  browse: function() {
    return api.bonjour('browse')
  },
  resolve: function(instanceName) {
    return api.bonjour('resolve', {instanceName: instanceName});
  },
  register: function(instanceName, port) {
    return api.bonjour('register', {instanceName: instanceName, port: port});
  },
  openUdpPorts: function() {
    var rules = Array.prototype.slice.call(arguments).map(function(a) {
      return {protocol: "UDP", destinationPort: a};
    });
    return api.futureToEventEmitter(PalmCall.call('palm://com.palm.firewall/', 'control', {
    "subscribe":true,
    "rules": rules
  }));
},
publish: function(session) {
  api.openUdpPorts(session.port, session.port + 1).on('result', function(result) {
    if (result.returnValue) {
      publishedSessionsFutures[session.name] = api.register(session.name, session.port);
    }
  });
},
futureToEventEmitter: function(future) {
  var eventEmitter = new EventEmitter();
  eventEmitter.cancel = future.cancel.bind(future);
  var handler = function(future) {
    if (future.result.returnValue === false) {
      eventEmitter.emit('error', future.result);
    } else {
      if (future.result.eventType) {
        eventEmitter.emit(future.result.eventType, future.result);
      }
      eventEmitter.emit('result', future.result);
    }
    future.then(handler);
  };
  future.then(handler);
  return eventEmitter;
}
};




function startBrowsing() {
  browsingFuture = api.browse()
  .on('Add', function(result) {
    api.bonjour('resolve', result).on('result', function(resolved) {
      if (resolved.IPv4Address) {
        remoteSessions[result.instanceName] = sessionDetails(result, resolved)
        this.emit('remoteSessionUp', remoteSessions[result.instanceName]);
      }
    }.bind(this));
  }.bind(this))
  .on('Rmv', function(result) {
    if (remoteSessions[result.instanceName]) {
      this.emit('remoteSessionDown', remoteSessions[result.instanceName]);
      delete(remoteSessions[result.instanceName]);
    }
  }.bind(this));
}

function sessionDetails(result, resolved) {
  return {
    name: result.instanceName,
    port: resolved.port,
    address: resolved.IPv4Address,
    host: resolved.targetName
  };
}

var publishedSessionsFutures = {},
remoteSessions = {};

function MDnsService() {}

util.inherits(MDnsService, EventEmitter);

MDnsService.prototype.publish = function(session) {
  process.nextTick(api.publish.bind(api, session));
};

var browsingFuture = null;

MDnsService.prototype.start = function () {
  if (browsingFuture === null) {
    browsingFuture = true;
    process.nextTick(startBrowsing.bind(this));
  }
};

MDnsService.prototype.stop = function() {
  if (browsingFuture && browsingFuture.cancel) {
    browsingFuture.cancel();
  }
};

MDnsService.prototype.stop = function() {
  
};

MDnsService.prototype.unpublish = function(session) {
  if (publishedSessionsFutures[session.name]) {
    publishedSessionsFutures[session.name].cancel();
  }
};

MDnsService.prototype.getRemoteSessions = function() {
  var sessions = [];
  for (var k in remoteSessions) {
    if (remoteSessions.hasOwnProperty(k)) {
      sessions.push(remoteSessions[k]);
    }
  }
  return sessions;
};

module.exports = new MDnsService();

