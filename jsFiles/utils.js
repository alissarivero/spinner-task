
// independent WebGazer sessions — do not restore prior IndexedDB training
window.saveDataAcrossSessions = false;

// initialize jsPsych
const jsPsych = initJsPsych({
    extensions: [{
        type: jsPsychExtensionWebgazer,
        params: { round_predictions: true, sampling_interval: 34 },
    }],
    on_finish: (data) => {
        if (jsPsych.extensions.webgazer) jsPsych.extensions.webgazer.pause();
        data.boot = boot;
        jsPsych.data.get().localSave("csv", filename);
        if (!boot) {
            document.body.innerHTML =
                `<div align='center' style="margin: 10%">
                    <p>Thank you for participating!<p>
                    <p>Your data file (<strong>${filename}</strong>) has been downloaded.</p>
                    <b>You will be automatically re-directed to Prolific in a few moments.</b>
                </div>`;
            setTimeout(() => {
                location.href = `https://app.prolific.co/submissions/complete?cc=${completionCode}`
            }, 2000);
        } else {
            document.body.innerHTML =
                `<div class="session-done" align='center' style="margin: 10%">
                    <p>Thank you for participating!</p>
                    <p>Your data file (<strong>${filename}</strong>) has been downloaded.</p>
                    <p>Please keep this window open until the experimenter confirms they have the file.</p>
                    <button type="button" id="download-again" class="jspsych-btn">Download data again</button>
                </div>`;
            const again = document.getElementById("download-again");
            if (again) {
                again.addEventListener("click", () => {
                    jsPsych.data.get().localSave("csv", filename);
                });
            }
        }
    },
});

// subject ID and run mode are set on the home screen
let subject_id = null;
let filename = "pending.csv";
let runMode = null;

const setSubject = (id) => {
    subject_id = String(id).trim();
    filename = `${subject_id}.csv`;
    boot = true; // live Zoom / lab session — stay on the thank-you screen, no Prolific redirect
    jsPsych.data.addProperties({ subject: subject_id, run_mode: runMode });
};

// Space mutes Zoom if this tab is not focused. Cover the page until they click back.
const installStudyFocusGuard = () => {
    if (document.getElementById("study-focus-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "study-focus-overlay";
    overlay.innerHTML =
        "<div class='study-focus-card'>" +
        "<p><strong>Click this window to continue</strong></p>" +
        "<p>If Zoom is selected, the space bar will mute your microphone instead of spinning the wheel.</p>" +
        "</div>";
    document.body.appendChild(overlay);
    const sync = () => {
        overlay.classList.toggle("is-visible", !document.hasFocus());
    };
    window.addEventListener("blur", sync);
    window.addEventListener("focus", sync);
    overlay.addEventListener("pointerdown", () => window.focus());
    sync();
};

// define completion code for Prolific
const completionCode = "C1ACNNE6";

// when true, boot participant from study without redirecting to Prolific
let boot = false;

// function for saving survey data in wide format
const saveSurveyData = (data) => {
    const names = Object.keys(data.response);
    const values = Object.values(data.response);
    for(let i = 0; i < names.length; i++) {
        data[names[i]] = values[i];
    };      
};

// play training vocalization (speech synthesis; optional audio file if added later)
const playTrainingAudio = (value) => {
    const sounds = {
        1: { text: "booo", rate: 0.75, pitch: 0.85 },
        2: { text: "awww", rate: 0.8, pitch: 0.9 },
        3: { text: "eh", rate: 0.95, pitch: 1 },
        4: { text: "ooooh", rate: 0.85, pitch: 1.1 },
        5: { text: "yay!!!", rate: 1.05, pitch: 1.2 },
    };
    const sound = sounds[value];
    if (!sound) return;

    const filePath = `./audio/${value}.mp3`;
    const audio = new Audio(filePath);
    audio.oncanplaythrough = () => audio.play().catch(() => speakTrainingSound(sound));
    audio.onerror = () => speakTrainingSound(sound);
    audio.load();
};

const speakTrainingSound = (sound) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(sound.text);
    utter.rate = sound.rate;
    utter.pitch = sound.pitch;
    window.speechSynthesis.speak(utter);
};

// preload face images once
const faceImages = {};
const preloadFaceImages = (sectors) => {
  const paths = [...new Set(sectors.map(s => s.face).filter(Boolean))];
  return Promise.all(paths.map((src) => {
    if (faceImages[src] && faceImages[src].complete) {
      return Promise.resolve(faceImages[src]);
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        faceImages[src] = img;
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
      faceImages[src] = img;
    });
  }));
};

