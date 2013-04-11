// Backported Buffer functions for node 0.4.x
var versionParts = process.version.split('.');
if (versionParts[0] === '0' && versionParts[1] === '4') {
    require('./node_0_4_compatibility');
}

module.exports = {
    "Message":          require("./Message"),
    "AppleMidiMessage": require("./AppleMidiMessage"),
    "RTPMessage":       require("./RTPMessage"),
    "RTPMidiMessage":   require("./RTPMidiMessage"),
    "RTPMidiSession":   require("./RTPMidiSession"),
    "RTPMidiServer":    require("./RTPMidiServer")
};