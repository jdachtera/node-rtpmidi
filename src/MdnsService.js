"use strict";

var mdns                = require('mdns'),
    util                = require("util"),
    EventEmitter        = require("events").EventEmitter,
    service_id          = '_apple-midi._udp',
    publishedSessions   = [],
    advertisments       = [],
    remoteSessions      = [],
    browser;


function sessionDetails(session, index) {
    return {name: session.name, port: session.port, address: session.addresses && session.addresses[0], host:session.host, index: index};
}

function MdnsService(){
    browser = mdns.createBrowser(service_id);

    browser.on('serviceUp', function(service) {
        var index = remoteSessions.push(service);
        this.emit('remoteSessionUp', sessionDetails(service, index));
    });
    browser.on('serviceDown', function(service) {
        var index = remoteSessions.indexOf(service);
        remoteSessions.splice(index);
        this.emit('remoteSessionDown', sessionDetails(service, index));
    });
    browser.start();
}

util.inherits(MdnsService, EventEmitter);

MdnsService.prototype.publish = function publish(session) {
    if (publishedSessions.indexOf(session) !== -1) {
        return;
    }
    var index = publishedSessions.length;
    publishedSessions.push(session);
    var ad = mdns.createAdvertisement(service_id, session.port, {name: service.name});
    advertisments.push(ad);
    ad.start();
};

MdnsService.prototype.unpublish = function unpublish(session) {
    var index = publishedSessions.indexOf(session)
    if (index === -1) {
        return;
    }
    var ad = advertisments[index];
    ad.stop();
    publishedSessions.splice(index);
    advertisments.splice(index);
};

MdnsService.prototype.getRemoteSessions = function getRemoteSessions() {
    return remoteSessions.map(sessionDetails);
};

module.exports = new MdnsService();





