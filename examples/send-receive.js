var rtpmidi = require('../index'),

  session = rtpmidi.manager.createSession({
    localName: 'Session 1',
    bonjourName: 'Node RTPMidi',
    port: 5006
  });

// Enable some console output;
//session.debug = true;

session.on('ready', function() {
  // Send a note
  setInterval(function() {
    session.sendMessage([0x80, 0x40]);
    session.sendMessage([0x90, 0x40, 0x7f]);
  }, 1000);

});

// Route the messages
session.on('message', function(deltaTime, message) {
  console.log('Received a message', message);
});

// Connect to a remote session
session.connect({ address: '127.0.0.1', port: 5004 });
