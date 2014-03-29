var midi = require('midi'),

    hrNow = (function() {
        var ts = Date.now() / 1000,
            hrtime = process.hrtime(),
            diff = ts - (hrtime[0] + hrtime[1] / 1000 / 1000 / 1000);
            
        return function(rate) {
            var hrtime = process.hrtime();
            return Math.round((diff + (hrtime[0]  + hrtime[1] / 1000 / 1000 / 1000)) * rate);
        }
    })(),
        
    rtpmidi = require('../'),
     
    inputs = {},
    outputs = {},
    sessions = {},
    
    i = new midi.input(),
    o = new midi.output(),
    
    isRunning = false,
    latency = 0,
    throttled = false,
    messageQueue = [],
    timeout,
    
    now = hrNow(10000),
    
    port = 5008,
    portMap = {outputs: [], inputs: []};
    

rtpmidi.log.level = 2;
     
 function run() {
     var now = hrNow(10000),
         entry;        
     
     while(messageQueue.length && messageQueue[messageQueue.length - 1][1] - now < latency) {            
         entry = messageQueue.pop();
         outputs[entry[0]].sendMessage(entry[2]);
     }
     
     if (messageQueue.length) {
         isRunning = true;            
         if (messageQueue[messageQueue.length - 1][1] - now >= 5) {
             setTimeout(run,  messageQueue[messageQueue.length - 1][1] - now + latency);
             throttled = true;
         } else {
             setImmediate(run);
             throttled = false;
         }                    
     } else {
         isRunning = false;
     }
 }
     

 function getPorts() {
     var inputCount = i.getPortCount(),
         outputCount = o.getPortCount(),
         id,
         portMap = {inputs: [], outputs: []};
         
         
     for (id = 0; id < inputCount; id++) {
         if (!inputs[id]) {
             inputs[id] = new midi.input();
             inputs[id].openPort(id);             
         }            
         portMap.inputs.push(i.getPortName(id));            
     }
     
     for (id = 0; id < outputCount; id++) {
         if (!outputs[id]) {
             outputs[id] = new midi.output();
             outputs[id].openPort(id);
         }            
         portMap.outputs.push(o.getPortName(id))
     }
     this.portMap = portMap;               
     return portMap;
 }
 
 function sendMidi(id, comexTime, data) {
     var length = messageQueue.length,
         i,
         wasInserted = false;
                         
     if (Buffer.isBuffer(data)) {
         data = Array.prototype.slice.call(data, 0);
     }
     
     if (now > comexTime) {
         outputs[id].sendMessage(data);
         return;
     }
     
     for (i = 0; i < length; i++) {
         if (messageQueue[i][1] > comexTime) {                
             messageQueue.splice(i + 1, 0, arguments);
             wasInserted = true;
             break;
         }
     }
     if (!wasInserted) {
         messageQueue.unshift(arguments);
     }
     
     if (!isRunning) {
         run();
     } else {
         if (throttled && now - comexTime < 5) {
             clearTimeout(timeout);
             run();
         }
         
     }
}

function getSession(name) {
     if (!sessions[name]) {
         sessions[name] = rtpmidi.manager.createSession({port: port, bonjourName: name});
         port += 2;
     }
     return sessions[name];
     
}

function exposePorts() {
    portMap = getPorts();
    
    portMap.outputs.forEach(function(name, id) {
         var session = getSession(name);            
         session.on('message', function(deltaTime, message, comexTime) {                
             sendMidi(id, comexTime, message);                
         });            
    });
    
    portMap.inputs.forEach(function(name, id) {
         var session = getSession(name);
         var lastMessageTime = 0;
         
         inputs[id].on('message', function(deltaTime, message) {                
             lastMessageTime = (lastMessageTime || hrNow(10000)) + Math.round(deltaTime * 10000);                
             session.sendMessage(lastMessageTime, message);
         }); 
    });
}

exposePorts();