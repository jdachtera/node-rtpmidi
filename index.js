"use strict";

// Backported Buffer functions for node 0.4.x
var versionParts = process.versions.node.split('.');
if (versionParts[0] === '0' && versionParts[1] === '4') {
    console.log("Using node.JS 0.4 compatiblity mode.");
    require('./src/node_0_4_compatibility');
}

module.exports = {
    manager:            require('./src/manager'),
    webapi:             require('./src/webapi'),
    Session:            require('./src/Session'),
    Stream:             require('./src/Stream'),
    AbstractMessage:    require('./src/AbstractMessage'),
    ControlMessage:     require('./src/ControlMessage'),
    RTPMessage:         require('./src/RTPMessage')
};
