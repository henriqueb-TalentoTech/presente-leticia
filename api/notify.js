const EVENTOS = {
    abriu: "👀 Ela abriu o site agora! Fique de olho.",
    terminou: "✅ Gravação encerrada e enviada. Pode excluir o site!"
};

export default async function handler(req, res) {

    const texto = EVENTOS[req.query.e];

    if (!texto) {
        return res.status(400).json({ error: "evento inválido" });
    }

    await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text: texto
            })
        }
    );

    res.status(200).json({ ok: true });
}