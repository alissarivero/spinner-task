
const exp = (function() {


    var p = {};


   /*
    *
    *   INSTRUCTIONS
    *
    */

    const html = {
        intro: [
            `<div class='parent'>
                <p><strong>Welcome to Spin the Wheel!</strong></p>
                <p>You're going to spin prize wheels!</p>
            </div>`,

            `<div class='parent'>
                <p>You will spin each wheel at least <strong>4 times</strong>.</p>
                <p>After each wheel, you'll say how much you liked it and how happy you feel.</p>
            </div>`,
        ],

        postTask: [
            `<div class='parent'>
                <p><strong>Thanks for playing!</strong></p>
                <p>Just a few last questions.</p>
            </div>`
        ],
    };

    p.consent = {
        type: jsPsychExternalHtml,
        url: "./html/consent.html",
        cont_btn: "advance",
    };

    // left → right: 1 = Really Don't Like … 5 = Really Like
    const likingLabels = [
        "Really Don't Like",
        "Don't Like",
        "Okay",
        "Like",
        "Really Like",
    ];

    const likingThumbButtons = likingLabels.map((label, i) =>
        `<button class="jspsych-btn liking-thumb-btn" type="button">` +
        `<span class="liking-thumb-icon liking-thumb-${i}" aria-hidden="true"></span>` +
        `<span class="liking-thumb-label">${label}</span>` +
        `</button>`
    );

    // left → right: 1 = Really Sad … 5 = Really Happy
    const happinessLabels = [
        "Really Sad",
        "Sad",
        "Okay",
        "Happy",
        "Really Happy",
    ];

    const happinessFaceButtons = happinessLabels.map((label, i) =>
        `<button class="jspsych-btn happiness-face-btn" type="button">` +
        `<span class="happiness-face-icon happiness-face-${i}" aria-hidden="true"></span>` +
        `<span class="happiness-face-label">${label}</span>` +
        `</button>`
    );

    // fullscreen embedded video that auto-advances when finished
    const makeFullscreenVideo = (src, phase, elementId) => ({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="intro-video-stage">
            <video id="${elementId}" class="intro-video-fullscreen" src="${src}" playsinline></video>
            <button type="button" id="${elementId}-start" class="intro-video-start">Start</button>
        </div>`,
        choices: "NO_KEYS",
        response_ends_trial: false,
        data: { phase },
        on_load: function() {
            const video = document.getElementById(elementId);
            const startBtn = document.getElementById(`${elementId}-start`);
            if (!video) return;

            let finished = false;
            const endVideo = () => {
                if (finished) return;
                finished = true;
                jsPsych.finishTrial({ phase });
            };

            const beginPlayback = () => {
                if (startBtn) startBtn.style.display = "none";
                const playPromise = video.play();
                if (playPromise && typeof playPromise.catch === "function") {
                    playPromise.catch(() => {
                        if (startBtn) startBtn.style.display = "block";
                    });
                }
            };

            video.addEventListener("ended", endVideo);
            if (startBtn) {
                startBtn.addEventListener("click", beginPlayback);
            }

            const attempt = video.play();
            if (attempt && typeof attempt.then === "function") {
                attempt.then(() => {
                    if (startBtn) startBtn.style.display = "none";
                }).catch(() => {
                    if (startBtn) startBtn.style.display = "block";
                });
            } else if (startBtn) {
                startBtn.style.display = "block";
            }
        },
        post_trial_gap: 0,
    });

    p.introVideo = makeFullscreenVideo("./img/intro.mp4", "intro_video", "intro-video");
    p.outroVideo = makeFullscreenVideo("./img/outro.mp4", "outro_video", "outro-video");

    // still first-frame backdrop + instruction text + Start button (like intro gate)
    const makeBackdropTransition = (message, phase) => {
        const videoId = `transition-bg-${phase}`;
        const btnId = `transition-btn-${phase}`;
        return {
            type: jsPsychHtmlKeyboardResponse,
            stimulus: `<div class="intro-video-stage">
                <video id="${videoId}" class="intro-video-fullscreen" src="./img/intro.mp4" muted playsinline preload="auto"></video>
                <div class="transition-overlay" aria-hidden="true"></div>
                <div class="transition-panel">
                    <p class="transition-message">${message}</p>
                    <button type="button" id="${btnId}" class="intro-video-start transition-btn">Start</button>
                </div>
            </div>`,
            choices: "NO_KEYS",
            response_ends_trial: false,
            data: { phase },
            on_load: function() {
                const video = document.getElementById(videoId);
                const btn = document.getElementById(btnId);

                // show first frame only — do not play the video
                if (video) {
                    video.muted = true;
                    video.pause();
                    const showFrame = () => {
                        try {
                            video.currentTime = 0.1;
                        } catch (_) {}
                    };
                    if (video.readyState >= 1) {
                        showFrame();
                    } else {
                        video.addEventListener("loadedmetadata", showFrame, { once: true });
                    }
                }

                if (btn) {
                    btn.style.display = "block";
                    btn.addEventListener("click", () => {
                        jsPsych.finishTrial({ phase });
                    });
                }
            },
            post_trial_gap: 0,
        };
    };

    p.spinLearnTransition = makeBackdropTransition(
        "Now, you'll learn how to spin a wheel",
        "transition_spin_learn"
    );
    p.playGameTransition = makeBackdropTransition(
        "Great, now it's time to play the game!",
        "transition_play_game"
    );
    p.facesTransition = makeBackdropTransition(
        "You will see spinners with faces on them",
        "transition_faces"
    );
    p.chooseTransition = makeBackdropTransition(
        "Now, you get to choose a wheel to spin 3 more times",
        "transition_choose"
    );

    // teach thumbs scale + two confirmed practice questions
    const likingConfirmPhrase = (label, topic) => {
        switch (label) {
            case "Really Like":
                return `You really like ${topic}`;
            case "Like":
                return `You like ${topic}`;
            case "Okay":
                return `You think ${topic} is okay`;
            case "Don't Like":
                return `You don't like ${topic}`;
            case "Really Don't Like":
                return `You really don't like ${topic}`;
            default:
                return `You chose: ${label}`;
        }
    };

    const happinessConfirmPhrase = (label) => {
        switch (label) {
            case "Really Sad":
                return "You are really sad";
            case "Sad":
                return "You are sad";
            case "Okay":
                return "You feel okay";
            case "Happy":
                return "You are happy";
            case "Really Happy":
                return "You are really happy";
            default:
                return `You chose: ${label}`;
        }
    };

    const makeThumbsCheck = (questionId, prompt, topic) => {
        let pendingChoice = null;
        let confirmed = false;

        const select = {
            type: jsPsychHtmlButtonResponse,
            stimulus: `<div class="parent liking-prompt">
                <p><strong>${prompt}</strong></p>
            </div>`,
            choices: likingLabels.slice(),
            button_html: likingThumbButtons.slice(),
            margin_vertical: "8px",
            margin_horizontal: "10px",
            data: { phase: "thumbs_training", thumbs_training_q: questionId },
            on_load: function() {
                confirmed = false;
                const group = document.getElementById("jspsych-html-button-response-btngroup");
                if (group) group.classList.add("liking-thumb-row");
            },
            on_finish: function(data) {
                pendingChoice = data.response;
                data.liking = data.response + 1; // 1 = Really Don't Like … 5 = Really Like
                data.liking_label = likingLabels[data.response];
            },
            post_trial_gap: 300,
        };

        const confirm = {
            type: jsPsychHtmlButtonResponse,
            stimulus: function() {
                const label = likingLabels[pendingChoice] || "";
                const phrase = likingConfirmPhrase(label, topic);
                const colorClass = `thumbs-confirm-picked-${pendingChoice}`;
                return `<div class="parent thumbs-confirm">
                    <div class="thumbs-confirm-picked ${colorClass}">${phrase}</div>
                    <p>Is that right?</p>
                </div>`;
            },
            choices: ["Yes", "Choose Again"],
            button_html: [
                `<button class="jspsych-btn thumbs-confirm-choice" type="button">%choice%</button>`,
                `<button class="jspsych-btn thumbs-confirm-choice" type="button">%choice%</button>`,
            ],
            data: { phase: "thumbs_training_confirm", thumbs_training_q: questionId },
            on_finish: function(data) {
                confirmed = data.response === 0;
                data.confirmed = confirmed;
                data.liking = pendingChoice + 1;
                data.liking_label = likingLabels[pendingChoice];
            },
            post_trial_gap: 300,
        };

        return {
            timeline: [select, confirm],
            loop_function: function() {
                return !confirmed;
            },
        };
    };

    const makeHappinessCheck = (questionId, prompt) => {
        let pendingChoice = null;
        let confirmed = false;

        const select = {
            type: jsPsychHtmlButtonResponse,
            stimulus: `<div class="parent liking-prompt">
                <p><strong>${prompt}</strong></p>
            </div>`,
            choices: happinessLabels.slice(),
            button_html: happinessFaceButtons.slice(),
            margin_vertical: "8px",
            margin_horizontal: "10px",
            data: { phase: "happiness_training", happiness_training_q: questionId },
            on_load: function() {
                confirmed = false;
                const group = document.getElementById("jspsych-html-button-response-btngroup");
                if (group) group.classList.add("happiness-face-row");
            },
            on_finish: function(data) {
                pendingChoice = data.response;
                data.happiness = data.response + 1; // 1 = Really Sad … 5 = Really Happy
                data.happiness_label = happinessLabels[data.response];
            },
            post_trial_gap: 300,
        };

        const confirm = {
            type: jsPsychHtmlButtonResponse,
            stimulus: function() {
                const label = happinessLabels[pendingChoice] || "";
                const phrase = happinessConfirmPhrase(label);
                const colorClass = `thumbs-confirm-picked-${pendingChoice}`;
                return `<div class="parent thumbs-confirm">
                    <div class="thumbs-confirm-picked ${colorClass}">${phrase}</div>
                    <p>Is that right?</p>
                </div>`;
            },
            choices: ["Yes", "Choose Again"],
            button_html: [
                `<button class="jspsych-btn thumbs-confirm-choice" type="button">%choice%</button>`,
                `<button class="jspsych-btn thumbs-confirm-choice" type="button">%choice%</button>`,
            ],
            data: { phase: "happiness_training_confirm", happiness_training_q: questionId },
            on_finish: function(data) {
                confirmed = data.response === 0;
                data.confirmed = confirmed;
                data.happiness = pendingChoice + 1;
                data.happiness_label = happinessLabels[pendingChoice];
            },
            post_trial_gap: 300,
        };

        return {
            timeline: [select, confirm],
            loop_function: function() {
                return !confirmed;
            },
        };
    };

    // Objective "which face is better?" check: feedback + retry until correct
    const makeCompareCheck = ({
        question,
        left,
        right,
        choices,
        buttonHtml,
        dataExtra = {},
        feedbackPhase,
        onLoad,
        scoreChosen,
    }) => {
        let lastCorrect = false;
        let attempt = 0;

        const compare = {
            type: jsPsychHtmlButtonResponse,
            stimulus: `<div class='parent face-compare'>
                <p><strong>Question ${question}: Which face is better?</strong></p>
            </div>`,
            choices,
            button_html: buttonHtml,
            margin_horizontal: "48px",
            data: {
                training_question: question,
                left_face: left,
                right_face: right,
                ...dataExtra,
            },
            on_load: function() {
                lastCorrect = false;
                if (typeof onLoad === "function") onLoad();
            },
            on_finish: (data) => {
                attempt += 1;
                const scored = scoreChosen(data.response);
                data.chosen_face = scored.chosen_face;
                data.correct = scored.correct;
                data.attempt = attempt;
                lastCorrect = scored.correct;
            },
            post_trial_gap: 300,
        };

        const feedback = {
            type: jsPsychHtmlButtonResponse,
            stimulus: function() {
                const msg = lastCorrect
                    ? "Correct!"
                    : "That's not quite right. Try again!";
                return `<div class="parent face-compare">
                    <p><strong>${msg}</strong></p>
                </div>`;
            },
            choices: ["Continue"],
            data: {
                training_question: question,
                ...dataExtra,
            },
            on_finish: (data) => {
                data.phase = feedbackPhase;
                data.correct = lastCorrect;
                data.attempt = attempt;
            },
            post_trial_gap: 300,
        };

        return {
            timeline: [compare, feedback],
            loop_function: function() {
                return !lastCorrect;
            },
        };
    };

    const makeScaleTeach = ({ labels, buttonsHtml, rowClass, phase, onRevealItem }) => ({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="parent liking-prompt thumbs-teach-prompt"></div>
            <div id="scale-teach-group" class="${rowClass} thumbs-teach-mode scale-teach-group">
                ${buttonsHtml.map((html, i) =>
                    `<div class="jspsych-html-button-response-button scale-teach-slot" data-teach-idx="${i}">${html}</div>`
                ).join("")}
            </div>
            <div class="scale-teach-next-wrap">
                <button type="button" id="scale-teach-next" class="jspsych-btn thumbs-teach-next-btn">Next</button>
            </div>`,
        choices: "NO_KEYS",
        response_ends_trial: false,
        data: { phase },
        on_load: function() {
            let revealed = 0;
            const n = labels.length;
            const group = document.getElementById("scale-teach-group");
            const nextBtn = document.getElementById("scale-teach-next");
            if (!group || !nextBtn) return;

            const applyReveal = () => {
                for (let j = 0; j < n; j++) {
                    const slot = group.querySelector(`[data-teach-idx="${j}"]`);
                    if (!slot) continue;
                    if (j > revealed) slot.classList.add("thumbs-teach-hidden");
                    else slot.classList.remove("thumbs-teach-hidden");
                }
                nextBtn.textContent = revealed >= n - 1 ? "Continue" : "Next";
                if (typeof onRevealItem === "function") onRevealItem(revealed);
            };

            applyReveal();

            nextBtn.addEventListener("click", () => {
                if (revealed >= n - 1) {
                    jsPsych.finishTrial({ phase, advanced: true, n_revealed: n });
                    return;
                }
                revealed += 1;
                applyReveal();
            });
        },
        post_trial_gap: 300,
    });

    // early happiness faces training (scale used for "how happy" DV)
    const happinessCompareItems = [
        { left: 4, right: 1, question: 1 }, // Really Happy vs Sad
        { left: 0, right: 2, question: 2 }, // Really Sad vs Okay
    ];

    p.happinessTraining = {
        timeline: [
            {
                type: jsPsychHtmlButtonResponse,
                stimulus: `<div class="parent">
                    <p><strong>Before we play the game, I want to show you these faces.</strong></p>
                    <p>You can use these faces to tell me how happy you are.</p>
                </div>`,
                choices: ["Continue"],
                data: { phase: "happiness_training_intro" },
                post_trial_gap: 400,
            },
            makeScaleTeach({
                labels: happinessLabels,
                buttonsHtml: happinessFaceButtons,
                rowClass: "happiness-face-row",
                phase: "happiness_training_scale",
            }),
            ...happinessCompareItems.map((q) => makeCompareCheck({
                question: q.question,
                left: q.left + 1,
                right: q.right + 1,
                choices: [happinessLabels[q.left], happinessLabels[q.right]],
                buttonHtml: [
                    happinessFaceButtons[q.left],
                    happinessFaceButtons[q.right],
                ],
                dataExtra: { phase: "happiness_training_compare" },
                feedbackPhase: "happiness_training_compare_feedback",
                onLoad: function() {
                    const group = document.getElementById("jspsych-html-button-response-btngroup");
                    if (group) group.classList.add("happiness-face-row");
                },
                scoreChosen: (response) => {
                    const chosenIdx = [q.left, q.right][response];
                    return {
                        chosen_face: chosenIdx + 1,
                        correct: chosenIdx === Math.max(q.left, q.right),
                    };
                },
            })),
            makeHappinessCheck("how_happy_now", "Can you tell me how happy you are right now?"),
        ],
    };

    p.thumbsTraining = {
        timeline: [
            {
                type: jsPsychHtmlButtonResponse,
                stimulus: `<div class="parent">
                    <p><strong>Great! Now I want to show you these thumbs.</strong></p>
                    <p>You can use them to tell how much you like something.</p>
                </div>`,
                choices: ["Continue"],
                data: { phase: "thumbs_training_intro" },
                post_trial_gap: 400,
            },
            makeScaleTeach({
                labels: likingLabels,
                buttonsHtml: likingThumbButtons,
                rowClass: "liking-thumb-row",
                phase: "thumbs_training_scale",
            }),
            makeThumbsCheck("ice_cream", "How much do you like ice cream?", "ice cream"),
            makeThumbsCheck("ice_cream_dirt", "How much do you like ice cream with dirt on it?", "ice cream with dirt on it"),
        ],
    };

    p.intro = {
        type: jsPsychInstructions,
        pages: html.intro,
        show_clickable_nav: true,
        post_trial_gap: 500,
    };

    const faceTrainingItems = [
        { value: 1, label: "Very bad", face: "./img/new-faces/1.png" },
        { value: 2, label: "Bad", face: "./img/new-faces/2.png" },
        { value: 3, label: "Okay", face: "./img/new-faces/3.png" },
        { value: 4, label: "Good", face: "./img/new-faces/4.png" },
        { value: 5, label: "Very Good", face: "./img/new-faces/5.png" },
    ];

    const prizeFaceButtons = faceTrainingItems.map((item) =>
        `<button class="jspsych-btn prize-face-btn" type="button">` +
        `<img src="${item.face}" alt="${item.label}" class="prize-face-img" />` +
        `<span class="prize-face-label">${item.label}</span>` +
        `</button>`
    );

    p.faceTraining = makeScaleTeach({
        labels: faceTrainingItems.map((f) => f.label),
        buttonsHtml: prizeFaceButtons,
        rowClass: "prize-face-row",
        phase: "prize_face_training",
        onRevealItem: (i) => {
            const item = faceTrainingItems[i];
            if (!item) return;
            if (item.value === 5) {
                launchGreenConfetti();
                playFaceSound(5);
            } else if (item.value === 1 || item.value === 2 || item.value === 4) {
                playFaceSound(item.value);
            }
            // face 3: silent
        },
    });

    const faceByValue = Object.fromEntries(
        faceTrainingItems.map((item) => [item.value, item])
    );

    const faceCompareItems = [
        { left: 5, right: 2, question: 1 },
        { left: 1, right: 3, question: 2 },
        { left: 4, right: 5, question: 3 },
    ];

    p.faceCompare = {
        timeline: faceCompareItems.map((q) => makeCompareCheck({
            question: q.question,
            left: q.left,
            right: q.right,
            choices: [String(q.left), String(q.right)],
            buttonHtml: [
                `<button class="jspsych-btn face-choice-btn">
                    <img src="${faceByValue[q.left].face}" alt="Face ${q.left}" class="face-choice-img" />
                </button>`,
                `<button class="jspsych-btn face-choice-btn">
                    <img src="${faceByValue[q.right].face}" alt="Face ${q.right}" class="face-choice-img" />
                </button>`,
            ],
            dataExtra: { phase: "prize_face_compare" },
            feedbackPhase: "prize_face_compare_feedback",
            scoreChosen: (response) => {
                const chosen = [q.left, q.right][response];
                return {
                    chosen_face: chosen,
                    correct: chosen === Math.max(q.left, q.right),
                };
            },
        })),
    };

    // practice: hold space on black/white alternating wheel
    const blankSectors = [
        { value: 0, color: "#000000", face: null },
        { value: 0, color: "#ffffff", face: null },
        { value: 0, color: "#000000", face: null },
        { value: 0, color: "#ffffff", face: null },
    ];

    p.spinPractice = {
        type: jsPsychCanvasButtonResponse,
        stimulus: function(c, spinnerData) {
            createSpinner(c, spinnerData, 0, blankSectors, "practice", null);
        },
        canvas_size: [500, 500],
        min_spins: 1,
        max_spins: 1,
        show_score_board: false,
        prompt_position: "above",
        score: 0,
        prompt: `<div class="spin-practice-prompt"><p>Press and hold the <strong>space bar</strong> to turn the wheel. Release to launch a spin.</p></div>`,
        post_trial_gap: 800,
        data: { phase: "spin_practice" },
    };

   /*
    *
    *   TASK
    *
    */


    // face wedges (value 1–5)
    const wedges = {
        one:   { value: 1, color: "#ffffff", face: "./img/new-faces/1.png" },
        two:   { value: 2, color: "#ffffff", face: "./img/new-faces/2.png" },
        three: { value: 3, color: "#ffffff", face: "./img/new-faces/3.png" },
        four:  { value: 4, color: "#ffffff", face: "./img/new-faces/4.png" },
        five:  { value: 5, color: "#ffffff", face: "./img/new-faces/5.png" },
    };

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

    // fixed sequences shared by all participants: even overall, even first 4, shuffled rest
    const buildForcedOrder = (values, nSpins, seed) => {
        const perValue = nSpins / values.length;
        const firstBlockSize = 4;
        const firstPerValue = firstBlockSize / values.length;
        const first = [];
        const rest = [];
        for (const v of values) {
            for (let i = 0; i < firstPerValue; i++) first.push(v);
            for (let i = 0; i < perValue - firstPerValue; i++) rest.push(v);
        }
        return shuffleSeeded(first, seed).concat(shuffleSeeded(rest, seed + 1000));
    };

    const FORCE_SEED = 42;
    const highForced = buildForcedOrder([5, 4, 2, 1], 12, FORCE_SEED);
    const mediumForced = buildForcedOrder([4, 2], 12, FORCE_SEED + 1);
    const half51Forced = buildForcedOrder([5, 1], 12, FORCE_SEED + 2);
    jsPsych.data.addProperties({
        high_outcome_order: highForced.join("-"),
        medium_outcome_order: mediumForced.join("-"),
        half51_outcome_order: half51Forced.join("-"),
    });

    // six spinner types
    const wheelDefs = {
        high: {
            sectors: [ wedges.five, wedges.four, wedges.two, wedges.one ],
            spinner_type: "high",
            forced_outcomes: highForced,
        },
        medium: {
            sectors: [ wedges.four, wedges.two, wedges.four, wedges.two ],
            spinner_type: "medium",
            forced_outcomes: mediumForced,
        },
        low: {
            sectors: [ wedges.three, wedges.three, wedges.three, wedges.three ],
            spinner_type: "low",
        },
        all5: {
            sectors: [ wedges.five, wedges.five, wedges.five, wedges.five ],
            spinner_type: "all5",
        },
        all1: {
            sectors: [ wedges.one, wedges.one, wedges.one, wedges.one ],
            spinner_type: "all1",
        },
        half51: {
            sectors: [ wedges.five, wedges.one, wedges.five, wedges.one ],
            spinner_type: "half51",
            forced_outcomes: half51Forced,
        },
    };

    // six wheels; presentation order shuffled by jsPsych (randomize_order: true)
    const wheelKeys = ["high", "medium", "low", "all5", "all1", "half51"];
    const wheels = wheelKeys.map((key) => ({ ...wheelDefs[key] }));

    let scoreTracker = 0; // track current score
    let round = 1;  // track current round
    let presentedOrder = []; // actual spinner_type order as shown

    // trial: spinner
    const spin = {
        type: jsPsychCanvasButtonResponse,
        stimulus: function(c, spinnerData) {
            createSpinner(c, spinnerData, scoreTracker,
                jsPsych.timelineVariable('sectors'),
                jsPsych.timelineVariable('spinner_type'),
                jsPsych.timelineVariable('forced_outcomes'));
        },
        canvas_size: [500, 500],
        score: function() {
            return scoreTracker
        },
        post_trial_gap: 1000,
        data: {
            spinner_type: jsPsych.timelineVariable('spinner_type'),
            forced_outcomes: jsPsych.timelineVariable('forced_outcomes'),
        },
        on_finish: function(data) {
            data.round = round;
            presentedOrder.push(data.spinner_type);
            data.order = presentedOrder.length - 1;
            data.order_perm = presentedOrder.join("-");
            jsPsych.data.addProperties({ order_perm: presentedOrder.join("-") });
            scoreTracker = data.score
        }
    };

    // trial: liking DV (thumbs scale)
    const likingMeasure = {
        type: jsPsychHtmlButtonResponse,
        stimulus: `<div class='parent liking-prompt'>
            <p><strong>How much did you like that spinner?</strong></p>
        </div>`,
        choices: likingLabels.slice(),
        button_html: likingThumbButtons.slice(),
        margin_vertical: "8px",
        margin_horizontal: "10px",
        data: {
            spinner_type: jsPsych.timelineVariable('spinner_type'),
        },
        on_load: function() {
            const group = document.getElementById("jspsych-html-button-response-btngroup");
            if (group) group.classList.add("liking-thumb-row");
        },
        on_finish: function(data) {
            data.round = round;
            data.order = presentedOrder.length - 1;
            data.order_perm = presentedOrder.join("-");
            data.liking = data.response + 1; // 1 = Really Don't Like … 5 = Really Like
            data.liking_label = likingLabels[data.response];
        },
        post_trial_gap: 400,
    };

    // trial: flow DV
    const flowMeasure = {
        type: jsPsychSurveyLikert,
        questions: [
            {prompt: `During the last round of Spin the Wheel,<br>to what extent did you feel immersed and engaged in what you were doing?`,
            name: `flow`,
            labels: ['0<br>A little', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10<br>Extremely']},
        ],
        randomize_question_order: false,
        scale_width: 600,
        data: {
            spinner_type: jsPsych.timelineVariable('spinner_type'),
        },
        on_finish: function(data) {
            data.round = round;
            data.order = presentedOrder.length - 1;
            data.order_perm = presentedOrder.join("-");
            let scoreArray = jsPsych.data.get().select('score').values;
            let outcomesArray = jsPsych.data.get().select('outcomes').values;
            data.score = scoreArray[scoreArray.length - 1];
            data.outcomes = outcomesArray[outcomesArray.length - 1];
            saveSurveyData(data);
        }
    };

    // trial: happiness DV (clickable face scale)
    const happinessMeasure = {
        type: jsPsychHtmlButtonResponse,
        stimulus: `<div class='parent liking-prompt'>
            <p><strong>How happy are you right now?</strong></p>
        </div>`,
        choices: happinessLabels.slice(),
        button_html: happinessFaceButtons.slice(),
        margin_vertical: "8px",
        margin_horizontal: "10px",
        data: {
            spinner_type: jsPsych.timelineVariable('spinner_type'),
        },
        on_load: function() {
            const group = document.getElementById("jspsych-html-button-response-btngroup");
            if (group) group.classList.add("happiness-face-row");
        },
        on_finish: function(data) {
            data.round = round;
            data.order = presentedOrder.length - 1;
            data.order_perm = presentedOrder.join("-");
            data.happiness = data.response + 1; // 1 = Really Sad … 5 = Really Happy
            data.happiness_label = happinessLabels[data.response];
            let scoreArray = jsPsych.data.get().select('score').values;
            let outcomesArray = jsPsych.data.get().select('outcomes').values;
            // use last spin score (flowMeasure temporarily not presented)
            data.score = scoreArray[scoreArray.length - 1];
            data.outcomes = outcomesArray[outcomesArray.length - 1];
            round++;
        },
        post_trial_gap: 400,
    };

    // timeline: main task
    // NOTE: flowMeasure (immersed/engaged) temporarily hidden — keep definition above to re-enable
    p.task = {
        timeline: [spin, likingMeasure, /* flowMeasure, */ happinessMeasure],
        repetitions: 1,
        timeline_variables: wheels,
        randomize_order: true,
    };

    // bonus: choose one wheel, spin it 3 more times
    let chosenWheel = null;

    p.bonusChoice = {
        type: jsPsychHtmlButtonResponse,
        stimulus: `<div class='parent wheel-choice-prompt'>
            <p>Click the wheel you want.</p>
        </div>`,
        choices: function() {
            return presentedOrder.slice();
        },
        button_html: function() {
            return presentedOrder.map((key, i) =>
                `<button class="jspsych-btn wheel-choice-btn" type="button">` +
                `<canvas class="wheel-choice-canvas" data-wheel-idx="${i}" width="150" height="150"></canvas>` +
                `</button>`
            );
        },
        margin_vertical: "12px",
        margin_horizontal: "12px",
        data: { phase: "bonus_choice" },
        on_load: function() {
            presentedOrder.forEach((key, i) => {
                const canvas = document.querySelector(`canvas.wheel-choice-canvas[data-wheel-idx="${i}"]`);
                if (canvas) drawWheelPreview(canvas, wheelDefs[key].sectors);
            });
            const group = document.getElementById("jspsych-html-button-response-btngroup");
            if (group) group.classList.add("wheel-choice-grid");
        },
        on_finish: function(data) {
            const key = presentedOrder[data.response];
            chosenWheel = { ...wheelDefs[key] };
            data.chosen_spinner = key;
            data.order_perm = presentedOrder.join("-");
            jsPsych.data.addProperties({ chosen_spinner: key, order_perm: presentedOrder.join("-") });
        },
    };

    p.bonusSpin = {
        type: jsPsychCanvasButtonResponse,
        stimulus: function(c, spinnerData) {
            createSpinner(c, spinnerData, scoreTracker,
                chosenWheel.sectors,
                chosenWheel.spinner_type,
                chosenWheel.forced_outcomes);
        },
        canvas_size: [500, 500],
        min_spins: 3,
        max_spins: 3,
        score: function() {
            return scoreTracker;
        },
        post_trial_gap: 1000,
        data: {
            phase: "bonus",
            bonus_round: 1,
        },
        on_finish: function(data) {
            data.spinner_type = chosenWheel ? chosenWheel.spinner_type : null;
            data.chosen_spinner = chosenWheel ? chosenWheel.spinner_type : null;
            scoreTracker = data.score;
        },
    };

   /*
    *
    *   Demographics
    *
    */

    p.demographics = (function() {


        const taskComplete = {
            type: jsPsychInstructions,
            pages: html.postTask,
            show_clickable_nav: true,
            post_trial_gap: 500,
        };

        const gender = {
            type: jsPsychHtmlButtonResponse,
            stimulus: '<p>What is your gender?</p>',
            choices: ['Male', 'Female', 'Other'],
            on_finish: (data) => {
                data.gender = data.response;
            }
        };

        const age = {
            type: jsPsychSurveyText,
            questions: [{prompt: "Age:", name: "age"}],
            on_finish: (data) => {
                saveSurveyData(data); 
            },
        }; 

        const ethnicity = {
            type: jsPsychHtmlButtonResponse,
            stimulus: '<p>What is your race?</p>',
            choices: ['White / Caucasian', 'Black / African American','Asian / Pacific Islander', 'Hispanic', 'Native American', 'Other'],
            on_finish: (data) => {
                data.ethnicity = data.response;
            }
        };

        const english = {
            type: jsPsychHtmlButtonResponse,
            stimulus: '<p>Is English your native language?:</p>',
            choices: ['Yes', 'No'],
            on_finish: (data) => {
                data.english = data.response;
            }
        };  

        const finalWord = {
            type: jsPsychSurveyText,
            questions: [{prompt: "Questions? Comments? Complains? Provide your feedback here!", rows: 10, columns: 100, name: "finalWord"}],
            on_finish: (data) => {
                saveSurveyData(data); 
            },
        }; 

        const demos = {
            timeline: [taskComplete, gender, age, ethnicity, english, finalWord]
        };

        return demos;

    }());


   /*
    *
    *   SAVE DATA
    *
    */

    // CSV is downloaded locally in jsPsych on_finish (see utils.js) — no OSF/DataPipe upload

    return p;

}());

const SKIP_CONSENT = true; // set false for real runs / Prolific

const timeline = [];
if (!SKIP_CONSENT) timeline.push(exp.consent);
timeline.push(
    exp.introVideo,
    exp.happinessTraining,
    exp.thumbsTraining,
    exp.spinLearnTransition,
    exp.spinPractice,
    exp.playGameTransition,
    exp.introVideo,
    exp.intro,
    exp.facesTransition,
    exp.faceTraining,
    exp.faceCompare,
    exp.task,
    exp.chooseTransition,
    exp.bonusChoice,
    exp.bonusSpin,
    exp.outroVideo,
    exp.demographics
);

jsPsych.run(timeline);
