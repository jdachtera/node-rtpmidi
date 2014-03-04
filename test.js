var rtpmidi = require("./index"),
    session = rtpmidi.manager.createSession({
      localName: 'Session 1',
      bonjourName: 'Node RTPMidi',
      port: 5008
    });

var echo = false;

function printHelp() {
  console.log('Session is is listening on port ' + session.port + '.');
  console.log('Commands: ');
  console.log('h: Print this help message');
  console.log('c: connect to 127.0.0.1:5004');
  console.log('d: Toggle debug mode.');
  console.log('n: send a test note to all streams');
  console.log('e: Toggle echo all incoming message to the sending stream.');
  console.log('l: List available remote sessions.');
}

session.on('ready', printHelp);

session.on('streamAdded', function (event) {

    var stream = event.stream;
    console.log("New stream started. SSRC: " + stream.ssrc);
    stream.on('message', function (deltaTime, message) {
      console.log('Received a command: ', message);
      if (echo) {
        stream.sendMessage(message);
      }

    });
});

rtpmidi.manager.startDiscovery();

session.on('streamRemoved', function (event) {
    console.log('Stream removed ' + event.stream.name);
});

session.start();

var stdin = process.openStdin();
stdin.setRawMode(true);

stdin.resume();
stdin.setEncoding('utf8');

var mode = 'main';

// on any data into stdin
stdin.on('data', function (key) {
    switch(mode) {
      case 'main':
        switch (key) {
          case 'c':
            session.connect({address: '127.0.0.1', port: 5004});
            break;
          case 'h':
            printHelp();
            break;
          case 'n':
            console.log("Sending a Message...");
            session.sendMessage([144, 60, 127]);
            break;
          case 'e':
            echo = !echo;
            console.log("Echoing is " + (echo ? "on" : "off") + ".");
            break;
          case 'd':
            session.debug = !session.debug;
            console.log("Debug mode is " + (session.debug ? "on" : "off") + ".");
            break;
          case 'l':
            mode = 'remote';
            console.log("Remote sessions: \n");
            console.log(rtpmidi.manager.getRemoteSessions().map(function(session, index) {
              return index + ': ' + session.name + ' (Hostname: ' + session.host + ' Address: ' + session.address + ' Port: ' + session.port + ')';
            }).join('\n'));
            console.log("Press the index number to connect to a session or any other key to go back to main menu.");
            break;
          case '\u0003':
            rtpmidi.manager.reset(function() {
              process.exit();
            });
            break;
        }
        break;
      case 'remote':
        var integer = parseInt(key, 10);
        var sessionInfo = rtpmidi.manager.getRemoteSessions()[integer];
        if (sessionInfo) {
          console.log('Connecting...');
          session.connect(sessionInfo);
        } else {
          printHelp();
        }
        mode = 'main';
        break;
    }
});

module.exports = session;