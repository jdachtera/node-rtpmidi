# Node RTP Midi

This is a node js implementation of Apples Network Midi Protocol aka RTP Midi. It can act as both a session initiator and session listener.
I can also detect remote sessions via bonjour/mdns. The recovery journal is not supported at the moment.

## Examples:

* [Observe session activity](https://github.com/jdachtera/node-rtpmidi/blob/master/examples/track-sessions.js)
* [Bridge to virtual midi ports](https://github.com/jdachtera/node-rtpmidi/blob/master/examples/rtpmidi-native-bridge.js)
* [Receive MTC messages](https://github.com/jdachtera/node-rtpmidi/blob/master/examples/mtc.js)
