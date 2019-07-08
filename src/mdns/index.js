/* eslint-disable global-require */
let service;

if (global.MojoLoader) {
  service = require('./service-webos');
} else {
  service = require('./service-mdns');
}

module.exports = service;
