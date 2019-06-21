# Node RTP Midi

This is a node js implementation of Apples Network Midi Protocol aka RTP Midi. It can act as both a session initiator and session listener.
I can also detect remote sessions via bonjour/mdns. The recovery journal is not supported at the moment.

There is also a port of this library to the chrome apps platform: [rtpmidi-chrome](https://github.com/jdachtera/rtpmidi-chrome)

## Examples:

* [Observe session activity](https://github.com/jdachtera/node-rtpmidi/blob/master/examples/track-sessions.js)
* [Bridge to virtual midi ports](https://github.com/jdachtera/node-rtpmidi/blob/master/examples/rtpmidi-native-bridge.js)
* [Receive MTC messages](https://github.com/jdachtera/node-rtpmidi/blob/master/examples/mtc.js)

## TODO:
- [x] Linting and code standards
- [] Setup testing
- [] Migrate local implementation of log() to the debug module
- [] Migrate to class syntax
- [] Better setup documentation / cross-platform handling
- [] Review mdns
