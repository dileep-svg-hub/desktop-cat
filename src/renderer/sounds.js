/*
  src/renderer/sounds.js  —  optional cat sounds
  -----------------------------------------------
  The kitten is silent by default. If you put your own recordings in
  assets/sounds (meow.wav / purr.wav, or .mp3 / .ogg), they're played when the
  cat meows, or when you click or pet it. See assets/sounds/README.txt.

  The browser's "Web Audio" engine is only started when there's something to
  play, and paused again afterwards, so it costs no CPU while quiet.
*/

const VOLUME = 0.5;           // loudness of your recordings (0..1)

class CatSounds {
  constructor() {
    this.ac = null;           // the audio engine, created on first use
    this.master = null;
    this.muted = false;
    this.active = 0;          // sounds currently playing
    this.recordings = {};     // name -> base64 of a sound file (if any)
    this.decoded = {};        // name -> decoded AudioBuffer
  }

  setMuted(muted) { this.muted = !!muted; }

  setRecordings(sounds) { this.recordings = sounds || {}; }

  engine() {
    if (!this.ac) {
      this.ac = new AudioContext();
      this.master = this.ac.createGain();
      this.master.gain.value = VOLUME;
      this.master.connect(this.ac.destination);
    }
    return this.ac;
  }

  // Turn a base64 recording into something playable (once).
  async recording(name) {
    if (!this.recordings[name]) return null;
    if (!this.decoded[name]) {
      const bytes = Uint8Array.from(atob(this.recordings[name]), (c) => c.charCodeAt(0));
      try {
        this.decoded[name] = await this.engine().decodeAudioData(bytes.buffer);
      } catch (err) {
        console.warn('Could not read sound file', name, err);
        this.recordings[name] = null;
        return null;
      }
    }
    return this.decoded[name];
  }

  async play(name) {
    if (this.muted || !this.recordings[name]) return;   // no recording = no sound
    const buf = await this.recording(name);
    if (!buf) return;
    const ac = this.engine();
    if (ac.state === 'suspended') await ac.resume();
    const source = ac.createBufferSource();
    source.buffer = buf;
    source.connect(this.master);
    source.start();
    this.active++;
    source.onended = () => {
      this.active--;
      if (this.active === 0) ac.suspend();   // nothing playing: let the audio engine rest
    };
  }

  meow() { return this.play('meow'); }
  purr() { return this.play('purr'); }
}

const sounds = new CatSounds();
