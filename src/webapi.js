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

    manager.on('remoteSessionAdded', function(event) {
        api.sockets.emit('remoteSessionAdded', event.remoteSession);
    });

    manager.on('remoteSessionRemoved', function(event) {
        api.sockets.emit('remoteSessionRemoved', event.remoteSession);
    });

    api.sockets.on('connection', function(socket) {

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

        socket.on('midi', function(messages, port) {
            var session = manager.getSessionByPort(port);
            if (session) {
                session.sendMidiMessage(null, messages.map(function(message) {
                    return {data: message[0], deltaTime: message[1]};
                }));
            }
        });

        var inspectedSession = null;

        function streamAdded(stream) {
            socket.emit('streamAdded', stream.toJSON());
        }

        function streamRemoved(stream) {
            socket.emit('streamRemoved', stream.toJSON());
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

        socket.on('inspect', function inspect(port) {
            stopInspection();
            inspectedSession = manager.getSessionByPort(port);
            if (inspectedSession) {
                inspectedSession.on('streamAdded', streamAdded);
                inspectedSession.on('streamRemoved', streamRemoved);
            }
        });
    });

    api.cleanup = function() {
        manager.reset();
        manager.stopDiscovery();
        api.server.close();
    };

    manager.startDiscovery();
    return api;
};

