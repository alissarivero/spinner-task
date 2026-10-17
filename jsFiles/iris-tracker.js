// Face Landmarker (MediaPipe Iris successor) on WebGazer's existing webcam.
// Fail open: if WASM/model/video is missing, the experiment continues without iris rows.
// Runtime is vendored (@mediapipe/tasks-vision 0.10.21) so sessions do not depend on a CDN.
// Assigned to window because exp.js/utils.js feature-test window.SpinnerIris.
window.SpinnerIris = (() => {
    const WASM_ROOT = "./jsFiles/mediapipe/wasm";
    const MODEL_PATH = "./jsFiles/models/face_landmarker.task";
    const VIDEO_ID = "webgazerVideoFeed";
    const IRIS_MM = 11.7;
    // fallback throttle when requestVideoFrameCallback is unavailable
    const MIN_INTERVAL_MS = 33;

    // subject's right / left (MediaPipe names, not the viewer's)
    const RIGHT_IRIS = [468, 469, 470, 471, 472];
    const LEFT_IRIS = [473, 474, 475, 476, 477];
    const RIGHT_EAR = { outer: 33, inner: 133, topA: 159, botA: 145, topB: 158, botB: 153 };
    const LEFT_EAR = { outer: 263, inner: 362, topA: 386, botA: 374, topB: 385, botB: 380 };

    let landmarker = null;
    let initPromise = null;
    let rafId = 0;
    let vfcId = 0;
    let vfcVideo = null;
    let lastDetectAt = 0;
    let lastMediaTime = -1;
    let stopped = false;
    let recording = false;
    let trialStart = 0;
    let buffer = [];
    let pupilCanvas = null;
    let pupilCtx = null;
    let videoEl = null;

    const round = (value, digits) => {
        if (value == null || !Number.isFinite(value)) return null;
        const f = Math.pow(10, digits);
        return Math.round(value * f) / f;
    };

    const video = () => videoEl || document.getElementById(VIDEO_ID);

    const px = (lm, i, w, h) => {
        const p = lm[i];
        if (!p) return null;
        return { x: p.x * w, y: p.y * h };
    };

    const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null);

    const ear = (lm, idx, w, h) => {
        const outer = px(lm, idx.outer, w, h);
        const inner = px(lm, idx.inner, w, h);
        const horiz = dist(outer, inner);
        if (!horiz) return null;
        const v1 = dist(px(lm, idx.topA, w, h), px(lm, idx.botA, w, h));
        const v2 = dist(px(lm, idx.topB, w, h), px(lm, idx.botB, w, h));
        if (v1 == null || v2 == null) return null;
        return (v1 + v2) / (2 * horiz);
    };

    const irisDiameter = (lm, ids, w, h) => {
        const ring = ids.slice(1).map((i) => px(lm, i, w, h));
        if (ring.some((p) => !p)) return null;
        return (dist(ring[0], ring[2]) + dist(ring[1], ring[3])) / 2;
    };

    const blend = (result, name) => {
        const cats = result.faceBlendshapes && result.faceBlendshapes[0] && result.faceBlendshapes[0].categories;
        if (!cats) return null;
        for (let i = 0; i < cats.length; i++) {
            if (cats[i].categoryName === name) return cats[i].score;
        }
        return null;
    };

    const pupilDiameterPx = (vid, cx, cy, irisD) => {
        if (!vid || !irisD || irisD < 6 || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
        const size = Math.max(16, Math.min(64, Math.round(irisD * 1.2)));
        const sx = Math.round(cx - size / 2);
        const sy = Math.round(cy - size / 2);
        if (sx < 0 || sy < 0 || sx + size > vid.videoWidth || sy + size > vid.videoHeight) return null;
        if (!pupilCanvas) {
            pupilCanvas = document.createElement("canvas");
            pupilCtx = pupilCanvas.getContext("2d", { willReadFrequently: true });
        }
        if (pupilCanvas.width !== size) {
            pupilCanvas.width = size;
            pupilCanvas.height = size;
        }
        try {
            pupilCtx.drawImage(vid, sx, sy, size, size, 0, 0, size, size);
        } catch (_) {
            return null;
        }
        const img = pupilCtx.getImageData(0, 0, size, size).data;
        let sum = 0;
        const n = size * size;
        const lum = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const o = i * 4;
            const y = 0.299 * img[o] + 0.587 * img[o + 1] + 0.114 * img[o + 2];
            lum[i] = y;
            sum += y;
        }
        const thresh = (sum / n) * 0.55;
        let dark = 0;
        for (let i = 0; i < n; i++) if (lum[i] < thresh) dark++;
        if (dark < 4) return null;
        return 2 * Math.sqrt(dark / Math.PI);
    };

    const sampleFrom = (result, vid) => {
        const w = vid.videoWidth;
        const h = vid.videoHeight;
        const lm = result.faceLandmarks && result.faceLandmarks[0];
        if (!lm || !w || !h) {
            return { face_ok: 0 };
        }
        const irisR = irisDiameter(lm, RIGHT_IRIS, w, h);
        const irisL = irisDiameter(lm, LEFT_IRIS, w, h);
        const irisMean = [irisR, irisL].filter((d) => d > 0);
        // relative head distance: image width stands in for the unknown focal length,
        // so this tracks leaning in/out within a session, not millimetres
        const headDist = irisMean.length
            ? (w * IRIS_MM) / (irisMean.reduce((a, b) => a + b, 0) / irisMean.length)
            : null;
        const cR = px(lm, RIGHT_IRIS[0], w, h);
        const cL = px(lm, LEFT_IRIS[0], w, h);
        const pupR = cR ? pupilDiameterPx(vid, cR.x, cR.y, irisR) : null;
        const pupL = cL ? pupilDiameterPx(vid, cL.x, cL.y, irisL) : null;
        return {
            face_ok: 1,
            blink_l: round(blend(result, "eyeBlinkLeft"), 4),
            blink_r: round(blend(result, "eyeBlinkRight"), 4),
            ear_l: round(ear(lm, LEFT_EAR, w, h), 4),
            ear_r: round(ear(lm, RIGHT_EAR, w, h), 4),
            iris_d_px_l: round(irisL, 2),
            iris_d_px_r: round(irisR, 2),
            head_dist_rel: round(headDist, 1),
            pupil_d_px_l: round(pupL, 2),
            pupil_d_px_r: round(pupR, 2),
            pupil_iris_l: irisL ? round(pupL / irisL, 4) : null,
            pupil_iris_r: irisR ? round(pupR / irisR, 4) : null,
        };
    };

    const detect = (vid, now) => {
        if (!recording || !landmarker || !vid || vid.readyState < 2) return;
        // frames presented before beginTrial belong to the previous screen
        if (now < trialStart) return;
        // detectForVideo needs strictly increasing timestamps
        if (now <= lastDetectAt) return;
        lastDetectAt = now;
        let result;
        try {
            result = landmarker.detectForVideo(vid, now);
        } catch (err) {
            console.warn("Face Landmarker detect failed", err);
            return;
        }
        const row = sampleFrom(result, vid);
        row.t = Math.round(now - trialStart);
        buffer.push(row);
    };

    // one detection per new camera frame
    const onVideoFrame = (now, metadata) => {
        if (stopped) return;
        const vid = vfcVideo;
        vfcId = vid.requestVideoFrameCallback(onVideoFrame);
        const mediaTime = metadata && Number.isFinite(metadata.mediaTime) ? metadata.mediaTime : null;
        if (mediaTime == null || mediaTime !== lastMediaTime) {
            lastMediaTime = mediaTime == null ? lastMediaTime : mediaTime;
            detect(vid, now);
        }
    };

    const rafLoop = () => {
        if (stopped) return;
        rafId = requestAnimationFrame(rafLoop);
        const now = performance.now();
        if (now - lastDetectAt < MIN_INTERVAL_MS) return;
        try {
            detect(video(), now);
        } catch (err) {
            console.warn("Face Landmarker sample failed", err);
        }
    };

    const startSampling = () => {
        const vid = video();
        stopped = false;
        if (vid && typeof vid.requestVideoFrameCallback === "function") {
            if (!vfcId) {
                vfcVideo = vid;
                vfcId = vid.requestVideoFrameCallback(onVideoFrame);
            }
        } else if (!rafId) {
            rafId = requestAnimationFrame(rafLoop);
        }
    };

    const createLandmarker = async (vision, delegate) => {
        const { FaceLandmarker } = window.mpFaceLandmarker;
        return FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_PATH, delegate },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1,
        });
    };

    const waitForMp = () => new Promise((resolve, reject) => {
        if (window.mpFaceLandmarker) return resolve();
        let n = 0;
        const id = setInterval(() => {
            n += 1;
            if (window.mpFaceLandmarker) {
                clearInterval(id);
                resolve();
            } else if (n > 80) {
                clearInterval(id);
                reject(new Error("MediaPipe tasks-vision did not load"));
            }
        }, 100);
    });

    const init = () => {
        if (initPromise) return initPromise;
        initPromise = (async () => {
            await waitForMp();
            const { FilesetResolver } = window.mpFaceLandmarker;
            const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
            try {
                landmarker = await createLandmarker(vision, "GPU");
            } catch (err) {
                console.warn("Face Landmarker GPU failed, trying CPU", err);
                landmarker = await createLandmarker(vision, "CPU");
            }
            videoEl = document.getElementById(VIDEO_ID);
            startSampling();
        })().catch((err) => {
            console.warn("Face Landmarker unavailable; continuing without iris samples", err);
            landmarker = null;
            initPromise = null;
        });
        return initPromise;
    };

    const beginTrial = () => {
        init();
        buffer = [];
        trialStart = performance.now();
        recording = true;
    };

    const endTrial = () => {
        recording = false;
        const out = buffer;
        buffer = [];
        return out;
    };

    const pause = () => {
        recording = false;
        stopped = true;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        if (vfcId && vfcVideo && typeof vfcVideo.cancelVideoFrameCallback === "function") {
            vfcVideo.cancelVideoFrameCallback(vfcId);
        }
        vfcId = 0;
        vfcVideo = null;
        if (landmarker && typeof landmarker.close === "function") {
            try { landmarker.close(); } catch (_) { /* already closed */ }
        }
        landmarker = null;
        initPromise = null;
    };

    return { init, beginTrial, endTrial, pause };
})();
