"use strict";

// Backported Buffer functions for node 0.4.x
var versionParts = process.versions.node.split('.');
if (versionParts[0] === '0' && versionParts[1] === '4') {
    console.log("Using node.JS 0.4 compatiblity mode.");
    require('./src/node_0_4_compatibility');
}

module.exports = require('./src/manager');
