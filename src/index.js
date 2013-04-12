"use strict";

// Backported Buffer functions for node 0.4.x
var versionParts = process.version.split('.');
if (versionParts[0] === '0' && versionParts[1] === '4') {
    require('./node_0_4_compatibility');
}

module.exports = {
    "Message":          require("./AbstractMessage"),
    "ControlMessage":   require("./ControlMessage"),
    "RTPMessage":       require("./RTPMessage"),
    "MidiMessage":      require("./MidiMessage"),
    "Stream":           require("./Stream"),
    "Session":          require("./Session"),
    "MdnsService":      require("./MdnsService")
};