const cbs = [];
let running = false;

function timeout(cb, ms) {
  if (ms) {
    const messageTime = arguments[1] += now();

    if (cbs.length) {
      for (let i = 0; i < cbs.length; i++) {
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
  const hr = process.hrtime();
  return (hr[0] * 1000) + (hr[1] / 1000 / 1000);
}

function run() {
  const n = now();
  for (let i = 0; i < cbs.length; i++) {
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
  for (let i = 0; i < cbs.length; i++) {
    if (cbs[i][0] === cb) {
      cbs.splice(i, 1);
      break;
    }
  }
}
/*
function test(impl, i, cb) {
  var n = now(), c = 0, a = 0, m = 5000;
  function l() {
    var nn = now();
    var nnn = nn-n;
    a += (nnn);
    n = nn;

    if (c < m) {
      c++;
      impl(l, i);
    } else {
      cb(a/c);
    }

  }
  l();
}

var i = 0.000;
test(setTimeout, i, function(result1) {
  test(timeout, i, function(result2) {
    console.log(result1, result2);
  })
});
*/

exports.setTimeout = timeout;
exports.clearTimeout = clear;
exports.now = now;
