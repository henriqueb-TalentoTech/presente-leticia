import express from "express";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

config();

import notifyHandler from "./api/notify.js";
import uploadHandler from "./api/upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");

// lê a senha direto do guard.js para não duplicar
const guardSrc = readFileSync(path.join(PUBLIC, "guard.js"), "utf8");
const [, SENHA] = guardSrc.match(/const SENHA\s*=\s*"([^"]+)"/) ?? [, ""];

const app = express();

app.use(express.static(PUBLIC));

app.get("/api/notify", notifyHandler);
app.post("/api/upload", uploadHandler);

app.use((_, res) => res.status(404).sendFile(path.join(PUBLIC, "404.html")));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`\n✅ Rodando em http://localhost:${PORT}/?k=${SENHA}`);
    console.log(`   Modo dev (sem câmera): http://localhost:${PORT}/?k=${SENHA}&dev\n`);
});