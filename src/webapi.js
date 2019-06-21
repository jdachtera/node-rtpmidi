module.exports = function(port) {
  var manager     = require('./manager.js'),
  sio         = require('socket.io');
  port = port || 8736;
  var api = sio.listen(port);
  
  manager.on('sessionAdded', function(event) {
    api.sockets.emit('sessionAdded', event.session.toJSON());
  });
  
  manager.on('sessionRemoved', function(event) {
    api.sockets.emit('sessionRemoved', event.session.toJSON());
  });
  
  manager.on('sessionChanged', function(event) {
    api.sockets.emit('sessionChanged', event.session.toJSON());
  });
  
  manager.on('remoteSessionAdded', function(event) {
    api.sockets.emit('remoteSessionAdded', event.remoteSession);
  });
  
  manager.on('remoteSessionRemoved', function(event) {
    api.sockets.emit('remoteSessionRemoved', event.remoteSession);
  });
  
  api.sockets.on('connection', function(socket) {
    
    socket.on('createSession', function(config) {
      manager.createSession(config);
    });
    
    socket.on('removeSession', function(ssrc) {
      var session = manager.getSessionBySsrc(ssrc);
      if (session) {
        manager.removeSession(session);
      } else {
      }
    });
    
    socket.on('changeSession', function(config) {
      manager.changeSession(config);
    });
    
    socket.on('connectRemoteSession', function(ssrc, remoteSession) {
      var session = manager.getSessionBySsrc(ssrc);
      if (session) {
        session.connect(remoteSession);
      }
    });
    
    socket.on('disconnectRemoteSession', function(sessionSsrc, streamSsrc) {
      var session = manager.getSessionBySsrc(sessionSsrc);
      if (session) {
        var stream = session.getStream(streamSsrc);
        if (stream) {
          stream.end();
        }
      }
    });
    
    socket.emit('state', {
      sessions: manager.getSessions(),
      remoteSessions: manager.getRemoteSessions()
    });
    
    socket.on('listen', function(port) {
      var session = manager.getSessionByPort(port);
      if (session) {
        function handleMidiMessage(message) {
          socket.emit('midi', message.commands.map(function(command) {
            return [Array.prototype.slice.apply(command.data), command.deltaTime]
          }), session.port);
        }
        session.on('message', handleMidiMessage);
        socket.on('disconnect', function() {
          session.removeListener('listen', handleMidiMessage);
        });
      }
    });
    
    socket.on('midi', function(messages, ssrc) {
      var session = manager.getSessionBySsrc(ssrc);
      if (session) {
        session.sendMidiMessage(null, messages.map(function(message) {
          return {data: message[0], deltaTime: message[1]};
        }));
      }
    });
    
    var inspectedSession = null;
    
    function streamAdded(event) {
      socket.emit('streamAdded', event.stream.toJSON());
    }
    
    function streamRemoved(event) {
      socket.emit('streamRemoved', event.stream.toJSON());
    }
    
    function stopInspection() {
      if (inspectedSession) {
        inspectedSession.removeListener('streamAdded', streamAdded);
        inspectedSession.removeListener('streamRemoved', streamRemoved);
      }
    }
    
    socket.on('disconnect', function() {
      stopInspection();
    });
    
    socket.on('inspect', function inspect(ssrc) {
      stopInspection();
      
      inspectedSession = manager.getSessionBySsrc(ssrc);
      
      if (inspectedSession) {
        socket.emit('streams', inspectedSession.streams.map(function(stream) {
          return stream.toJSON();
        }));
        inspectedSession.on('streamAdded', streamAdded);
        inspectedSession.on('streamRemoved', streamRemoved);
      }
    });
  });
  
  api.cleanup = function(callback) {
    manager.reset(function() {
      manager.stopDiscovery();
      api.server.close();
      callback && callback();
    });
  };
  
  manager.startDiscovery();
  return api;
};

