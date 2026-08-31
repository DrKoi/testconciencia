/* Codificador MP3 en segundo plano — usa lamejs (LAME compilado a JS).
   Todo el procesamiento ocurre en el navegador; nada se sube a ningún servidor. */
importScripts('lame.min.js');

function floatToInt16(input) {
  var out = new Int16Array(input.length);
  for (var i = 0; i < input.length; i++) {
    var s = input[i];
    if (s > 1) s = 1; else if (s < -1) s = -1;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

self.onmessage = function (e) {
  var d = e.data;
  var left = d.left;
  var right = d.right;
  var sampleRate = d.sampleRate;
  var bitrate = d.bitrate;
  var channels = d.channels;

  try {
    var encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
    var blockSize = 1152;
    var len = left.length;
    var chunks = [];

    var l16 = floatToInt16(left);
    var r16 = channels === 2 && right ? floatToInt16(right) : null;

    var lastReport = 0;
    for (var i = 0; i < len; i += blockSize) {
      var lch = l16.subarray(i, i + blockSize);
      var mp3buf;
      if (channels === 2) {
        var rch = r16.subarray(i, i + blockSize);
        mp3buf = encoder.encodeBuffer(lch, rch);
      } else {
        mp3buf = encoder.encodeBuffer(lch);
      }
      if (mp3buf.length > 0) chunks.push(new Uint8Array(mp3buf));

      if (i - lastReport > blockSize * 50) {
        lastReport = i;
        self.postMessage({ type: 'progress', value: i / len });
      }
    }

    var tail = encoder.flush();
    if (tail.length > 0) chunks.push(new Uint8Array(tail));

    var total = 0;
    for (var c = 0; c < chunks.length; c++) total += chunks[c].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (var k = 0; k < chunks.length; k++) {
      out.set(chunks[k], off);
      off += chunks[k].length;
    }

    self.postMessage({ type: 'done', data: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
