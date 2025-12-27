/**
 * p5 overlay: Bible verses with slow type reveal.
 * Requirements:
 * - No forbidden imagery (text + simple border only)
 * - Gemstone palette used for accents
 * - Clean typography at low-res internal render
 */

function pickPalette(palette) {
  return palette[Math.floor(Math.random() * palette.length)];
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function createVerseOverlay({ mountEl, internal, fps, palette, audio, verseConfig }) {
  const verses = [
    { ref: "Psalm 119:105", text: "Thy word is a lamp unto my feet, and a light unto my path." },
    { ref: "Proverbs 3:5–6", text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths." },
    { ref: "Isaiah 41:10", text: "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness." },
    { ref: "Matthew 11:28", text: "Come unto me, all ye that labour and are heavy laden, and I will give you rest." },
    { ref: "John 14:6", text: "Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me." },
    { ref: "Romans 8:28", text: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose." },
    { ref: "2 Timothy 1:7", text: "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind." },
    { ref: "Philippians 4:6–7", text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God. And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus." }
  ];

  let verseIndex = 0;
  let current = verses[0];
  let accent = pickPalette(palette);

  // State timings
  let startMs = 0;
  let revealDoneMs = 0;
  let fadeStartMs = 0;
  let cycleDoneMs = 0;

  function nextVerse(nowMs) {
    verseIndex = (verseIndex + 1) % verses.length;
    current = verses[verseIndex];
    accent = pickPalette(palette);

    startMs = nowMs;
    revealDoneMs = 0;
    fadeStartMs = 0;
    cycleDoneMs = 0;
  }

  function buildFullText(v) {
    return `“${v.text}”\n\n— ${v.ref}`;
  }

  // Basic wrap: split on spaces; p5.textWidth used at draw time.
  function wrapLines(p, str, maxWidth) {
    const lines = [];
    const paragraphs = str.split("\n");

    for (const para of paragraphs) {
      if (para.trim() === "") {
        lines.push("");
        continue;
      }
      const words = para.split(/\s+/);
      let line = "";
      for (const w of words) {
        const test = line ? (line + " " + w) : w;
        if (p.textWidth(test) <= maxWidth) {
          line = test;
        } else {
          if (line) lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  const sketch = (p) => {
    p.setup = () => {
      const c = p.createCanvas(internal.w, internal.h);
      c.parent(mountEl);
      c.elt.style.pointerEvents = "none";
      c.elt.style.position = "absolute";
      c.elt.style.inset = "0";
      c.elt.style.width = "720px";
      c.elt.style.height = "1280px";
      c.elt.style.imageRendering = "pixelated";

      p.pixelDensity(1);
      p.noSmooth();
      p.frameRate(fps);

      startMs = p.millis();
    };

    p.draw = () => {
      const now = p.millis();
      const full = buildFullText(current);

      // Reveal timing
      const charsVisible = Math.floor((now - startMs) / verseConfig.msPerChar);
      const totalChars = full.length;

      if (charsVisible >= totalChars && revealDoneMs === 0) {
        revealDoneMs = now;
        fadeStartMs = revealDoneMs + verseConfig.holdMs;
        cycleDoneMs = fadeStartMs + verseConfig.fadeMs + verseConfig.gapMs;
      }

      // Alpha envelope
      let alpha = 1;
      if (fadeStartMs && now >= fadeStartMs) {
        const t = (now - fadeStartMs) / verseConfig.fadeMs;
        alpha = 1 - clamp01(t);
      }

      if (cycleDoneMs && now >= cycleDoneMs) {
        nextVerse(now);
      }

      // Clear overlay each frame (transparent canvas)
      p.clear();

      // Subtle PS1-ish wobble: 1px jitter based on audio level (kept very small)
      const j = Math.round((audio.level * 1.25));
      const jx = (j > 0) ? (p.random(-j, j)) : 0;
      const jy = (j > 0) ? (p.random(-j, j)) : 0;

      // Woodcut-ish border frame (simple, non-figurative)
      p.push();
      p.translate(jx, jy);

      // Background plate behind text (kept minimal; lets Hydra show through)
      const plateA = 0.22 * alpha;
      p.noStroke();
      p.fill(0, 0, 0, 255 * plateA);
      p.rect(18, 64, internal.w - 36, internal.h - 128, 8);

      // Border lines (accent color)
      const ac = accent.hex;
      p.stroke(ac);
      p.strokeWeight(1);
      p.noFill();
      p.rect(14, 58, internal.w - 28, internal.h - 116, 10);

      // Inner hatch-like detail (simple linework; engraving vibe)
      p.stroke(255, 255 * 0.08 * alpha);
      for (let y = 74; y < internal.h - 80; y += 6) {
        p.line(26, y, internal.w - 26, y - 2);
      }

      // Text
      p.textAlign(p.LEFT, p.TOP);
      p.textSize(18);
      p.textLeading(24);

      const marginX = 34;
      const marginY = 92;
      const maxW = internal.w - marginX * 2;

      const visibleText = full.slice(0, Math.min(totalChars, charsVisible));
      const lines = wrapLines(p, visibleText, maxW);

      // Shadow for readability
      p.noStroke();
      p.fill(0, 255 * 0.85 * alpha);
      const shadowOff = 1;
      p.text(lines.join("\n"), marginX + shadowOff, marginY + shadowOff);

      // Main text (slightly warm white)
      p.fill(245, 235, 220, 255 * alpha);
      p.text(lines.join("\n"), marginX, marginY);

      // Accent rule
      p.stroke(ac);
      p.strokeWeight(2);
      p.line(marginX, internal.h - 96, internal.w - marginX, internal.h - 96);

      p.pop();
    };
  };

  let p5Instance = null;

  function start() {
    if (!p5Instance) p5Instance = new window.p5(sketch);
  }

  return { start };
}

