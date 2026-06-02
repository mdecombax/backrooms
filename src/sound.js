const FADE_DURATION = 3.0;
const TARGET_VOLUME = 0.45;

export function setupAmbiance() {
  const ctx = new AudioContext();
  const gainNode = ctx.createGain();
  gainNode.gain.value = 0;
  gainNode.connect(ctx.destination);

  let buffer = null;
  let source = null;
  let started = false;

  fetch('/ambiance.mp3')
    .then(r => r.arrayBuffer())
    .then(ab => ctx.decodeAudioData(ab))
    .then(decoded => { buffer = decoded; });

  function play() {
    if (!buffer) return;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 3;
    source.loopEnd = buffer.duration - 3;
    source.connect(gainNode);
    source.start(0, source.loopStart);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(TARGET_VOLUME, ctx.currentTime + FADE_DURATION);
  }

  function start() {
    if (started) return;
    started = true;
    if (ctx.state === 'suspended') {
      ctx.resume().then(play);
    } else {
      play();
    }
  }

  function stop() {
    if (source) { source.stop(); source = null; }
    gainNode.gain.cancelScheduledValues(ctx.currentTime);
    gainNode.gain.value = 0;
    started = false;
  }

  return { start, stop };
}
