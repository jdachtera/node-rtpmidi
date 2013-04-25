'use strict';

var service;

if (global.MojoLoader) {
    console.log("Using webos mDNS service");
    service = require('./mdns/service-webos');
} else {
    service = require('./mdns/service-mdns');
}

module.exports = service;
