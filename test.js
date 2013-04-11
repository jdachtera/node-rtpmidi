var RTPMidiServer = require("./index").RTPMidiServer;

var s = new RTPMidiServer(5006, "Test");


s.on('ready', function() {
    console.log("Server is ready");



});

s.on('sessionAdded', function(event) {
	console.log("New session started. SSRC: " + event.session.targetSSRC);
	var session = event.session;
	/*
	session.on('message', function(event) {
		event.message.commands.forEach(function(command) {
			console.log(command);
			session.sendMessage({commands: [command]});
		});
	})
	*/
	setInterval(function() {

		//session.sendMessage({commands: [{deltaTime: 0, data: [0x90, 60, 127]}]});
	}, 1000)
});

s.on('sessionRemoved', function(event) {
    console.log('Session removed ' + event.session.name);
});

s.start();

var stdin = process.openStdin();
//  stdin.setRawMode(true);
require('tty').setRawMode(true);
stdin.resume();
stdin.setEncoding( 'utf8' );


// on any data into stdin
stdin.on( 'data', function( key ){
    switch(key) {
        case 'c':
            s.connect({address: '127.0.0.1',port: 5004});
            break;
        case 'n':
            console.log("Sending Message...");
            s.sendMidiMessage(null, [{deltaTime: 0, data: [144, 60, 127]}]);
            break;
        case '\u0003':
            s.shutdown();
            break;


    }
});



module.exports = s;
