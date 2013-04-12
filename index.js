// Backported Buffer functions for node 0.4.x
var versionParts = process.version.split('.');
if (versionParts[0] === '0' && versionParts[1] === '4') {
    require('./node_0_4_compatibility');
}

module.exports = {
    "Message": require("./Message"),
    "ControlMessage": require("./ControlMessage"),
    "RTPMessage": require("./RTPMessage"),
    "RTPMidiMessage": require("./RTPMidiMessage"),
    "RTPMidiStream": require("./RTPMidiStream"),
    "RTPMidiSession": require("./RTPMidiSession")
};