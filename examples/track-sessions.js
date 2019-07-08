const rtpmidi = require('../index');

const sessions = rtpmidi.manager.getSessions();

const remoteSessions = rtpmidi.manager.getRemoteSessions();

rtpmidi.manager.on('sessionAdded', (event) => {
  console.log('A local session was created');
});

rtpmidi.manager.on('sessionRemoved', (event) => {
  console.log('A local session was removed');
});

const session = rtpmidi.manager.createSession({
  localName: 'My RTPMidi Session',
  bonjourName: 'Node Midi Client',
  port: 5006,
});

session.on('streamAdded', (event) => {
  console.log(`The stream "${event.stream.name}" was added to the session "${session.localName}"`);
});
session.on('streamRemoved', (event) => {
  console.log(`The stream "${event.stream.name}" was removed from the session "${session.localName}"`);
});

rtpmidi.manager.on('remoteSessionAdded', (event) => {
  console.log('A remote session was discovered');
  console.log('Connecting...');
  session.connect(event.remoteSession);
});

rtpmidi.manager.on('remoteSessionRemoved', (event) => {
  console.log('A remote session disappered');
});
