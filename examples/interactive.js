var rtpmidi = require(".."),
  w = console.log.bind(console),
  mode = 'main',
  sessionConfiguration = null,
  sessionConfigurationDefaults = {name: 'MySession', bonjourName: 'Node RTP Midi', port: 5008},
  sessionProperties = ['name', 'bonjourName', 'port'],
  sessionProperty,
  session = null,
  stdin = process.openStdin();


stdin.setRawMode(true);

stdin.resume();
stdin.setEncoding('utf8');

rtpmidi.manager.startDiscovery();


main();

// on any data into stdin
stdin.on('data', function (key) {
  if(key == '\u0003') {
    rtpmidi.manager.reset(function() {
      process.exit();
    });
  }

    switch(mode) {
      case 'main':
        switch (key) {
          case 'c':
            if (!session) {
              return w('Select a local session first');
            }
            session.connect({address: '127.0.0.1', port: 5004});
            break;
          case 's':
            mode = 'newSession';
            sessionConfiguration = {};
            sessionProperty = 0;
            newSession(null);
            break;
          case 'h':
            main();
            break;
          case 'n':
            if (!session) {
              main();
              return w('Select a local session first');
            }
            w("Sending a Message...");
            session.sendMessage([144, 60, 127]);
            break;
          case 'd':
            rtpmidi.log.level = !rtpmidi.log.level;
            w("Debug mode is " + (session.debug ? "on" : "off") + ".");
            main();
            break;
          case 'l':
            listSessions();
            break;
          case 'r':
            listRemoteSessions();
            break;
        }
        break;
      case 'remote':
        var integer = parseInt(key, 10);
        var sessionInfo = rtpmidi.manager.getRemoteSessions()[integer];
        if (sessionInfo) {
          w('Connecting...');
          session.connect(sessionInfo);
        }
        main();
        break;
      case 'sessions':
        var integer = parseInt(key, 10);
        session = rtpmidi.manager.getSessions()[integer];
        if (session) {
          w('Selected session ' + integer);
        }
        main();
        break;
      case 'newSession':
        newSession(key);
        break;
    }
});


function main() {
  mode = 'main';
  w('Commands: ');
  w('h: Print this help message');
  w('s: Create a new local session');
  w('c: connect to 127.0.0.1:5004');
  w('d: Toggle debug mode.');
  w('n: send a test note to all streams');
  w('l: List the local sessions.');
  w('r: List the available remote sessions.');
}

function listRemoteSessions() {

  w("Remote sessions: \n");
  w(rtpmidi.manager.getRemoteSessions().map(function(session, index) {
    return index + ': ' + session.name + ' (Hostname: ' + session.host + ' Address: ' + session.address + ' Port: ' + session.port + ')';
  }).join('\n'));

  if (!session) {
    main();
    return w('To connect to a remote session select a local session first ');
  } else {
    mode = 'remote';
    w("Press the index number to connect to a session or any other key to go back to main menu.");
  }

}

function listSessions() {
  mode = 'sessions';
  w("Local sessions: \n");
  w(rtpmidi.manager.getSessions().map(function(session, index) {
    return index + ': ' + session.name + ' (Bonjour name: ' + session.bonjourName + ' Address: ' + session.address + ' Port: ' + session.port + ')';
  }).join('\n'));
  w("Press the index number to select a session or any other key to go back to main menu.");
}


function createSession(conf) {

  session = rtpmidi.manager.createSession(conf);

  session.on('streamAdded', function (event) {

    var stream = event.stream;
    w("New stream started. SSRC: " + stream.ssrc);
    stream.on('message', function (deltaTime, message) {
      w('Received a command: ', message);
    });
  });

  session.on('streamRemoved', function (event) {
    w('Stream removed ' + event.stream.name);
  });

  session.start();
  main();
}

function newSession(key) {
  switch(key) {
    case '\u001b':
      main();
      break;
    case '\u000d':
      if (sessionConfiguration[sessionProperties[sessionProperty]] === '') {
        sessionConfiguration[sessionProperties[sessionProperty]] = sessionConfigurationDefaults[sessionProperties[sessionProperty]];
      }
      process.stdout.write('\n');
      sessionProperty++;
      if (sessionProperty === sessionProperties.length) {
        sessionConfiguration.port = parseInt(sessionConfiguration.port, 10);
        createSession(sessionConfiguration);
        w('Session started');
        sessionConfiguration = null;
        sessionProperty = 0;
      } else {
        newSession(null);
      }
      break;
    case '\u007f':
      if (sessionConfiguration[sessionProperties[sessionProperty]] && sessionConfiguration[sessionProperties[sessionProperty]].length) {
        sessionConfiguration[sessionProperties[sessionProperty]] = sessionConfiguration[sessionProperties[sessionProperty]].slice(0, -1);
        process.stdout.write('\r' + sessionConfiguration[sessionProperties[sessionProperty]]);
      }
      break;
    case null:
      w('Type in the ' + sessionProperties[sessionProperty] + ' of the new session and press Enter. Default: ' + sessionConfigurationDefaults[sessionProperties[sessionProperty]]);
      sessionConfiguration[sessionProperties[sessionProperty]] = '';
      break;
    default:
      sessionConfiguration[sessionProperties[sessionProperty]] += key;
      process.stdout.write(key);
      break;
  }
}

module.exports = session;