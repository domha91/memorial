/**
 * Hydra background controller.
 * - Renders at 360x640 (internal)
 * - Uses WebAudio-derived metrics (level/bass/mid/treble) passed in
 * - Cycles presets automatically
 */

function hexToRgb01(hex) {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return { r, g, b };
}

function pickPalette(palette) {
  const c = palette[Math.floor(Math.random() * palette.length)];
  return { ...c, rgb: hexToRgb01(c.hex) };
}

export function createHydraController({ canvas, internal, palette, audio }) {
  // Hydra global init
  const hydra = new window.Hydra({
    canvas,
    detectAudio: false, // we provide our own audio metrics
    makeGlobal: true,
    precision: "mediump"
  });
  hydra.setResolution(internal.w, internal.h);

  // Convenience accessors
  const A = () => audio.level;
  const B = () => audio.bass;
  const M = () => audio.mid;
  const T = () => audio.treble;

  // Amplify (your observed levels are modest; this makes reactivity obvious)
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const gain = (x, k) => clamp01(x * k);

  const AL = () => gain(A(), 3.2);  // level
  const BA = () => gain(B(), 2.0);  // bass
  const MI = () => gain(M(), 2.5);  // mid
  const TR = () => gain(T(), 3.0);  // treble (often small; still useful when present)

  // Safe time source (avoid relying on window.time)
  const t = () => performance.now() * 0.001;

  // Subtle, cheap “ordered-ish” texture layer (pseudo-dither feel)
  const ditherLayer = (amt = 0.12) =>{
    window
      .noise(8, 0.15)
      .posterize(3)
      .contrast(1.2)
      .brightness(-0.15)
      .luma(0.35)
  }
  
  const presets = [

    // 2) Voronoi “plate” + osc modulation + luma gating (strong bass + level response)
    () => {
      const c = pickPalette(palette);
      voronoi(
        4 + 10 * BA(),                // cell density reacts to bass
        0.12 + 0.35 * AL(),            // speed reacts to overall level
        () => 5 + 40 * MI()            // edge detail reacts to mid
      )
        .modulate(
          osc(2 + 10 * BA(), 0.04 + 0.18 * AL(), 0.7),
          () => 0.08 + 0.45 * MI()     // modulation depth reacts to mid
        )
        .luma(() => 0.18 + 0.55 * AL()) // gate opens/closes with level (very visible)
        .posterize(4)
        .contrast(1.6)
        .color(c.rgb.r, c.rgb.g, c.rgb.b)
        .pixelate(150, 270)
        .out();
    },

    // 3) Repeated shape + modulateRotate wobble (mid drives rotation; level drives threshold)
    () => {
      const c = pickPalette(palette);
      shape(
        4,
        () => 0.22 + 0.40 * BA(),       // size breathes with bass
        () => 0.01 + 0.05 * AL()        // edge softness with level
      )
        .repeat(2 + Math.floor(3 * BA()), 4) // pattern density steps with bass
        .rotate(() => 0.05 + 0.60 * MI())    // rotation responds to mid
        .modulateRotate(
          noise(1.5 + 3.5 * MI(), 0.12 + 0.20 * AL()),
          () => 0.05 + 0.55 * MI()          // rotate modulation depth with mid
        )
        .thresh(() => 0.22 + 0.55 * AL())    // high-contrast gating with level
        .posterize(4)
        .contrast(1.7)
        .color(c.rgb.r, c.rgb.g, c.rgb.b)
        .pixelate(170, 300)
        .out();
    },

    // 4) Noise base + osc modulation + luma gating (level = brightness/pulse; bass = motion)
    () => {
      const c = pickPalette(palette);
      noise(
        1.2 + 4.0 * BA(),               // noise scale reacts to bass
        () => 0.08 + 0.45 * AL()        // speed reacts to level
      )
        .modulate(
          osc(5 + 18 * BA(), 0.03 + 0.16 * AL(), 0.8),
          () => 0.06 + 0.40 * MI()
        )
        .luma(() => 0.14 + 0.60 * AL()) // very visible gating with level
        .posterize(5)
        .contrast(1.55)
        .brightness(() => -0.25 + 0.55 * AL()) // obvious “pumping” without flashing
        .color(c.rgb.r, c.rgb.g, c.rgb.b)
        .pixelate(150, 270)
        .out();
    },

    // 5) Kaleid osc + noise modulation + threshold (bass drives symmetry feel, level drives strobe-ish gating)
    () => {
      const c = pickPalette(palette);
      osc(
        2 + 14 * BA(),                  // frequency reacts to bass
        0.02 + 0.20 * AL(),             // speed reacts to level
        0.65
      )
        .kaleid(3 + Math.floor(4 * BA())) // symmetry steps with bass (stable, “PS1-ish”)
        .modulate(
          noise(1.0 + 4.0 * MI(), 0.10 + 0.25 * AL()),
          () => 0.08 + 0.45 * MI()
        )
        .thresh(() => 0.18 + 0.55 * AL())  // gate responds to level
        .posterize(4)
        .contrast(1.65)
        .brightness(() => -0.22 + 0.50 * AL())
        .color(c.rgb.r, c.rgb.g, c.rgb.b)
        .pixelate(170, 300)
        .out();
    },

    () => {
      const c = pickPalette(palette);
      window
        .osc(6, 0.02 + 0.06 * A(), 0.8)
        .thresh(0.35)
        .posterize(4)
        .contrast(1.5)
        .color(c.rgb.r, c.rgb.g, c.rgb.b)
        .pixelate(180, 320)
        .out();
    },

    () => {
      const c = pickPalette(palette);
      window
        .noise(2, 0.12 + 0.25 * A())
        .luma(0.35)
        .posterize(4)
        .contrast(1.6)
        .color(c.rgb.r, c.rgb.g, c.rgb.b)
        .pixelate(160, 280)
        .out();
    },

    () => {
      const c = pickPalette(palette);
      window
        .shape(4, 0.38 + 0.10 * B(), 0.02)
        .repeat(3, 5)
        .thresh(0.33)
        .posterize(4)
        .contrast(1.65)
        .color(c.rgb.r, c.rgb.g, c.rgb.b)
        .pixelate(180, 320)
        .out();
    },

    // 1) Engraved osc + noise modulation + threshold
    () => { const c = pickPalette(palette);
      window
        .osc(10, 0.04 + 0.08 * A(), 0.9)
        .rotate(() => 0.03 + 0.12 * B())
        .modulate(window.noise(2, 0.25), () => 0.10 + 0.35 * M())
        .thresh(() => 0.40 + 0.20 * A())
        .posterize(4)
        .contrast(1.45)
        .color(c.rgb.r, c.rgb.g, c.rgb.b)
        //.add(ditherLayer(), 0.1)
        .pixelate(180, 320)
        .out();
    },
  ];

  let idx = 0;
  let presetTimer = null;

  function runPreset(i) {
    idx = (i + presets.length) % presets.length;
    // Clear to black very briefly for stability between chains
    window.solid(0, 0, 0, 1).out();
    presets[idx]();
  }

  function startScheduler(ms) {
    runPreset(0);
    if (presetTimer) clearInterval(presetTimer);
    presetTimer = setInterval(() => runPreset(idx + 1), ms);
  }

  return {
    startScheduler,
    runPreset,
    getPresetIndex: () => idx
  };
}

