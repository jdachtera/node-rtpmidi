var rtpmidi = require('../index');

var sessions = rtpmidi.manager.getSessions(),
  remoteSessions = rtpmidi.manager.getRemoteSessions();

rtpmidi.manager.on('sessionAdded', function(event) {
  console.log('A local session was created');
});

rtpmidi.manager.on('sessionRemoved', function(event) {
  console.log('A local session was removed');
});

var session = rtpmidi.manager.createSession({
  localName: 'My RTPMidi Session',
  bonjourName: 'Node Midi Client',
  port: 5006
});

session.on('streamAdded', function(event) {
  console.log('The stream "' + event.stream.name + '" was added to the session "' + session.localName +'"');
});
session.on('streamRemoved', function(event) {
  console.log('The stream "' + event.stream.name + '" was removed from the session "' + session.localName +'"');
});

rtpmidi.manager.on('remoteSessionAdded', function(event) {
  console.log('A remote session was discovered');
  console.log('Connecting...');
  session.connect(event.remoteSession);
});

rtpmidi.manager.on('remoteSessionRemoved', function(event) {
  console.log('A remote session disappered');
});


