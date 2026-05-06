(function () {

    const SENHA = "qwwRGSDFQR";
    const SESSAO_KEY = "_auth";

    const params = new URLSearchParams(window.location.search);
    const token = params.get("k");

    if (token === SENHA) {
        sessionStorage.setItem(SESSAO_KEY, "1");
        history.replaceState(null, "", window.location.pathname);

    } else if (!sessionStorage.getItem(SESSAO_KEY)) {
        window.location.replace("/404.html"); // ← redireciona, sem brigar com nada
    }

})();