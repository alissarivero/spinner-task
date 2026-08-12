
// initialize jsPsych
const jsPsych = initJsPsych({
    on_finish: (data) => {
        data.boot = boot;
        if(!boot) {
            document.body.innerHTML = 
                `<div align='center' style="margin: 10%">
                    <p>Thank you for participating!<p>
                    <b>You will be automatically re-directed to Prolific in a few moments.</b>
                </div>`;
            setTimeout(() => { 
                location.href = `https://app.prolific.co/submissions/complete?cc=${completionCode}`
            }, 2000);
        }
    },
});

// set and save subject ID
let subject_id = jsPsych.data.getURLVariable("PROLIFIC_PID");
if (!subject_id) { subject_id = jsPsych.randomization.randomID(10) };
jsPsych.data.addProperties({ subject: subject_id });

// define file name
const filename = `${subject_id}.csv`;

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

  /* spin dynamics — time-based (deg/s), calibrated to former 60fps per-frame values */
  const REF_FPS = 60;
  const REF_DT = 1 / REF_FPS;
  const MAX_DT = 0.05; // clamp so backgrounded tabs don't jump
  // stronger drag when fast, softer when slow (longer end-of-spin suspense)
  const frictionAt = (speed) => {
    const t = Math.min(1, Math.abs(speed) / (40 * REF_FPS)); // 0 = slow, 1 = fast
    return 0.992 - 0.012 * t; // ~0.980 when fast → ~0.992 when slow (per ref frame)
  };
  const holdCoastFriction = 0.995; // light ease while holding at peak (per ref frame)
  const accelFactor = 1.06; // per ref frame while accelerating
  const angVelMin = 3 * REF_FPS; // deg/s — below stopThresh treated as a stop
  let angVelMax = 0; // Random peak ang.vel. (deg/s)
  let angVel = 0;    // Current angular velocity (deg/s)
  let animFrame = null;
  let hasReachedPeak = false;
  let lastTs = null;

  /* state variables */
  let isSpinning = false;      // true when wheel is spinning, false otherwise
  let isAccelerating = false;  // true when wheel is accelerating, false otherwise
  let isDecelerating = false;  // true when friction slowdown has begun
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
  const stopThresh = () => angVelMin * 0.1;
  const steerK = 0.004;
  const steerMaxNudge = 0.07;
  const residualStep = 1.6 * REF_FPS; // deg/s when creeping into target sector
  const residualAlignTol = 1.0; // deg — close enough to land
  const wedgeInsetFrac = 0.04; // keep landings slightly inside borders (was 0.15)

  // apply a per-ref-frame multiplier over real elapsed time
  const applyFrameFactor = (value, factorPerFrame, dt) => {
    return value * Math.pow(factorPerFrame, dt * REF_FPS);
  };

  const isForcingThisSpin = () => {
    return !!(forcedValueQueue && forcedValueQueue.length > 0);
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

  const getIndex = () => getIndexAtAngle(currentAngle);

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

  // absolute target angle nearest to predicted (shortest signed delta)
  const nearestTargetAngle = (predicted, targetMod) => {
    const predMod = ((predicted % 360) + 360) % 360;
    const shortest = ((targetMod - predMod + 540) % 360) - 180;
    return predicted + shortest;
  };

  // Fixed 1/60s step simulation in deg/s so forced steering matches live physics
  const predictFinalAngle = (angle, speed) => {
    let a = angle;
    let s = speed;
    const thresh = stopThresh();
    for (let i = 0; i < 20000; i++) {
      s = applyFrameFactor(s, frictionAt(s), REF_DT);
      if (Math.abs(s) > thresh) {
        a += s * REF_DT;
      } else {
        break;
      }
    }
    return a;
  };

  const chooseTargetSector = () => {
    if (!forcedValueQueue || forcedValueQueue.length === 0) return null;
    const value = forcedValueQueue[0];
    const idxs = indicesForValue(value);
    return idxs[Math.floor(Math.random() * idxs.length)];
  };

  const setupForcedLanding = () => {
    forcedTargetIndex = chooseTargetSector();
    if (forcedTargetIndex === null) return;
    forcedTargetAngle = randomSectorModAngle(forcedTargetIndex);
    // iterative rescales toward the random within-wedge landing point
    for (let iter = 0; iter < 3; iter++) {
      const predicted = predictFinalAngle(oldAngle, angVel);
      const targetAngle = nearestTargetAngle(predicted, forcedTargetAngle);
      if (Math.abs(targetAngle - predicted) < 2) break;
      const naturalDelta = predicted - oldAngle;
      const desiredDelta = targetAngle - oldAngle;
      if (Math.abs(naturalDelta) <= 1e-3) break;
      let scale = desiredDelta / naturalDelta;
      scale = Math.max(0.45, Math.min(1.75, scale));
      angVel *= scale;
    }
  };

  // slow residual roll so forced landings visibly settle on the target (no snap)
  const residualRollTowardTarget = (dt) => {
    if (forcedTargetIndex === null || forcedTargetAngle === null) return false;
    currentAngle = oldAngle;
    const targetAngle = nearestTargetAngle(oldAngle, forcedTargetAngle);
    const errAbs = Math.abs(targetAngle - oldAngle);
    if (getIndex() === forcedTargetIndex && errAbs <= residualAlignTol) return false;

    let err = targetAngle - oldAngle;
    // keep rolling in the current spin direction when possible
    const dir = Math.sign(angVel) || Math.sign(err) || 1;
    if (Math.sign(err) !== 0 && Math.sign(err) !== dir) {
      // prefer continuing forward to the next equivalent of the target
      const alt = targetAngle + 360 * dir;
      if (Math.abs(alt - oldAngle) < Math.abs(err) + 180) {
        err = alt - oldAngle;
      }
    }
    const step = Math.min(residualStep * dt, Math.abs(err)) * Math.sign(err || dir);
    oldAngle += step;
    // keep below stopThresh so next frames stay in residual-roll (not friction) path
    angVel = stopThresh() * 0.5 * Math.sign(step || 1);
    currentAngle = oldAngle;
    render(oldAngle);
    return getIndex() !== forcedTargetIndex ||
      Math.abs(nearestTargetAngle(oldAngle, forcedTargetAngle) - oldAngle) > residualAlignTol;
  };

  const steerSpeedTowardTarget = (angle, speed, dt) => {
    if (forcedTargetAngle === null || Math.abs(speed) < 1e-6) return speed;
    const predicted = predictFinalAngle(angle, speed);
    const targetAngle = nearestTargetAngle(predicted, forcedTargetAngle);
    const dir = Math.sign(speed) || 1;
    const shortest = ((targetAngle - predicted + 540) % 360) - 180;
    const error = shortest * dir;
    // scale nudge by elapsed ref-frames so 120Hz doesn't steer 2× as hard
    const frameScale = dt * REF_FPS;
    const adj = Math.max(
      -steerMaxNudge * frameScale,
      Math.min(steerMaxNudge * frameScale, steerK * error * frameScale)
    );
    return speed * (1 + adj);
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
      const size = (isSpinning && i === highlightIndex) ? faceSize * 1.25 : faceSize;
      const faceRadius = faceOffsetY * (drawRadius / rad);
      if (img && img.complete) {
        if (isSpinning && i === highlightIndex) {
          ctx.beginPath();
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 6;
          ctx.arc(0, faceRadius, size / 2 + 4, 0, 2 * PI);
          ctx.stroke();
        }
        ctx.drawImage(img, -size / 2, faceRadius - size / 2, size, size);
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
    drawSector(sectors, idx);
    if (sector.value === 5) {
      if (stopConfetti) stopConfetti();
      stopConfetti = launchGreenConfetti();
    }
    if (sector.value === 1 || sector.value === 2 || sector.value === 4 || sector.value === 5) {
      playFaceSound(sector.value);
    }
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

    let speed = angVel;

    // accelerate to peak, then light coast while space is held (no flat cruise)
    if (isAccelerating) {
      if (hasReachedPeak || Math.abs(speed) >= angVelMax) {
        hasReachedPeak = true;
        if (Math.abs(speed) > angVelMax) {
          speed = angVelMax * Math.sign(speed || 1);
        }
        speed = applyFrameFactor(speed, holdCoastFriction, dt);
        angVel = speed;
        oldAngle += angVel * dt;
        render(oldAngle);
        animFrame = window.requestAnimationFrame(giveMoment);
        return;
      }
      speed = applyFrameFactor(speed, accelFactor, dt);
      angVel = speed;
      oldAngle += speed * dt;
      render(oldAngle);
      animFrame = window.requestAnimationFrame(giveMoment);
      return;
    }

    // decelerate and stop — steer speed so it visibly settles on target
    isDecelerating = true;
    if (forcedTargetAngle !== null && Math.abs(speed) > stopThresh()) {
      speed = steerSpeedTowardTarget(oldAngle, speed, dt);
    }
    if (Math.abs(speed) > stopThresh()) {
      speed = applyFrameFactor(speed, frictionAt(speed), dt);
      angVel = speed;
      oldAngle += speed * dt;
      render(oldAngle);
      animFrame = window.requestAnimationFrame(giveMoment);
    } else if (forcedTargetIndex !== null && residualRollTowardTarget(dt)) {
      // creep into the correct wedge without snapping
      animFrame = window.requestAnimationFrame(giveMoment);
    } else {
      currentAngle = oldAngle;
      render(oldAngle);
      landOnSector(getIndex());
    }
  };

  const startSpin = () => {
    if (!active || isSpinning || isLanding) return;
    if (spinnerData.maxSpins != null && spinnerData.outcomes.length >= spinnerData.maxSpins) return;
    isSpinning = true;
    isAccelerating = true;
    isDecelerating = false;
    hasReachedPeak = false;
    forcedTargetIndex = null;
    forcedTargetAngle = null;
    spinnerData.isSpinning = true;
    lastTs = null;
    angVelMax = rand(25, 50) * REF_FPS;
    angVel = 8 * REF_FPS; // initial kick (deg/s)
    animFrame = window.requestAnimationFrame(giveMoment);
  };

  const beginStop = () => {
    if (!active || !isSpinning || isDecelerating || isLanding) return;
    isAccelerating = false;
    isDecelerating = true;
    if (isForcingThisSpin()) {
      setupForcedLanding();
    }
  };

  const onKeyDown = (e) => {
    if (!active) return;
    if (e.code !== "Space" && e.key !== " ") return;
    e.preventDefault();
    if (e.repeat) return; // ignore held-repeat; hold duration is via keyup

    if (!isSpinning && !isLanding) {
      startSpin();
    }
  };

  const onKeyUp = (e) => {
    if (!active) return;
    if (e.code !== "Space" && e.key !== " ") return;
    e.preventDefault();

    if (isSpinning && !isDecelerating && !isLanding) {
      beginStop();
    }
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
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize, true);
    if (animFrame) window.cancelAnimationFrame(animFrame);
    if (stopConfetti) stopConfetti();
  };

  preloadFaceImages(sectors).then(() => {
    if (!active) return;
    drawSector(sectors, null);
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize, true);

};
