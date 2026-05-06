(function () {

    const SENHA = "qwwRGSDFQR";
    const SESSAO_KEY = "_auth";

    const params = new URLSearchParams(window.location.search);
    const token = params.get("k");

    if (token === SENHA) {
        // Senha correta → limpa a URL e marca a sessão
        sessionStorage.setItem(SESSAO_KEY, "1");
        history.replaceState(null, "", window.location.pathname);

    } else if (!sessionStorage.getItem(SESSAO_KEY)) {
        // Sem senha e sem sessão ativa → 404 genérico
        document.documentElement.innerHTML = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8" />
                <title>404 Not Found</title>
                <style>
                    body { margin: 0; background: #fff; font-family: monospace; }
                    .wrap { padding: 48px 32px; }
                    h1 { font-size: 1rem; font-weight: normal; color: #333; }
                    p  { font-size: 0.85rem; color: #999; margin-top: 8px; }
                </style>
            </head>
            <body>
                <div class="wrap">
                    <h1>404 Not Found</h1>
                    <p>The requested URL was not found on this server.</p>
                </div>
            </body>
            </html>
        `;
    }
    // else: sessionStorage válido, URL já limpa → deixa carregar normalmente

})();