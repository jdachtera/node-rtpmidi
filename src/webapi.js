/* eslint-disable global-require */
module.exports = function (port) {
  const manager = require('./manager.js');

  const sio = require('socket.io');
  port = port || 8736;
  const api = sio.listen(port);

  manager.on('sessionAdded', (event) => {
    api.sockets.emit('sessionAdded', event.session.toJSON());
  });

  manager.on('sessionRemoved', (event) => {
    api.sockets.emit('sessionRemoved', event.session.toJSON());
  });

  manager.on('sessionChanged', (event) => {
    api.sockets.emit('sessionChanged', event.session.toJSON());
  });

  manager.on('remoteSessionAdded', (event) => {
    api.sockets.emit('remoteSessionAdded', event.remoteSession);
  });

  manager.on('remoteSessionRemoved', (event) => {
    api.sockets.emit('remoteSessionRemoved', event.remoteSession);
  });

  api.sockets.on('connection', (socket) => {
    socket.on('createSession', (config) => {
      manager.createSession(config);
    });

    socket.on('removeSession', (ssrc) => {
      const session = manager.getSessionBySsrc(ssrc);
      if (session) {
        manager.removeSession(session);
      // eslint-disable-next-line no-empty
      } else {}
    });

    socket.on('changeSession', (config) => {
      manager.changeSession(config);
    });

    socket.on('connectRemoteSession', (ssrc, remoteSession) => {
      const session = manager.getSessionBySsrc(ssrc);
      if (session) {
        session.connect(remoteSession);
      }
    });

    socket.on('disconnectRemoteSession', (sessionSsrc, streamSsrc) => {
      const session = manager.getSessionBySsrc(sessionSsrc);
      if (session) {
        const stream = session.getStream(streamSsrc);
        if (stream) {
          stream.end();
        }
      }
    });

    socket.emit('state', {
      sessions: manager.getSessions(),
      remoteSessions: manager.getRemoteSessions(),
    });

    socket.on('listen', (port) => {
      const session = manager.getSessionByPort(port);
      if (session) {
        function handleMidiMessage(message) {
          socket.emit('midi', message.commands.map(command => [Array.prototype.slice.apply(command.data), command.deltaTime]), session.port);
        }
        session.on('message', handleMidiMessage);
        socket.on('disconnect', () => {
          session.removeListener('listen', handleMidiMessage);
        });
      }
    });

    socket.on('midi', (messages, ssrc) => {
      const session = manager.getSessionBySsrc(ssrc);
      if (session) {
        session.sendMidiMessage(null, messages.map(message => ({ data: message[0], deltaTime: message[1] })));
      }
    });

    let inspectedSession = null;

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

    socket.on('disconnect', () => {
      stopInspection();
    });

    socket.on('inspect', (ssrc) => {
      stopInspection();

      inspectedSession = manager.getSessionBySsrc(ssrc);

      if (inspectedSession) {
        socket.emit('streams', inspectedSession.streams.map(stream => stream.toJSON()));
        inspectedSession.on('streamAdded', streamAdded);
        inspectedSession.on('streamRemoved', streamRemoved);
      }
    });
  });

  api.cleanup = function (callback) {
    manager.reset(() => {
      manager.stopDiscovery();
      api.server.close();
      callback && callback();
    });
  };

  manager.startDiscovery();
  return api;
};
