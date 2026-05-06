import Busboy from "busboy";

export const config = {
    api: {
        bodyParser: false
    }
};


export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Método não permitido"
        });
    }

    const chunks = [];

    const bb = Busboy({
        headers: req.headers
    });

    bb.on("file", (name, file) => {
        file.on("data", data => {
            chunks.push(data);
        });
    });

    bb.on("finish", async () => {

        const buffer = Buffer.concat(chunks);

        const formData = new FormData();

        formData.append(
            "chat_id",
            process.env.TELEGRAM_CHAT_ID
        );

        formData.append(
            "video",
            new Blob([buffer]),
            "reaction.webm"
        );

        await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendVideo`,
            {
                method: "POST",
                body: formData
            }
        );

        res.status(200).json({ success: true });
    });

    req.pipe(bb);
  }