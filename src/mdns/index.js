

let service;

if (global.MojoLoader) {
  console.log('Using webos mDNS service');
  service = require('./service-webos');
} else {
  service = require('./service-mdns');
}

module.exports = service;