// outcome tones for faces 1, 2, 4, 5
let faceAudioCtx = null;
const playFaceSound = (value) => {
  const presets = {
    1: { // bad — low descending
      type: "sawtooth",
      notes: [196.0, 164.81, 130.81], // G3 E3 C3
      step: 0.12,
      peak: 0.18,
      decay: 0.55,
    },
    2: { // slightly less bad
      type: "sawtooth",
      notes: [220.0, 196.0], // A3 G3
      step: 0.1,
      peak: 0.14,
      decay: 0.4,
    },
    4: { // mildly celebratory
      type: "triangle",
      notes: [523.25, 659.25], // C5 E5
      step: 0.09,
      peak: 0.16,
      decay: 0.4,
    },
    5: { // full celebrate
      type: "triangle",
      notes: [523.25, 659.25, 783.99, 1046.5], // C5 E5 G5 C6
      step: 0.08,
      peak: 0.22,
      decay: 0.45,
    },
  };
  const preset = presets[value];
  if (!preset) return;

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!faceAudioCtx) faceAudioCtx = new AC();
    const ctx = faceAudioCtx;

    const schedule = () => {
      const now = ctx.currentTime;
      preset.notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = preset.type;
        osc.frequency.value = freq;
        const t0 = now + i * preset.step;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(preset.peak, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + preset.decay);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + preset.decay + 0.05);
      });
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(schedule).catch(() => {});
    } else {
      schedule();
    }
  } catch (_) { /* ignore audio failures */ }
};

const playCelebrateSound = () => playFaceSound(5);

// green confetti burst for landing on 5
const launchGreenConfetti = () => {
  const canvas = document.createElement("canvas");
  canvas.className = "celebrate-confetti";
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize);

  const greens = ["#1faa3a", "#2ecc40", "#3ddc67", "#0b8a2c", "#a8e6a1", "#58d68d"];
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.42;
  const pieces = Array.from({ length: 90 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 10;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (2 + Math.random() * 6),
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      color: greens[Math.floor(Math.random() * greens.length)],
      life: 1,
    };
  });

  const start = performance.now();
  const duration = 1800;
  let raf = null;

  const tick = (t) => {
    const elapsed = t - start;
    const progress = Math.min(1, elapsed / duration);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.vy += 0.22;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = 1 - progress;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (progress < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      cleanup();
    }
  };

  const cleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas.remove();
  };

  raf = requestAnimationFrame(tick);
  return cleanup;
};

// static mini-wheel preview for choice screens
const drawWheelPreview = (canvas, sectors) => {
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const rad = size / 2;
  const tot = sectors.length;
  const PI = Math.PI;
  const arc = (2 * PI) / tot;
  const wheelInset = Math.max(3, size * 0.028);
  const drawRadius = rad - wheelInset;
  const rimWidth = Math.max(2, size * 0.02);
  const faceSize = size * 0.22;
  const faceOffsetY = -size * 0.31;
  const hubRadius = size * 0.064;

  const paint = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(rad, rad, drawRadius + rimWidth / 2 + 1, 0, 2 * PI);
    ctx.clip();

    for (let i = 0; i < sectors.length; i++) {
      const ang = arc * i;
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = sectors[i].color || "#ffffff";
      ctx.moveTo(rad, rad);
      ctx.arc(rad, rad, drawRadius, ang, ang + arc);
      ctx.lineTo(rad, rad);
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.translate(rad, rad);
      ctx.rotate((ang + arc / 2) + arc);
      const faceSrc = sectors[i].face;
      const img = faceSrc ? faceImages[faceSrc] : null;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -faceSize / 2, faceOffsetY - faceSize / 2, faceSize, faceSize);
      }
      ctx.restore();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(rad, rad, drawRadius + rimWidth / 2, 0, 2 * PI);
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = rimWidth;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(rad, rad, hubRadius, 0, 2 * PI);
    ctx.fillStyle = "#e8e8e8";
    ctx.fill();
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  return preloadFaceImages(sectors).then(paint);
};

