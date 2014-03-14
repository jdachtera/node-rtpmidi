var rtpmidi = require('../index'),
    // Use 'npm install midi' to install the midi module
    midi = require('midi'),
    input = new midi.input(),
    output = new midi.output(),
 
    session = rtpmidi.manager.createSession({
      localName: 'Session 1',
      bonjourName: 'Node RTPMidi',
      port: 5008
    });

// Enable some console output;
session.debug = true;

// Create the virtual midi ports
input.openVirtualPort("My Virtual Midi Input");
output.openVirtualPort("My Virtual Midi Output");
 
// Route the messages
session.on('message', function(deltaTime, message) {
  // message is a Buffer so we convert it to an array to pass it to the midi output.
  var commands = Array.prototype.slice.call(message, 0);
  //console.log('received a network message', commands);
  output.sendMessage(commands);
});
 
input.on('message', function(deltaTime, message) {
  //console.log('received a local message', message);
  session.sendMessage(deltaTime, message);
});


// Connect to a remote session
session.connect({ address: '127.0.0.1', port: 5004 });