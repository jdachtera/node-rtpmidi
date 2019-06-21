var cbs = [],
running = false;

function timeout(cb, ms) {
  if (ms) {
    var messageTime = arguments[1] += now();
    
    
    if (cbs.length) {
      for (var i = 0; i < cbs.length; i++) {
        if (cbs[i]['1'] <= messageTime) {
          cbs.splice(i + 1, 0, arguments);
          break;
        }
      }
    } else {
      cbs.push(arguments);
    }
    
    if (!running) {
      running = true;
      setImmediate(run);
    }
  } else {
    cb();
  }
  
  return cb;
}

function now() {
  var hr = process.hrtime();
  return (hr[0] * 1000) + (hr[1] / 1000 / 1000);
}

function run() {
  var n = now();
  for (var i = 0; i < cbs.length; i++) {
    if (cbs[i]['1'] <= n) {
      cbs[i]['0']();
      cbs.splice(i, 1);
    } else {
      break;
    }
  }
  if (cbs.length) {
    setImmediate(run);
    running = true;
  } else {
    running = false;
  }
}

function clear(cb) {
  for (var i = 0; i < cbs.length; i++) {
    if (cbs[i][0] === cb) {
      cbs.splice(i, 1);
      break;
    }
  }
}

exports.setTimeout = timeout;
exports.clearTimeout = clear;
exports.now = now;
