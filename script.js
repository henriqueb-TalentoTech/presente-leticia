const config = window.APP_CONFIG;
await showImage(item.src, item.duration);


if (item.type === "video") {
    await showVideo(item.src);
}


viewerScreen.classList.remove("active");
finalScreen.classList.add("active");


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

albumButton.addEventListener("click", () => {
    window.location.href = config.GOOGLE_PHOTOS_URL;
});