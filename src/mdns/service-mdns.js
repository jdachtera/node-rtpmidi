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

function MDnsService() {
    if (mdns) {
        browser = mdns.createBrowser(service_id);
        browser.on('serviceUp', function (service) {
            remoteSessions[service.name] = service;
            this.emit('remoteSessionUp', sessionDetails(service));
        }.bind(this));
        browser.on('serviceDown', function (service) {
            var srv = remoteSessions[service.name];
            delete(remoteSessions[service.name]);
            this.emit('remoteSessionDown', sessionDetails(srv));
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

MDnsService.prototype.getRemoteSessions = function() {
    var sessions = [];
    for (var name in remoteSessions) {
        if (remoteSessions.hasOwnProperty(name)) {
          sessions.push(sessionDetails(remoteSessions[name]));
        }
    }
    return sessions;
};

module.exports = new MDnsService();
