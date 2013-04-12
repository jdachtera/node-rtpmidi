var rtpmidi = require("./src/index"),
    session = new rtpmidi.Session(5006, "RTPMidi Test Session");

var echo = false;

session.on('ready', function () {
    console.log("Session is is listening on port 5006.");
    console.log("Commands: ");
    console.log('c: connect to 127.0.0.1:5004');
    console.log('d: Toggle debug mode.')
    console.log('n: send a test note to all streams');
    console.log('e: Toggle echo all incoming message to the sending stream.');
    console.log('l: List available remote sessions.');
});

session.on('streamAdded', function (event) {

    var stream = event.stream;
    console.log("New stream started. SSRC: " + stream.targetSSRC);
    stream.on('message', function (event) {
        event.message.commands.forEach(function (command) {
            console.log('Received a command: ', command);
        });
        if (echo) {
            stream.sendMessage(event.message);
        }
    });
});

session.on('streamRemoved', function (event) {
    console.log('Stream removed ' + event.stream.name);
});

session.start();

var stdin = process.openStdin();
stdin.setRawMode(true);

stdin.resume();
stdin.setEncoding('utf8');

var lastKey = '';

// on any data into stdin
stdin.on('data', function (key) {
    switch (key) {
        case 'c':
            session.connect({address: '127.0.0.1', port: 5004});
            break;
        case 'n':
            console.log("Sending a Message...");
            session.sendMidiMessage(null, [
                {deltaTime: 0, data: [144, 60, 127]}
            ]);
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
            console.log("Remote sessions: \n");
            console.log(rtpmidi.MdnsService.getRemoteSessions());
            console.log("Press the index number to connect to a session.");
            break;
        case '\u0003':
            session.shutdown();
            break;
    }
    var integer = parseInt(key, 10);
    if (!isNaN(integer)) {
        switch (lastKey) {
            case 'l':
                var sessionInfo = rtpmidi.MdnsService.getRemoteSessions()[integer];
                if (sessionInfo) {
                    session.connect(sessionInfo);
                }
                break;
        }
    }
    lastKey = key;
});

module.exports = session;