
// independent WebGazer sessions — do not restore prior IndexedDB training
window.saveDataAcrossSessions = false;

// Session data goes to OSF through DataPipe (pipe.jspsych.org), which writes
// each upload as a file in the OSF project linked to this experiment ID.
// Data is never downloaded onto the participant's computer.
const DATAPIPE_EXPERIMENT_ID = "DM7NGSQ4xpi8";
const DATAPIPE_URL = "https://pipe.jspsych.org/api/data/";

const uploadSessionData = async (csv, name) => {
    const res = await fetch(DATAPIPE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "*/*" },
        body: JSON.stringify({
            experimentID: DATAPIPE_EXPERIMENT_ID,
            filename: name,
            data: csv,
        }),
    });
    if (!res.ok) {
        // DataPipe answers with { error, message } — surface the real reason
        let detail = "";
        try {
            const body = await res.json();
            detail = body.message || body.error || "";
        } catch (_) { /* non-JSON error body */ }
        throw new Error(`Upload failed with status ${res.status}${detail ? `: ${detail}` : ""}`);
    }
};

// compact local timestamp for filenames: YYYYMMDD-HHMMSS
const fileTimestamp = (d = new Date()) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
        `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

/*
 * Session CSV: one event per row, identified by row_type.
 *   trial - one per screen (answers; wheel screens add score and needle/wheel geometry)
 *   spin  - one per rotation of a wheel
 *   shape - one per distractor shape shown during a wheel (shape_trigger = the
 *           spin event that showed it; shape_cut_short = replaced before its time)
 *   gaze  - one per WebGazer sample on a wheel
 * Spin, shape, and gaze times are ms on that trial's webgazer_data clock.
 * Positions are viewport pixels, the same space as gaze_x / gaze_y. The page
 * layout is logged whenever it changes (resize, zoom, scroll, tray growth), and
 * each spin and gaze sample uses the layout on screen at that moment. *_norm
 * columns are the same position as a fraction of the viewport (0-1).
 */
const LAYOUT_FIELDS = [
    "viewport_w", "viewport_h",
    "needle_x", "needle_y", "needle_w", "needle_h", "wheel_x", "wheel_y", "wheel_r",
];
const CSV_TRIAL_FIELDS = [
    // identity
    "subject", "run_mode", "trial_index", "trial_type", "phase", "time_elapsed", "internal_node_id",
    // device and browser
    "screen_w", "screen_h", "device_pixel_ratio", "user_agent",
    // design
    "spinner_type", "round", "order", "bonus_round", "order_perm", "chosen_spinner",
    "high_outcome_order", "medium_outcome_order", "half51_outcome_order",
    "distractor_seed", "distractor_schedule",
    // answers
    "rt", "response", "liking", "liking_label", "flow", "happiness", "happiness_label",
    "training_question", "left_face", "right_face", "chosen_face", "correct", "attempt", "confirmed",
    "happiness_training_q", "thumbs_training_q", "load_time", "view_history",
    "gender", "age", "ethnicity", "english", "finalWord",
    // wheel screen (layout at the start of the wheel)
    "score", "n_spins",
].concat(LAYOUT_FIELDS);
const CSV_COLUMNS = ["row_type"].concat(
    CSV_TRIAL_FIELDS,
    ["spin_index", "t_start", "t_release", "t_land", "hold_ms", "outcome",
     "edge_dist_deg", "wedge_pos", "near_edge", "neighbor_outcome", "resumed"],
    ["shape_index", "shape", "shape_x", "shape_y", "shape_x_norm", "shape_y_norm", "shape_size",
     "t_on", "t_off", "spins_landed", "shape_trigger", "shape_jitter_ms", "shape_cut_short"],
    ["t", "gaze_x", "gaze_y", "gaze_x_norm", "gaze_y_norm", "dist_needle", "on_needle", "on_wheel",
     "spinning", "shape_visible", "ms_from_onset", "dist_shape"],
);

// layout on screen at trial time t (the first one if t precedes every entry)
const layoutAt = (layouts, t) => {
    let current = layouts[0] || null;
    for (const layout of layouts) {
        if (layout.t <= t) current = layout;
        else break;
    }
    return current;
};

const norm = (value, size) => (size ? Math.round((value / size) * 10000) / 10000 : null);

// gaze within this many px of the needle box still counts as on the needle
const NEEDLE_PAD = 24;

const csvCell = (value) => {
    if (value === undefined || value === null) return '""';
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return '"' + text.replace(/"/g, '""') + '"';
};

const eventRows = (trial) => {
    const base = {
        subject: trial.subject,
        trial_index: trial.trial_index,
        phase: trial.phase,
        spinner_type: trial.spinner_type,
        round: trial.round,
    };
    const rows = [];
    const spins = trial.spins || [];
    const shapes = trial.distractors || [];
    const layouts = trial.layouts || [];

    spins.forEach((s, i) => {
        const row = Object.assign({ row_type: "spin" }, base, {
            spin_index: i + 1,
            t_start: s.t_start,
            t_release: s.t_release,
            t_land: s.t_land,
            hold_ms: s.hold_ms,
            outcome: s.outcome,
            edge_dist_deg: s.edge_dist_deg,
            wedge_pos: s.wedge_pos,
            near_edge: s.near_edge,
            neighbor_outcome: s.neighbor_outcome,
            resumed: s.resumed,
        });
        const layout = layoutAt(layouts, s.t_start);
        if (layout) LAYOUT_FIELDS.forEach((key) => { row[key] = layout[key]; });
        rows.push(row);
    });

    const shapeFields = (d) => {
        const layout = layoutAt(layouts, d.t_on);
        return {
            shape: d.shape,
            shape_x: d.x,
            shape_y: d.y,
            shape_x_norm: layout ? norm(d.x, layout.viewport_w) : null,
            shape_y_norm: layout ? norm(d.y, layout.viewport_h) : null,
            shape_size: d.size,
        };
    };

    shapes.forEach((d, i) => {
        const row = Object.assign({ row_type: "shape" }, base, { shape_index: i + 1 }, shapeFields(d), {
            t_on: d.t_on,
            t_off: d.t_off,
            spins_landed: d.n_spins,
            spin_index: d.spin_index != null ? d.spin_index + 1 : null,
            shape_trigger: d.trigger,
            shape_jitter_ms: d.jitter_ms,
            shape_cut_short: d.cut_short ? 1 : 0,
        });
        const layout = layoutAt(layouts, d.t_on);
        if (layout) {
            row.viewport_w = layout.viewport_w;
            row.viewport_h = layout.viewport_h;
        }
        rows.push(row);
    });

    const dist = (x1, y1, x2, y2) => Math.round(Math.hypot(x1 - x2, y1 - y2));

    (trial.webgazer_data || []).forEach((g) => {
        const row = Object.assign({ row_type: "gaze" }, base, { t: g.t, gaze_x: g.x, gaze_y: g.y });
        const layout = layoutAt(layouts, g.t);

        if (layout) {
            row.viewport_w = layout.viewport_w;
            row.viewport_h = layout.viewport_h;
            row.gaze_x_norm = norm(g.x, layout.viewport_w);
            row.gaze_y_norm = norm(g.y, layout.viewport_h);
        }
        if (layout && layout.needle_x != null) {
            row.dist_needle = dist(g.x, g.y, layout.needle_x, layout.needle_y);
            const halfW = layout.needle_w / 2 + NEEDLE_PAD;
            const halfH = layout.needle_h / 2 + NEEDLE_PAD;
            row.on_needle = Math.abs(g.x - layout.needle_x) <= halfW && Math.abs(g.y - layout.needle_y) <= halfH ? 1 : 0;
        }
        if (layout && layout.wheel_x != null) {
            row.on_wheel = dist(g.x, g.y, layout.wheel_x, layout.wheel_y) <= layout.wheel_r ? 1 : 0;
        }

        const spinIdx = spins.findIndex((s) => g.t >= s.t_start && g.t <= (s.t_land != null ? s.t_land : Infinity));
        row.spinning = spinIdx >= 0 ? 1 : 0;
        if (spinIdx >= 0) row.spin_index = spinIdx + 1;

        // a sample belongs to a shape from the previous shape's hide until this one hides
        const shapeIdx = shapes.findIndex((d) => g.t <= (d.t_off != null ? d.t_off : Infinity));
        if (shapeIdx >= 0) {
            const d = shapes[shapeIdx];
            row.shape_index = shapeIdx + 1;
            Object.assign(row, shapeFields(d));
            row.shape_visible = g.t >= d.t_on && g.t <= (d.t_off != null ? d.t_off : Infinity) ? 1 : 0;
            row.ms_from_onset = g.t - d.t_on;
            row.dist_shape = dist(g.x, g.y, d.x, d.y);
        }
        rows.push(row);
    });

    return rows;
};

const buildSessionCsv = (trials) => {
    const rows = [];
    trials.forEach((trial) => {
        const row = { row_type: "trial" };
        CSV_TRIAL_FIELDS.forEach((key) => { row[key] = trial[key]; });
        const firstLayout = (trial.layouts || [])[0];
        if (firstLayout) LAYOUT_FIELDS.forEach((key) => { row[key] = firstLayout[key]; });
        rows.push(row);
        if (Array.isArray(trial.spins)) rows.push(...eventRows(trial));
    });
    const lines = [CSV_COLUMNS.map(csvCell).join(",")];
    rows.forEach((row) => lines.push(CSV_COLUMNS.map((key) => csvCell(row[key])).join(",")));
    return lines.join("\r\n") + "\r\n";
};

// initialize jsPsych
const jsPsych = initJsPsych({
    extensions: [{
        type: jsPsychExtensionWebgazer,
        params: { round_predictions: true, sampling_interval: 34 },
    }],
    // runs once, after the demographic questions — the only point data is saved
    on_finish: () => {
        if (jsPsych.extensions.webgazer) jsPsych.extensions.webgazer.pause();
        const csv = buildSessionCsv(jsPsych.data.get().values());
        document.body.innerHTML =
            `<div class="session-done" align='center' style="margin: 10%">
                <p>Thank you for participating!</p>
                <p id="save-status">Saving your data...</p>
                <p>Please keep this window open until the experimenter confirms your data was saved.</p>
                <button type="button" id="save-again" class="jspsych-btn" hidden>Try saving again</button>
            </div>`;
        const status = document.getElementById("save-status");
        const again = document.getElementById("save-again");
        const save = () => {
            status.textContent = "Saving your data...";
            again.hidden = true;
            uploadSessionData(csv, filename)
                .then(() => {
                    status.textContent = "Your data has been saved.";
                })
                .catch((err) => {
                    console.error(err);
                    status.textContent = "Your data could not be saved. Please tell the experimenter.";
                    again.hidden = false;
                });
        };
        again.addEventListener("click", save);
        save();
    },
});

// device_pixel_ratio also reflects browser zoom when the page opened
jsPsych.data.addProperties({
    screen_w: window.screen.width,
    screen_h: window.screen.height,
    device_pixel_ratio: window.devicePixelRatio,
    user_agent: navigator.userAgent,
});

// subject ID and run mode are set on the home screen
let subject_id = null;
let filename = "pending.csv";
let runMode = null;

const setSubject = (id) => {
    subject_id = String(id).trim();
    // timestamp keeps re-entered participant numbers (and every "test" run) from
    // colliding — DataPipe rejects a filename that already exists in the project
    filename = `${subject_id}_${fileTimestamp()}.csv`;
    jsPsych.data.addProperties({ subject: subject_id, run_mode: runMode });
    getDistractorSchedule(); // fix the shape schedule before any wheel appears
};

/*
 * Distractor schedule: shapes appear at fixed moments of a spin, not at random.
 * Six trigger events, each used twice over spins 1-4 (3 per spin, no event
 * repeated within a spin); spins 5+ replay that 4-spin block. One schedule per
 * participant (seeded from the subject ID), shared by every wheel.
 */
const DISTRACTOR_EVENTS = [
    "wedges_visible", // wheel drawn and idle, waiting for a press
    "charge",         // space pressed — wheel starts pacing
    "launch",         // space released — coast begins
    "slowing",        // coast velocity has dropped to half the launch velocity
    "almost_stopped", // less than ALMOST_STOPPED_DEG of rotation left
    "land",           // outcome sector reached
];
const DISTRACTOR_BLOCK_SPINS = 4;
const DISTRACTORS_PER_SPIN = 3;

// FNV-1a 32-bit — stable seed from a subject ID string
const hashString = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
};

// same LCG shuffle as exp.js so both schedules are reproducible from a seed
const shuffleSeeded = (arr, seed) => {
    const a = arr.slice();
    let s = seed >>> 0;
    for (let i = a.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const j = s % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

const buildDistractorSchedule = (seed) => {
    const pool = DISTRACTOR_EVENTS.concat(DISTRACTOR_EVENTS); // 12 = each event twice
    for (let attempt = 0; attempt < 1000; attempt++) {
        const order = shuffleSeeded(pool, (seed + attempt * 7919) >>> 0);
        const blocks = [];
        for (let i = 0; i < DISTRACTOR_BLOCK_SPINS; i++) {
            blocks.push(order.slice(i * DISTRACTORS_PER_SPIN, (i + 1) * DISTRACTORS_PER_SPIN));
        }
        const noRepeats = blocks.every((b) => new Set(b).size === b.length);
        if (noRepeats) return blocks;
    }
    // unreachable in practice; fall back to a fixed valid layout
    return [
        ["wedges_visible", "launch", "almost_stopped"],
        ["charge", "slowing", "land"],
        ["wedges_visible", "slowing", "land"],
        ["charge", "launch", "almost_stopped"],
    ];
};

let distractorSchedule = null;
let distractorSeed = null;
const getDistractorSchedule = () => {
    if (distractorSchedule) return distractorSchedule;
    distractorSeed = subject_id
        ? hashString(subject_id)
        : Math.floor(Math.random() * 0x100000000);
    distractorSchedule = buildDistractorSchedule(distractorSeed);
    jsPsych.data.addProperties({
        distractor_seed: distractorSeed,
        distractor_schedule: distractorSchedule.map((b) => b.join("+")).join("|"),
    });
    return distractorSchedule;
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

// short rising "boop" when a calibration animal is tapped
const playPopSound = () => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!faceAudioCtx) faceAudioCtx = new AC();
    const ctx = faceAudioCtx;
    const schedule = () => {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, t0);
      osc.frequency.exponentialRampToValueAtTime(1040, t0 + 0.12);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(schedule).catch(() => {});
    } else {
      schedule();
    }
  } catch (_) { /* ignore audio failures */ }
};

// Calibration: dress each WebGazer point up as a cute animal.
// The plugin still owns the point element and its click handler; WebGazer
// learns from the actual click position, so the animal is centered on the spot.
// escaped so they render even when the page is served without a UTF-8 charset
// dog, cat, rabbit, panda, koala, fox, frog, monkey, pig, tiger, lion, penguin
const CALIBRATION_ANIMALS = [
  "\u{1F436}", "\u{1F431}", "\u{1F430}", "\u{1F43C}", "\u{1F428}", "\u{1F98A}",
  "\u{1F438}", "\u{1F435}", "\u{1F437}", "\u{1F42F}", "\u{1F981}", "\u{1F427}",
];

const startAnimalCalibration = () => {
  const container = document.getElementById("webgazer-calibrate-container");
  if (!container) return () => {};

  const animals = CALIBRATION_ANIMALS.slice();
  for (let i = animals.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [animals[i], animals[j]] = [animals[j], animals[i]];
  }
  let next = 0;

  const decorate = () => {
    const point = container.querySelector("#calibration-point");
    if (!point || point.classList.contains("calibration-animal")) return;
    const { left, top } = point.style;
    point.style.cssText = `left:${left};top:${top};`;
    point.className = "calibration-animal";
    const face = document.createElement("span");
    face.className = "calibration-animal-face";
    face.textContent = animals[next % animals.length];
    next += 1;
    point.appendChild(face);
  };

  const burst = (x, y) => {
    const pop = document.createElement("div");
    pop.className = "calibration-pop";
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
    pop.textContent = "\u2728"; // sparkles
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 700);
  };

  const onClick = (e) => {
    if (!e.target.closest || !e.target.closest(".calibration-animal")) return;
    burst(e.clientX, e.clientY);
    playPopSound();
  };

  // capture phase: the last point's own click handler ends the trial (and this cleanup)
  const observer = new MutationObserver(decorate);
  observer.observe(container, { childList: true });
  container.addEventListener("click", onClick, true);
  decorate();

  return () => {
    observer.disconnect();
    container.removeEventListener("click", onClick, true);
  };
};

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
  if (!Array.isArray(spinnerData.spins)) {
    spinnerData.spins = [];
  }
  let currentSpin = null;

  const spinnerStartTs = performance.now();

  // Event times share webgazer_data's clock: ms from the WebGazer extension's
  // on_load for this trial. Without gaze (test mode), ms from wheel creation.
  const toTrialClock = (ts) => {
    const wg = jsPsych.extensions && jsPsych.extensions.webgazer;
    const start = wg && wg.currentTrialStart >= spinnerStartTs ? wg.currentTrialStart : spinnerStartTs;
    return Math.round(ts - start);
  };

  // Where the needle and wheel are depends on window size, zoom, scrolling, and
  // the collected-faces tray above the wheel, so the layout is re-measured and a
  // new entry is logged (with its time) whenever any of it changes.
  // needle: #spin is a zero-size anchor on the rim; its red ::after flapper is
  // rotated 180deg about that anchor, so it hangs straight down from it
  if (!Array.isArray(spinnerData.layouts)) {
    spinnerData.layouts = [];
  }
  const measureGeometry = () => {
    if (!canvas.isConnected) return;
    const layout = { viewport_w: window.innerWidth, viewport_h: window.innerHeight };
    const needle = document.getElementById("spin");
    if (needle) {
      const anchor = needle.getBoundingClientRect();
      const flapper = getComputedStyle(needle, "::after");
      const w = parseFloat(flapper.width) || 44;
      const h = parseFloat(flapper.height) || 40;
      layout.needle_x = Math.round(anchor.left);
      layout.needle_y = Math.round(anchor.top + h / 2);
      layout.needle_w = Math.round(w);
      layout.needle_h = Math.round(h);
    }
    // the canvas rotates about its center, so its rect center is stable
    const box = canvas.getBoundingClientRect();
    layout.wheel_x = Math.round(box.left + box.width / 2);
    layout.wheel_y = Math.round(box.top + box.height / 2);
    layout.wheel_r = Math.round((canvas.offsetWidth / 2) * ((drawRadius + rimWidth / 2) / rad));

    const last = spinnerData.layouts[spinnerData.layouts.length - 1];
    if (last && LAYOUT_FIELDS.every((key) => last[key] === layout[key])) return;
    layout.t = toTrialClock(performance.now());
    spinnerData.layouts.push(layout);
  };
  measureGeometry();

  /* faint peripheral shapes (low-contrast, one at a time), each tied to a spin event */
  const SLOWING_VEL_FRAC = 0.5;     // "slowing" fires when coast velocity <= this x launch velocity
  const ALMOST_STOPPED_DEG = 90;    // "almost_stopped" fires with <= this much rotation left (one sector)
  const DISTRACTOR_JITTER_MS = 100; // shape appears 0..this ms after its trigger
  const DISTRACTOR_VISIBLE_MS = [900, 1600];
  const distractorSchedule = getDistractorSchedule();
  let spinIndex = spinnerData.outcomes.length; // spin the current events belong to (0-based)
  let firedThisSpin = new Set();
  let launchVel = null; // coast velocity at release, for the "slowing" threshold
  const pendingShowTimers = new Set(); // jitter timers not yet fired
  let hideTimer = null;
  const DISTRACTOR_EDGE = 30;      // px kept clear of the viewport edge
  const DISTRACTOR_WHEEL_GAP = 50; // px kept clear outside the wheel rim
  const DISTRACTOR_TRAY_GAP = 30;  // px kept clear around the collected-faces tray
  const DISTRACTOR_MIN_MOVE = 200; // px from the previous shape's spot
  let lastDistractorSpot = null;
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
  let currentDistractor = null;

  // immediate: hidden before its planned duration (replaced by a newer trigger, or trial ended)
  const hideDistractor = (immediate) => {
    if (hideTimer != null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (currentDistractor && currentDistractor.t_off == null) {
      currentDistractor.t_off = toTrialClock(performance.now());
      currentDistractor.cut_short = !!immediate;
    }
    currentDistractor = null;
    distractorEl.classList.remove("is-visible");
    if (immediate) distractorEl.style.opacity = "0";
  };

  const pickDistractorSlot = (size) => {
    // rect center is stable under rotation, but the rotated rect is wider than
    // the wheel, so the keep-out radius uses the unrotated layout width
    const wheel = canvas.getBoundingClientRect();
    const cx = wheel.x + wheel.width / 2;
    const cy = wheel.y + wheel.height / 2;
    const half = size / 2;
    const wheelKeepOut = canvas.offsetWidth / 2 + DISTRACTOR_WHEEL_GAP + half;
    const tray = collectedFacesEl ? collectedFacesEl.getBoundingClientRect() : null;
    const trayPad = DISTRACTOR_TRAY_GAP + half;
    const inTray = (x, y) => tray && tray.width > 0 &&
      x > tray.left - trayPad && x < tray.right + trayPad &&
      y > tray.top - trayPad && y < tray.bottom + trayPad;
    const minX = DISTRACTOR_EDGE + half;
    const maxX = window.innerWidth - DISTRACTOR_EDGE - half;
    const minY = DISTRACTOR_EDGE + half;
    const maxY = window.innerHeight - DISTRACTOR_EDGE - half;
    let fallback = null;
    for (let i = 0; i < 300; i++) {
      const x = rand(minX, maxX);
      const y = rand(minY, maxY);
      if (Math.hypot(x - cx, y - cy) < wheelKeepOut || inTray(x, y)) continue;
      if (!lastDistractorSpot ||
          Math.hypot(x - lastDistractorSpot.x, y - lastDistractorSpot.y) >= DISTRACTOR_MIN_MOVE) {
        return { x, y };
      }
      if (!fallback) fallback = { x, y };
    }
    // tiny windows: drop the move-away rule first, then settle for the
    // corner farthest from the wheel that isn't under the tray
    if (fallback) return fallback;
    const corners = [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]]
      .filter(([x, y]) => !inTray(x, y))
      .sort((a, b) => Math.hypot(b[0] - cx, b[1] - cy) - Math.hypot(a[0] - cx, a[1] - cy));
    const [x, y] = corners.length ? corners[0] : [maxX, maxY];
    return { x, y };
  };

  // a newer trigger replaces whatever shape is still showing
  const showDistractor = (trigger, jitterMs) => {
    if (!active) return;
    if (currentDistractor) hideDistractor(true);
    const kind = "circle";
    const size = Math.round(rand(22, 30));
    const slot = pickDistractorSlot(size);
    lastDistractorSpot = slot;
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
      t_on: toTrialClock(performance.now()),
      t_off: null,
      n_spins: spinnerData.outcomes.length,
      spin_index: spinIndex,
      trigger,
      jitter_ms: jitterMs,
      cut_short: false,
    };
    spinnerData.distractors.push(currentDistractor);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      hideDistractor(false);
    }, rand(DISTRACTOR_VISIBLE_MS[0], DISTRACTOR_VISIBLE_MS[1]));
  };

  // the spin whose events we are now inside; resets the per-spin fired set
  const beginSpinPhase = () => {
    const next = spinnerData.outcomes.length;
    if (next !== spinIndex) {
      spinIndex = next;
      firedThisSpin = new Set();
    }
  };

  // show a shape (after jitter) if this event is on the schedule for this spin
  const fireTrigger = (eventName) => {
    if (spinnerType === "practice" || !active || firedThisSpin.has(eventName)) return;
    firedThisSpin.add(eventName);
    const block = distractorSchedule[spinIndex % DISTRACTOR_BLOCK_SPINS];
    if (!block || block.indexOf(eventName) === -1) return;
    const jitter = Math.round(rand(0, DISTRACTOR_JITTER_MS));
    const timer = setTimeout(() => {
      pendingShowTimers.delete(timer);
      showDistractor(eventName, jitter);
    }, jitter);
    pendingShowTimers.add(timer);
  };

  const stopDistractors = (immediate) => {
    pendingShowTimers.forEach((t) => clearTimeout(t));
    pendingShowTimers.clear();
    hideDistractor(immediate);
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
        ctx.drawImage(img, -faceSize / 2, faceRadius - faceSize / 2, faceSize, faceSize);
        if (isSpinning && i === highlightIndex) {
          ctx.beginPath();
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 6;
          ctx.arc(0, faceRadius, faceSize / 2 + 4, 0, 2 * PI);
          ctx.stroke();
        }
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
      img.onload = measureGeometry; // a new tray row can push the wheel down
      img.src = faceSrc;
      img.alt = String(points);
      img.className = "collected-face";
      collectedFacesEl.appendChild(img);
      measureGeometry();
    }
    setTimeout(() => {
      if (!active) return;
      isSpinning = false;
      isLanding = false;
      isDecelerating = false;
      isAccelerating = false;
      spinnerData.isSpinning = false;
      drawSector(sectors, null);
      // wheel idle again: the next spin's "wedges_visible" moment (unless the wheel is done)
      if (spinnerData.maxSpins == null || spinnerData.outcomes.length < spinnerData.maxSpins) {
        beginSpinPhase();
        fireTrigger("wedges_visible");
      }
      // still holding space after landing — resume pacing without a re-press
      if (spaceHeld) {
        startSpin(true);
      }
    }, 1000);
  };

  let stopConfetti = null;

  // Where the needle stopped inside wedge idx. The wheel turns clockwise, so the
  // needle crosses each wedge from its high edge ((idx+1) * width) toward its low
  // edge (idx * width) and would next enter wedge idx-1.
  const landingEdge = (idx, angle) => {
    const wedgeDeg = 360 / tot;
    const onWheel = ((POINTER_DEG - angle) % 360 + 360) % 360;
    let fromLow = ((onWheel - idx * wedgeDeg) % 360 + 360) % 360;
    if (fromLow > 180) fromLow -= 360; // stop threshold can leave it a hair past the edge
    const pos = 1 - fromLow / wedgeDeg;
    const nearExit = pos >= 0.5;
    return {
      edge_dist_deg: Math.round((nearExit ? fromLow : wedgeDeg - fromLow) * 100) / 100,
      wedge_pos: Math.round(pos * 1000) / 1000,
      near_edge: nearExit ? "exit" : "entry",
      neighbor_outcome: sectors[((idx + (nearExit ? -1 : 1)) % tot + tot) % tot].value,
    };
  };

  const landOnSector = (idx) => {
    animFrame = null;
    angVel = 0;
    isDecelerating = false;
    isLanding = true;
    const sector = sectors[idx];
    const holdMs = pendingHoldMs != null ? pendingHoldMs : null;
    spinnerData.outcomes.push(sector.value);
    spinnerData.hold_durations.push(holdMs);
    pendingHoldMs = null;
    if (currentSpin) {
      currentSpin.t_land = toTrialClock(performance.now());
      currentSpin.hold_ms = holdMs;
      currentSpin.outcome = sector.value;
      Object.assign(currentSpin, landingEdge(idx, currentAngle));
      currentSpin = null;
    }
    drawSector(sectors, idx);
    if (sector.value === 5) {
      if (stopConfetti) stopConfetti();
      stopConfetti = launchGreenConfetti();
    }
    if (sector.value === 1 || sector.value === 2 || sector.value === 4 || sector.value === 5) {
      playFaceSound(sector.value);
    }
    fireTrigger("land");
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

    // coast milestones (fireTrigger ignores repeats within a spin)
    if (launchVel != null && angVel <= launchVel * SLOWING_VEL_FRAC) {
      fireTrigger("slowing");
    }
    if (angVel / FRICTION_K <= ALMOST_STOPPED_DEG) { // remaining rotation = v / k
      fireTrigger("almost_stopped");
    }

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

  // resumed: started because space was still held when the last landing ended
  const startSpin = (resumed = false) => {
    if (!active || isSpinning || isLanding) return;
    if (spinnerData.maxSpins != null && spinnerData.outcomes.length >= spinnerData.maxSpins) return;
    measureGeometry();
    currentSpin = {
      t_start: toTrialClock(performance.now()),
      t_release: null,
      t_land: null,
      hold_ms: null,
      outcome: null,
      edge_dist_deg: null,
      wedge_pos: null,
      near_edge: null,
      neighbor_outcome: null,
      resumed: resumed ? 1 : 0,
    };
    spinnerData.spins.push(currentSpin);
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
    launchVel = null;
    beginSpinPhase();
    fireTrigger("charge");
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
    launchVel = angVel;
    fireTrigger("launch");
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
        if (currentSpin) currentSpin.t_release = toTrialClock(keyupTs);
        beginStop();
      }
    }, 40);
  };

  const onResize = () => {
    wheelWidth = canvas.getBoundingClientRect()['width'];
    wheelHeight = canvas.getBoundingClientRect()['height'];
    wheelX = canvas.getBoundingClientRect()['x'] + wheelWidth / 2;
    wheelY = canvas.getBoundingClientRect()['y'] + wheelHeight / 2;
    measureGeometry();
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
    measureGeometry();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize, true);
    window.removeEventListener("scroll", measureGeometry, true);
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
    // first sight of the wedges — spin 1's "wedges_visible" moment
    beginSpinPhase();
    fireTrigger("wedges_visible");
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize, true);
  window.addEventListener("scroll", measureGeometry, { capture: true, passive: true });

};
