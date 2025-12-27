
(function installWebGLDebug() {
  const glProto = WebGLRenderingContext.prototype;

  const _compileShader = glProto.compileShader;
  glProto.compileShader = function (shader) {
    _compileShader.call(this, shader);
    if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) {
      console.error("Shader compile failed:\n", this.getShaderInfoLog(shader));
      console.log("Shader source:\n", this.getShaderSource(shader));
    }
  };

  const _linkProgram = glProto.linkProgram;
  glProto.linkProgram = function (program) {
    _linkProgram.call(this, program);
    if (!this.getProgramParameter(program, this.LINK_STATUS)) {
      console.error("Program link failed:\n", this.getProgramInfoLog(program));
    }
  };
})();


import { createHydraController } from "./hydra.js";
import { createVerseOverlay } from "./overlay.js";

/**
 * Central configuration (timings + render targets).
 * Keep internal resolution at 360x640 for PS1-ish pixel scale-up to 720x1280.
 */
const CONFIG = {
  fps: 24,
  internal: { w: 360, h: 640 },
  target: { w: 720, h: 1280 },

  // Hands-off timings
  hydraPresetMs: 22_000,
  verse: {
    // Total cycle = reveal + hold + fade
    msPerChar: 28,     // typing speed
    holdMs: 9_000,
    fadeMs: 1_000,
    gapMs: 600         // brief gap between verses
  },

  // Gemstone palette (exact hexes)
  palette: [
    { name: "Sardius",      hex: "#A81919" },
    { name: "Vermilion",    hex: "#894014" },
    { name: "Amber",        hex: "#675210" },
    { name: "Topaz",        hex: "#50590D" },
    { name: "Chrysolyte",   hex: "#365E0E" },
    { name: "Emerald",      hex: "#19620F" },
    { name: "Chrysoprasus", hex: "#0F6224" },
    { name: "Beryl",        hex: "#0E6042" },
    { name: "Crystal",      hex: "#0E5E5E" },
    { name: "Chalcedony",   hex: "#145A83" },
    { name: "Sapphire",     hex: "#1E48C7" },
    { name: "Jacinth",      hex: "#3F25F6" },
    { name: "Purple",       hex: "#751ECB" },
    { name: "Amethyst",     hex: "#8F18A0" },
    { name: "Scarlet",      hex: "#9C177A" },
    { name: "Crimson",      hex: "#A3194D" }
  ]
};

/**
 * WebAudio mic input -> analyser metrics used by Hydra + p5.
 * Uses one getUserMedia call; permissions are handled by the browser.
 */
class AudioInput {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.dataTime = null;
    this.dataFreq = null;

    this.level = 0;   // smoothed RMS
    this.bass = 0;    // 0..1
    this.mid = 0;
    this.treble = 0;

    this._smooth = 0.85;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      
      video: false
    });

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(stream);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.75;

    src.connect(this.analyser);

    this.dataTime = new Uint8Array(this.analyser.fftSize);
    this.dataFreq = new Uint8Array(this.analyser.frequencyBinCount);
  }

  update() {
    if (!this.analyser) return;

    // RMS from time-domain
    this.analyser.getByteTimeDomainData(this.dataTime);
    let sum = 0;
    for (let i = 0; i < this.dataTime.length; i++) {
      const v = (this.dataTime[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.dataTime.length); // ~0..1
    const nextLevel = Math.min(1, rms * 2.0);

    // Simple banding from frequency-domain (very approximate but effective)
    this.analyser.getByteFrequencyData(this.dataFreq);

    const n = this.dataFreq.length;
    const b0 = 0;
    const b1 = Math.floor(n * 0.15); // bass
    const m1 = Math.floor(n * 0.55); // mid
    const t1 = n;                    // treble

    const avg = (from, to) => {
      let s = 0;
      for (let i = from; i < to; i++) s += this.dataFreq[i];
      return (s / Math.max(1, (to - from))) / 255;
    };

    const nextBass = avg(b0, b1);
    const nextMid = avg(b1, m1);
    const nextTreble = avg(m1, t1);

    // Smooth everything for stability
    const k = this._smooth;
    this.level  = this.level  * k + nextLevel  * (1 - k);
    this.bass   = this.bass   * k + nextBass   * (1 - k);
    this.mid    = this.mid    * k + nextMid    * (1 - k);
    this.treble = this.treble * k + nextTreble * (1 - k);
  }
}

function hideUI() {
  const ui = document.getElementById("ui");
  if (ui) ui.style.display = "none";
}

function showUI() {
  const ui = document.getElementById("ui");
  if (ui) ui.style.display = "grid";
}

async function startApp() {
  // Always create an audio object, even if mic fails.
  const audio = new AudioInput();

  // Try to start mic, but do not abort visuals if it fails.
  let micOk = false;
  try {
    await audio.start();
    micOk = true;
  } catch (err) {
    console.error("Mic start failed:", err);
    // continue without audio
  }

  const hydra = createHydraController({
    canvas: document.getElementById("hydra"),
    internal: CONFIG.internal,
    palette: CONFIG.palette,
    audio
  });

  const overlay = createVerseOverlay({
    mountEl: document.getElementById("stage"),
    internal: CONFIG.internal,
    fps: CONFIG.fps,
    palette: CONFIG.palette,
    audio,
    verseConfig: CONFIG.verse
  });

  // Start visuals regardless of mic
  hydra.startScheduler(CONFIG.hydraPresetMs);
  overlay.start();

  // Tick audio metrics only if mic started
  if (micOk) {
    const frameMs = 1000 / CONFIG.fps;
    setInterval(() => audio.update(), frameMs);

    setInterval(() =>{
      console.log(
        "[mic] level=",
        audio.level.toFixed(3),
        "bass=",
        audio.bass.toFixed(3),
        "mid=",
        audio.mid.toFixed(3),
        "treble=",
        audio.treble.toFixed(3)
      );
    } ,1000);
  }

  hideUI();
}

// Attempt auto-start if mic permission was previously granted.
// If it fails (no permission yet), show UI and require click.
async function tryAutostart() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return false;
    const p = await navigator.permissions.query({ name: "microphone" });
    if (p.state === "granted") {
      await startApp();
      return true;
    }
  } catch (_) {
    // Ignore; fall back to click-to-start
  }
  return false;
}

document.getElementById("startBtn").addEventListener("click", async () => {
  try {
    await startApp();
  } catch (err) {
    console.error(err);
    showUI();
    alert("Could not start audio. Check mic permissions and selected microphone device.");
  }
});

tryAutostart().then((ok) => {
  if (!ok) showUI();
});

