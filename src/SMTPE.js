var util = require("util"),
    EventEmitter = require("events").EventEmitter;

function SMTPE() {
	EventEmitter.apply(this);
	this.hours = 0;
	this.minutes = 0;
	this.seconds = 0;
	this.frames = 0;
	this.type = 0;
};

util.inherits(SMTPE, EventEmitter);


SMTPE.prototype.setSource = function(sessionOrStream) {
	sessionOrStream.on('message', function(deltaTime, message) {
		if (message[0] === 0xf1) {
			this.applyQuarterTime(message[1]);
		}
	}.bind(this));
};


// Build the SMTPE timestamp of 8 subsequent quarter time commands
// http://www.blitter.com/~russtopia/MIDI/~jglatt/tech/mtc.htm
SMTPE.prototype.applyQuarterTime = function(quarterTime) {
	var type = (quarterTime >> 4) & 0x7,
		nibble = quarterTime & 0x0f,
		operator;

	if (type % 2 === 0) {
		// Low nibble
		operator = 0xf0;		
	} else {
		// High nibble
		nibble = nibble << 4;
		operator = 0x0f;
	}

	switch(type) {
		case 0:
		case 1:
			this.frames = this.frames & operator | nibble;
			break;
		case 2:		
		case 3:
			this.seconds = this.seconds & operator | nibble;
			break;
		case 4:
		case 5:
			this.minutes = this.minutes & operator | nibble;
			break;
		case 6:
		case 7:
			if (type % 2 === 1) {
				this.type = (nibble >> 5) & 0x3;
				nibble = nibble & 0x10;
			}
			this.hours = this.hours & operator | nibble;			
			break;
	}
	this.emit('change', type);
};

function pad(number) {
	if (number < 10) {
		return '0' + number;
	} else {
		return number.toString();
	}
}

SMTPE.prototype.toString = function() {
	return pad(this.hours) + ':' + pad(this.minutes) + ':' + pad(this.seconds) + ':' + pad(this.frames);
}

module.exports = SMTPE;