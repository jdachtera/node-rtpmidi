var RTPMidi = require("./src/index"),
    session = new RTPMidi.Session(5006, "RTPMidi Test Session");

var echo = false;

session.on('ready', function () {
    console.log("Session is is listening on port 5006.");
    console.log("Commands: ");
    console.log('c: connect to 127.0.0.1:5004');
    console.log('d: Toggle debug mode.')
    console.log('n: send a test note to all streams');
    console.log('e: Toggle echo all incoming message to the sending stream.');
});

session.on('streamAdded', function (event) {

    var stream = event.stream;
    console.log("New stream started. SSRC: " + stream.targetSSRC);
    stream.on('message', function (event) {
        event.message.commands.forEach(function (command) {
            console.log(command);
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

// on any data into stdin
stdin.on('data', function (key) {
    switch (key) {
        case 'c':
            session.connect({address: '127.0.0.1', port: 5004});
            break;
        case 'n':
            console.log("Sending AbstractMessage...");
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
        case 's':

        case '\u0003':
            session.shutdown();
            break;


    }
});

module.exports = session;