// code for spinner task
const createSpinner = function(canvas, spinnerData, score, sectors, spinnerType, forcedOutcomes) {

  /* get context */
  const ctx = canvas.getContext("2d"); 

  /* get collected-faces tray */
  const collectedFacesEl = document.getElementById("collected-faces");

  /* get wheel properties */
  let wheelWidth = canvas.getBoundingClientRect()['width'];
  let wheelHeight = canvas.getBoundingClientRect()['height'];
  let wheelX = canvas.getBoundingClientRect()['x'] + wheelWidth / 2;
  let wheelY = canvas.getBoundingClientRect()['y'] + wheelHeight / 2;
  const tot = sectors.length; // total number of sectors
  const rad = canvas.width / 2; // radius of wheel (canvas pixels)
  const PI = Math.PI;
  const arc = (2 * PI) / tot; // arc sizes in radians
  const faceSize = 110;
  const faceOffsetY = -155;
  const wheelInset = 14;
  const drawRadius = rad - wheelInset;
  const hubRadius = 32;
  const rimWidth = 5;
  const POINTER_DEG = 270; // fixed pointer at top of wheel (canvas degrees, clockwise from east)

  /* spin dynamics — hold = constant pace; release = launch + friction coast */
  const REF_FPS = 60;
  const MAX_DT = 0.05; // clamp so backgrounded tabs don't jump
  const PACE_VEL = 270; // deg/s — constant moderate rate while space is held
  const FRICTION = 0.975; // per 60fps frame; k = -ln(f)*60
  const FRICTION_K = -Math.log(FRICTION) * REF_FPS;
  const STOP_THRESHOLD = 0.05; // deg/s — snap to 0 to end micro-movement
  const EXTRA_TURNS = 7; // full rotations after release on forced spins
  // unforced launch matches mid-range forced remaining angle (~7.5 turns)
  const LAUNCH_VEL = FRICTION_K * (EXTRA_TURNS * 360 + 180) + STOP_THRESHOLD;
  let angVel = 0;    // Current angular velocity (deg/s)
  let animFrame = null;
  let lastTs = null;
  let spaceHeld = false; // true while space is physically down
  let releaseTimer = null; // debounce spurious keyup during a hold
  let holdStartTs = null; // performance.now() when current press began
  let pendingHoldMs = null; // hold length (ms) for the spin about to land

  if (!Array.isArray(spinnerData.hold_durations)) {
    spinnerData.hold_durations = [];
  }
  if (!Array.isArray(spinnerData.distractors)) {
    spinnerData.distractors = [];
  }

  /* faint peripheral shapes during spins (low-contrast, one at a time) */
  const spinnerStartTs = performance.now();
  const DISTRACTOR_KINDS = ["circle", "square", "triangle", "diamond"];
  const DISTRACTOR_SLOTS = [
    [0.88, 0.14], [0.90, 0.40], [0.88, 0.82],
    [0.12, 0.40], [0.12, 0.82], [0.70, 0.12], [0.30, 0.88],
  ];
  let distractorLayer = document.getElementById("spin-distractors");
  if (!distractorLayer) {
    distractorLayer = document.createElement("div");
    distractorLayer.id = "spin-distractors";
    distractorLayer.setAttribute("aria-hidden", "true");
    document.body.appendChild(distractorLayer);
  }
  const distractorEl = document.createElement("div");
  distractorEl.className = "spin-distractor";
  distractorLayer.appendChild(distractorEl);
  let distractorTimer = null;
  let currentDistractor = null;

  const hideDistractor = (immediate) => {
    if (currentDistractor && currentDistractor.hidden_at == null) {
      currentDistractor.hidden_at = Math.round(performance.now() - spinnerStartTs);
    }
    currentDistractor = null;
    distractorEl.classList.remove("is-visible");
    if (immediate) distractorEl.style.opacity = "0";
  };

  const pickDistractorSlot = () => {
    const wheel = canvas.getBoundingClientRect();
    const cx = wheel.x + wheel.width / 2;
    const cy = wheel.y + wheel.height / 2;
    const minDist = Math.max(wheel.width, 240) * 0.72;
    const order = DISTRACTOR_SLOTS.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < order.length; i++) {
      const x = order[i][0] * window.innerWidth;
      const y = order[i][1] * window.innerHeight;
      const dx = x - cx;
      const dy = y - cy;
      if (Math.sqrt(dx * dx + dy * dy) >= minDist) return { x, y };
    }
    return {
      x: DISTRACTOR_SLOTS[0][0] * window.innerWidth,
      y: DISTRACTOR_SLOTS[0][1] * window.innerHeight,
    };
  };

  const showDistractor = () => {
    if (!active || !isSpinning || isLanding) return;
    const kind = DISTRACTOR_KINDS[Math.floor(Math.random() * DISTRACTOR_KINDS.length)];
    const slot = pickDistractorSlot();
    const size = Math.round(rand(22, 30));
    distractorEl.className = "spin-distractor spin-distractor-" + kind;
    distractorEl.style.width = size + "px";
    distractorEl.style.height = size + "px";
    distractorEl.style.left = Math.round(slot.x - size / 2) + "px";
    distractorEl.style.top = Math.round(slot.y - size / 2) + "px";
    distractorEl.style.opacity = "";
    void distractorEl.offsetWidth;
    distractorEl.classList.add("is-visible");
    currentDistractor = {
      shape: kind,
      x: Math.round(slot.x),
      y: Math.round(slot.y),
      size,
      shown_at: Math.round(performance.now() - spinnerStartTs),
      hidden_at: null,
      n_spins: spinnerData.outcomes.length,
    };
    spinnerData.distractors.push(currentDistractor);
  };

  const stopDistractors = (immediate) => {
    if (distractorTimer != null) {
      clearTimeout(distractorTimer);
      distractorTimer = null;
    }
    hideDistractor(immediate);
  };

  const scheduleNextDistractor = () => {
    if (!active || !isSpinning || isLanding) return;
    distractorTimer = setTimeout(() => {
      distractorTimer = null;
      showDistractor();
      const visibleFor = rand(900, 1600);
      distractorTimer = setTimeout(() => {
        distractorTimer = null;
        hideDistractor(false);
        scheduleNextDistractor();
      }, visibleFor);
    }, rand(800, 2000));
  };

  /* state variables */
  let isSpinning = false;      // true when wheel is spinning, false otherwise
  let isAccelerating = false;  // true while space is held (constant pace)
  let isDecelerating = false;  // true after release (launch + friction coast)
  let isLanding = false;       // true during post-land feedback
  let oldAngle = 0;            // current wheel angle
  let currentAngle = 0;        // wheel angle when stopped
  let active = true;           // false after cleanup

  // forced outcomes: fixed queue from exp.js (high / medium / half51)
  let forcedValueQueue = Array.isArray(forcedOutcomes) && forcedOutcomes.length > 0
    ? forcedOutcomes.slice()
    : null;
  let forcedTargetIndex = null; // sector index for current decelerating spin
  let forcedTargetAngle = null; // wheel rotation mod for random point inside that sector
  const wedgeInsetFrac = 0.04; // keep landings slightly inside borders (was 0.15)

  const isForcingThisSpin = () => {
    return !!(forcedValueQueue && forcedValueQueue.length > 0);
  };

  // remaining rotation over dt under v' = -k v
  const frictionStep = (vel, dt) => {
    const nextVel = vel * Math.exp(-FRICTION_K * dt);
    return { nextVel, delta: (vel - nextVel) / FRICTION_K };
  };

  const render = (deg) => {
    canvas.style.transform = `rotate(${deg}deg)`;
  };

  const rand = (m, M) => Math.random() * (M - m) + m;

  const getIndexAtAngle = (angle) => {
    const onWheel = ((POINTER_DEG - angle) % 360 + 360) % 360;
    const sector = Math.floor(onWheel / (360 / tot));
    return ((sector % tot) + tot) % tot;
  };

  const indicesForValue = (v) => {
    const idxs = [];
    for (let i = 0; i < sectors.length; i++) {
      if (sectors[i].value === v) idxs.push(i);
    }
    return idxs;
  };

  // wheel rotation (mod 360) for a random point inside a sector (inset from borders)
  const randomSectorModAngle = (index) => {
    const sectorWidth = 360 / tot;
    const inset = sectorWidth * wedgeInsetFrac;
    const onWheel = index * sectorWidth + rand(inset, sectorWidth - inset);
    return ((POINTER_DEG - onWheel) % 360 + 360) % 360;
  };

  // forward-only distance (0–360) from current wheel angle to a target mod
  const forwardDistance = (fromAngle, targetMod) => {
    const fromMod = ((fromAngle % 360) + 360) % 360;
    return ((targetMod - fromMod) % 360 + 360) % 360;
  };

  const chooseTargetSector = () => {
    if (!forcedValueQueue || forcedValueQueue.length === 0) return null;
    const value = forcedValueQueue[0];
    const idxs = indicesForValue(value);
    return idxs[Math.floor(Math.random() * idxs.length)];
  };

  const setupForcedLanding = () => {
    forcedTargetIndex = chooseTargetSector();
    if (forcedTargetIndex === null) {
      angVel = LAUNCH_VEL;
      return;
    }
    forcedTargetAngle = randomSectorModAngle(forcedTargetIndex);
    const needed = EXTRA_TURNS * 360 + forwardDistance(oldAngle, forcedTargetAngle);
    // remaining angle as t→∞ is v0/k; add threshold so cutoff still reaches target
    angVel = FRICTION_K * needed + STOP_THRESHOLD;
  };

  const drawSector = (sectorsList, highlightIndex) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // circular clip so the wheel reads as a disc, not a square
    ctx.save();
    ctx.beginPath();
    ctx.arc(rad, rad, drawRadius + rimWidth / 2 + 2, 0, 2 * PI);
    ctx.clip();

    for (let i = 0; i < sectorsList.length; i++) {
      const ang = arc * i;
      ctx.save();
      // COLOR + BLACK OUTLINE
      ctx.beginPath();
      ctx.fillStyle = sectorsList[i].color;
      ctx.moveTo(rad, rad);
      ctx.arc(rad, rad, drawRadius, ang, ang + arc);
      ctx.lineTo(rad, rad);
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // FACE IMAGE
      ctx.translate(rad, rad);
      ctx.rotate((ang + arc / 2) + arc);
      const faceSrc = sectorsList[i].face;
      const img = faceSrc ? faceImages[faceSrc] : null;
      const faceRadius = faceOffsetY * (drawRadius / rad);
      if (img && img.complete) {
        if (isSpinning && i === highlightIndex) {
          ctx.beginPath();
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 6;
          ctx.arc(0, faceRadius, faceSize / 2 + 4, 0, 2 * PI);
          ctx.stroke();
        }
        ctx.drawImage(img, -faceSize / 2, faceRadius - faceSize / 2, faceSize, faceSize);
      }
      ctx.restore();
    }

    ctx.restore();

    // outer rim
    ctx.beginPath();
    ctx.arc(rad, rad, drawRadius + rimWidth / 2, 0, 2 * PI);
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = rimWidth;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rad, rad, drawRadius + rimWidth / 2 - 1, 0, 2 * PI);
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    ctx.stroke();

    // center hub cap
    ctx.beginPath();
    ctx.arc(rad, rad, hubRadius, 0, 2 * PI);
    ctx.fillStyle = "#e8e8e8";
    ctx.fill();
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rad, rad, hubRadius * 0.35, 0, 2 * PI);
    ctx.fillStyle = "#bbb";
    ctx.fill();
  };

  const updateScore = (points, color, faceSrc) => {
    score += points;
    spinnerData.score = score;
    spinnerData.isSpinning = true;
    if (collectedFacesEl && faceSrc) {
      const img = document.createElement("img");
      img.src = faceSrc;
      img.alt = String(points);
      img.className = "collected-face";
      collectedFacesEl.appendChild(img);
    }
    setTimeout(() => {
      if (!active) return;
      isSpinning = false;
      isLanding = false;
      isDecelerating = false;
      isAccelerating = false;
      spinnerData.isSpinning = false;
      drawSector(sectors, null);
      // still holding space after landing — resume pacing without a re-press
      if (spaceHeld) {
        startSpin();
      }
    }, 1000);
  };

  let stopConfetti = null;

  const landOnSector = (idx) => {
    animFrame = null;
    angVel = 0;
    isDecelerating = false;
    isLanding = true;
    const sector = sectors[idx];
    spinnerData.outcomes.push(sector.value);
    spinnerData.hold_durations.push(
      pendingHoldMs != null ? pendingHoldMs : null
    );
    pendingHoldMs = null;
    drawSector(sectors, idx);
    if (sector.value === 5) {
      if (stopConfetti) stopConfetti();
      stopConfetti = launchGreenConfetti();
    }
    if (sector.value === 1 || sector.value === 2 || sector.value === 4 || sector.value === 5) {
      playFaceSound(sector.value);
    }
    stopDistractors(false);
    updateScore(sector.value, sector.color, sector.face);
    if (forcedValueQueue && forcedValueQueue.length > 0) {
      forcedValueQueue.shift();
    }
    forcedTargetIndex = null;
    forcedTargetAngle = null;
  };

  const giveMoment = function(ts) {
    if (!active) return;

    if (lastTs == null) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt <= 0) {
      animFrame = window.requestAnimationFrame(giveMoment);
      return;
    }
    dt = Math.min(dt, MAX_DT);

    // hold / pre-launch: constant moderate pace until beginStop starts coast-down
    if (isSpinning && !isDecelerating && !isLanding) {
      isAccelerating = true;
      angVel = PACE_VEL;
      oldAngle += angVel * dt;
      render(oldAngle);
      animFrame = window.requestAnimationFrame(giveMoment);
      return;
    }

    // release: friction coast until velocity drops below the stop threshold
    if (!isDecelerating) {
      animFrame = window.requestAnimationFrame(giveMoment);
      return;
    }

    const step = frictionStep(angVel, dt);
    oldAngle += step.delta;
    angVel = step.nextVel;
    render(oldAngle);

    if (Math.abs(angVel) < STOP_THRESHOLD) {
      angVel = 0;
      currentAngle = oldAngle;
      render(oldAngle);
      const idx = forcedTargetIndex != null
        ? forcedTargetIndex
        : getIndexAtAngle(oldAngle);
      landOnSector(idx);
      return;
    }

    animFrame = window.requestAnimationFrame(giveMoment);
  };

  const startSpin = () => {
    if (!active || isSpinning || isLanding) return;
    if (spinnerData.maxSpins != null && spinnerData.outcomes.length >= spinnerData.maxSpins) return;
    isSpinning = true;
    isAccelerating = true;
    isDecelerating = false;
    forcedTargetIndex = null;
    forcedTargetAngle = null;
    // resume pacing while still held (e.g. after landing) — start a new hold clock
    if (spaceHeld && holdStartTs == null) {
      holdStartTs = performance.now();
    }
    spinnerData.isSpinning = true;
    lastTs = null;
    angVel = PACE_VEL;
    stopDistractors(true);
    scheduleNextDistractor();
    animFrame = window.requestAnimationFrame(giveMoment);
  };

  const beginStop = () => {
    if (!active || !isSpinning || isDecelerating || isLanding) return;
    if (spaceHeld) return; // never launch while space is still down
    isAccelerating = false;
    isDecelerating = true;
    if (isForcingThisSpin()) {
      setupForcedLanding();
    } else {
      angVel = LAUNCH_VEL;
    }
  };

  const onKeyDown = (e) => {
    if (!active) return;
    if (e.code !== "Space" && e.key !== " ") return;
    e.preventDefault();
    spaceHeld = true;
    if (holdStartTs == null) {
      holdStartTs = performance.now();
    }
    // cancel a pending launch from a spurious keyup (key-repeat re-asserts hold)
    if (releaseTimer != null) {
      clearTimeout(releaseTimer);
      releaseTimer = null;
    }
    if (!isSpinning && !isLanding) {
      startSpin();
    }
  };

  const onKeyUp = (e) => {
    if (!active) return;
    if (e.code !== "Space" && e.key !== " ") return;
    e.preventDefault();
    spaceHeld = false;
    const keyupTs = performance.now();
    // debounce: brief keyup glitches during a hold shouldn't kill pacing
    if (releaseTimer != null) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      if (spaceHeld) return; // hold re-asserted; keep original holdStartTs
      if (holdStartTs != null) {
        pendingHoldMs = Math.round(keyupTs - holdStartTs);
        holdStartTs = null;
      }
      if (isSpinning && !isDecelerating && !isLanding) {
        beginStop();
      }
    }, 40);
  };

  const onResize = () => {
    wheelWidth = canvas.getBoundingClientRect()['width'];
    wheelHeight = canvas.getBoundingClientRect()['height'];
    wheelX = canvas.getBoundingClientRect()['x'] + wheelWidth / 2;
    wheelY = canvas.getBoundingClientRect()['y'] + wheelHeight / 2;
  };

  spinnerData.isSpinning = false;
  spinnerData.cleanup = () => {
    active = false;
    spaceHeld = false;
    holdStartTs = null;
    if (releaseTimer != null) {
      clearTimeout(releaseTimer);
      releaseTimer = null;
    }
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize, true);
    if (animFrame) window.cancelAnimationFrame(animFrame);
    if (stopConfetti) stopConfetti();
    stopDistractors(true);
    if (distractorEl.parentNode) distractorEl.remove();
    if (distractorLayer && distractorLayer.childElementCount === 0) {
      distractorLayer.remove();
    }
  };

  preloadFaceImages(sectors).then(() => {
    if (!active) return;
    drawSector(sectors, null);
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize, true);

};
