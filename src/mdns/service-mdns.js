'use strict';

var mdns = null,
  util = require('util'),
  EventEmitter = require('events').EventEmitter,
  service_id = '_apple-midi._udp',
  publishedSessions = [],
  advertisments = [],
  remoteSessions = {},
  browser = null,
  avahi_pub;

try {
  mdns = require('mdns2');
} catch (e) {
  console.log('mDNS discovery is not available.');
}

try {
  avahi_pub = require('avahi_pub');
} catch(e) {}



function sessionDetails(session) {
  var addressV4 = null,
    addressV6 = null;

  if (session.addresses) {
    session.addresses.forEach(function(address) {

      if (address.search(/\./) > -1 && !addressV4) {
        addressV4 = address;
      } else if (address.search(':') > -1 && !addressV6) {
        addressV6 = address;
      }
    });
  }

  return {
    name: session.name,
    port: session.port,
    address: addressV4,
    addressV6: addressV6,
    host: session.host
  };
}
var details = {};

function MDnsService() {
  if (mdns) {
    browser = mdns.createBrowser(service_id);
    browser.on('serviceUp', function (service) {
      remoteSessions[service.name] = service;
      details[service.name] = sessionDetails(service);
      updateRemoteSessions();
      this.emit('remoteSessionUp', details[service.name]);
    }.bind(this));
    browser.on('serviceDown', function (service) {
      var d = details[service.name];
      delete(remoteSessions[service.name]);
      delete(details[service.name]);
      updateRemoteSessions();
      this.emit('remoteSessionDown', d);

    
    }.bind(this));

  }
}

util.inherits(MDnsService, EventEmitter);

MDnsService.prototype.start = function () {
  remoteSessions = {};
  if (mdns) {
    browser.start();
  } else {
    console.log('mDNS discovery is not available.')
  }
};

MDnsService.prototype.stop = function() {
  if (mdns && browser) {
    browser.stop();
  }
};

MDnsService.prototype.publish = function(session) {
  if (publishedSessions.indexOf(session) !== -1) {
    return;
  }
  publishedSessions.push(session);

  if (avahi_pub && avahi_pub.isSupported()) {
    var ad = avahi_pub.publish({
      name: session.bonjourName,
      type: service_id,
      port: session.port
    });
    advertisments.push(ad);

  } else if (mdns) {
    var ad = mdns.createAdvertisement(service_id, session.port, {
      name: session.bonjourName
    });
    advertisments.push(ad);
    ad.start();
  }

};

MDnsService.prototype.unpublish = function(session) {
  var index = publishedSessions.indexOf(session);
  if (index === -1) {
    return;
  }
  var ad = advertisments[index];

  if (avahi_pub && avahi_pub.isSupported()) {
    ad.remove();
  } else if (mdns) {
    ad.stop();
  }

  publishedSessions.splice(index);
  advertisments.splice(index);
};

var sessions = [];

function updateRemoteSessions() {
  sessions.length = 0;
  for (var name in details) {
    if (details.hasOwnProperty(name)) {
      sessions.push(details[name]);
    }
  }
};

MDnsService.prototype.getRemoteSessions = function() {
  return sessions;
};

module.exports = new MDnsService();
