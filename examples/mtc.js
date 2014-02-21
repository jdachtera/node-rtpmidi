var rtpmidi = require('../index'),
    session = rtpmidi.manager.createSession({
      localName: 'My RTPMidi Session',
      bonjourName: 'Node Midi Client',
      port: 5006
    });

// Create a clock
var mtc = new rtpmidi.MTC();

mtc.setSource(session);
mtc.on('change', function() {
  // Log the time code HH:MM:SS:FF
  console.log('Position: ' + mtc.songPosition + ' Time: ' + mtc.getSMTPEString());
});

// Connect to a remote session
session.connect({ address: '127.0.0.1', port: 5004 });


