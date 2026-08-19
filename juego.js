
"use strict";

/* =========================================================
   INVASIÓN MARCIANA SUPREMA - MOTOR PRINCIPAL
========================================================= */

/* ELEMENTOS HTML */
const canvas = document.getElementById("juego");
const ctx = canvas.getContext("2d");

const menuInicio = document.getElementById("menu-inicio");
const menuPausa = document.getElementById("menu-pausa");
const menuGameOver = document.getElementById("menu-gameover");

const nickInput = document.getElementById("nick");
const selectModo = document.getElementById("select-modo");
const peerIdDisplay = document.getElementById("peer-id-display");
const salaInput = document.getElementById("sala-id");
const rankingBox = document.getElementById("ranking");

/* CONFIGURACIÓN */
const CONFIG = {
    facil: { vida: 150, danoEnemigo: 10, velocidad: 0.7, cadencia: 7 },
    normal: { vida: 100, danoEnemigo: 20, velocidad: 1, cadencia: 9 },
    dificil: { vida: 60, danoEnemigo: 35, velocidad: 1.4, cadencia: 12 }
};

const NOMBRES_JEFES = [
    "PULPO NODRIZA ALPHA",
    "KRAKEN CIBERNÉTICO",
    "DESTRUCTOR OBSIDIANA",
    "ELDER OCTOPUS",
    "EMPERADOR PULPO XENÓN"
];

/* VARIABLES GENERALES (CORREGIDAS Y COMPLETADAS) */
let usuario = "PILOTO";
let modoActual = "normal";
let puntuacion = 0;
let nivel = 1;
let nivelAnterior = 1; 
let transicionActiva = false; 
let timerTransicion = 0; 
let frames = 0;
let juegoCorriendo = false;
let pausa = false;
let esCelular = false;

/* RED PEERJS */
let peer = null;
let conexion = null;
let esHost = false;
let conectadoOnline = false;

/* DATOS DEL JUEGO */
let jugador1 = {
    x: 375, y: 500, w: 50, h: 45,
    vida: 100, maxVida: 100, vidas: 3, orbes: 0,
    activo: true, velocidadSuave: 0.20,
    disparo: "normal", timerPw: 0, nick: "P1"
};

let jugador2 = {
    x: 425, y: 500, w: 50, h: 45,
    vida: 100, maxVida: 100, vidas: 3, orbes: 0,
    activo: false, velocidadSuave: 0.20,
    disparo: "normal", timerPw: 0, nick: "P2"
};

let bJugador1 = [];
let bJugador2 = [];
let balasEnemigas = [];
let enemigos = [];
let particulas = [];
let items = [];

/* SISTEMA DE AUDIO */
const SONIDOS = {
    disparo: new Audio("sonidos/laser.mp3"),
    explosion: new Audio("sonidos/explosion.mp3"),
    danoJugador: new Audio("sonidos/dano.mp3"),
    item: new Audio("sonidos/item.mp3"),
    vidaExtra: new Audio("sonidos/vida_extra.mp3"),
    jefeAparece: new Audio("sonidos/alarma_jefe.mp3")
};

function reproducirSonido(sonido) {
    if (SONIDOS[sonido]) {
        SONIDOS[sonido].cloneNode(true).play().catch(() => {});
    }
}

/* ESTRELLAS */
const estrellas = Array.from({ length: 100 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    t: Math.random() * 2 + 1,
    v: Math.random() * 1.8 + 0.4
}));

/* CONTROL DEL JUGADOR */
const mouse = {
    x: canvas.width / 2,
    y: canvas.height - 80,
    click: false
};

if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    esCelular = true;
    document.getElementById("controles-tactiles").style.display = "flex";
}

/* RANKING */
let listaPuntajes = [];
try {
    listaPuntajes = JSON.parse(localStorage.getItem("scores_marcianos")) || [];
} catch (error) {
    listaPuntajes = [];
}

function guardarPuntuacion() {
    listaPuntajes.push({ name: usuario, pts: puntuacion, diff: modoActual, fecha: Date.now() });
    listaPuntajes.sort((a, b) => b.pts - a.pts);
    listaPuntajes = listaPuntajes.slice(0, 50);
    localStorage.setItem("scores_marcianos", JSON.stringify(listaPuntajes));
    renderRanking();
}

function renderRanking() {
    rankingBox.innerHTML = "";
    const mejores = [...listaPuntajes].sort((a, b) => b.pts - a.pts).slice(0, 5);
    if (mejores.length === 0) {
        rankingBox.innerHTML = `<div class="ranking-vacio">AÚN NO HAY PILOTOS REGISTRADOS</div>`;
        return;
    }
    mejores.forEach((r, i) => {
        const item = document.createElement("div");
        item.className = "ranking-item";
        const nombre = String(r.name || "PILOTO").replace(/[<>]/g, "");
        const dificultad = String(r.diff || "normal").toUpperCase();
        item.innerHTML = `<span>${i + 1}. ${nombre} (${dificultad})</span><span>${Number(r.pts) || 0} PTS</span>`;
        rankingBox.appendChild(item);
    });
}
renderRanking();

/* PEERJS RED */
function generarCodigoSala() {
    const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let codigo = "";
    for (let i = 0; i < 6; i++) {
        codigo += caracteres[Math.floor(Math.random() * caracteres.length)];
    }
    return codigo;
}

function inicializarRed() {
    if (typeof Peer === "undefined") {
        peerIdDisplay.textContent = "PeerJS no pudo cargarse. Modo offline.";
        return;
    }
    try {
        const codigoSala = generarCodigoSala();
        peer = new Peer(codigoSala, { debug: 1 });
        peer.on("open", (id) => { peerIdDisplay.textContent = `TU CÓDIGO DE SALA: ${id}`; });
        peer.on("connection", (conn) => {
            if (conexion) { conn.close(); return; }
            conexion = conn;
            esHost = true;
            configurarConexion(conn);
        });
        peer.on("error", (error) => {
            console.error("PeerJS:", error);
            peerIdDisplay.textContent = "Error de conexión P2P. Modo offline disponible.";
        });
        peer.on("disconnected", () => { peerIdDisplay.textContent = "Antena desconectada."; });
    } catch (error) {
        console.error(error);
        peerIdDisplay.textContent = "Modo offline local.";
    }
}
inicializarRed();

document.getElementById("btn-conectar").addEventListener("click", () => {
    const idDestino = salaInput.value.trim();
    if (!idDestino) { alert("Escribe el código de sala de tu amigo."); return; }
    if (!peer) { alert("La antena P2P todavía no está lista."); return; }
    if (conexion) { try { conexion.close(); } catch (_) {} }
    try {
        conexion = peer.connect(idDestino, { reliable: true });
        esHost = false;
        configurarConexion(conexion);
    } catch (error) {
        console.error(error);
        alert("No se pudo iniciar la conexión.");
    }
});

function configurarConexion(conn) {
    if (!conn) return;
    conn.on("open", () => {
        conectadoOnline = true;
        jugador2.activo = true;
        usuario = nickInput.value.trim().toUpperCase().slice(0, 8) || "PILOTO";
        jugador1.nick = usuario;
        conn.send({ tipo: "LOGIN", nick: usuario, modo: selectModo.value });
        if (esHost) modoActual = selectModo.value;
        reiniciarPartida();
        menuInicio.classList.add("oculto");
        menuGameOver.classList.add("oculto");
        juegoCorriendo = true;
        peerIdDisplay.textContent = esHost ? "JUGADOR CONECTADO - TÚ ERES EL HOST" : "CONECTADO AL HOST";
    });
    conn.on("data", (data) => { recibirDatosRed(data); });
    conn.on("close", () => {
        conectadoOnline = false;
        jugador2.activo = false;
        peerIdDisplay.textContent = "El otro jugador se desconectó.";
        if (!esHost && juegoCorriendo) {
            alert("El host cerró la conexión.");
            juegoCorriendo = false;
            menuGameOver.classList.remove("oculto");
        }
    });
}

function recibirDatosRed(data) {
    if (!data || !data.tipo) return;
    if (data.tipo === "LOGIN") {
        jugador2.nick = String(data.nick || "P2").slice(0, 8);
        jugador2.activo = true;
        if (esHost) enviarSincronizacion();
    }
    if (data.tipo === "INPUT_P2" && esHost) {
        jugador2.x = Number(data.x) || jugador2.x;
        jugador2.y = Number(data.y) || jugador2.y;
        jugador2.vida = Math.max(0, Math.min(jugador2.maxVida, Number(data.vida)));
        if (data.disparo) dispararJugador2();
    }
    if (data.tipo === "PAUSA") {
        pausa = Boolean(data.valor);
        menuPausa.classList.toggle("oculto", !pausa);
    }
    if (data.tipo === "SYNC_HOST" && !esHost) {
        modoActual = data.modo || modoActual;
        puntuacion = Number(data.puntos) || 0;
        nivel = Number(data.nivel) || 1;
        juegoCorriendo = Boolean(data.corriendo);
        if (data.host) {
            jugador2.x = Number(data.host.x); jugador2.y = Number(data.host.y);
            jugador2.vida = Number(data.host.vida); jugador2.maxVida = Number(data.host.maxVida);
            jugador2.nick = data.host.nick || "HOST"; jugador2.activo = true;
        }
        if (data.self) {
            jugador1.x = Number(data.self.x); jugador1.y = Number(data.self.y);
            jugador1.vida = Number(data.self.vida); jugador1.maxVida = Number(data.self.maxVida);
        }
        enemigos = Array.isArray(data.enemigos) ? data.enemigos : [];
        balasEnemigas = Array.isArray(data.balasE) ? data.balasE : [];
        items = Array.isArray(data.items) ? data.items : [];
        if (!juegoCorriendo) mostrarPantallaGameOver();
    }
}

function enviarSincronizacion() {
    if (!conexion || !esHost || !conexion.open) return;
    try {
        conexion.send({
            tipo: "SYNC_HOST", modo: modoActual, puntos: puntuacion, nivel: nivel,
            corriendo: juegoCorriendo,
            host: { x: jugador1.x, y: jugador1.y, vida: jugador1.vida, maxVida: jugador1.maxVida, nick: jugador1.nick },
            self: { x: jugador2.x, y: jugador2.y, vida: jugador2.vida, maxVida: jugador2.maxVida },
            enemigos: enemigos, balasE: balasEnemigas, items: items
        });
    } catch (error) { console.warn("No se pudo sincronizar:", error); }
}

document.getElementById("btn-solo").addEventListener("click", () => {
    usuario = nickInput.value.trim().toUpperCase().slice(0, 8) || "PILOTO";
    jugador1.nick = usuario;
    modoActual = selectModo.value;
    conectadoOnline = false;
    jugador2.activo = false;
    reiniciarPartida();
    menuInicio.classList.add("oculto");
    menuGameOver.classList.add("oculto");
    juegoCorriendo = true;
});

function reiniciarPartida() {
    const cfg = CONFIG[modoActual] || CONFIG.normal;
    puntuacion = 0;
    nivel = 1;
    nivelAnterior = 1;
    transicionActiva = false;
    timerTransicion = 0;
    frames = 0;
    pausa = false;

    jugador1.maxVida = cfg.vida; jugador1.vida = cfg.vida;
    jugador1.x = canvas.width / 2 - jugador1.w / 2; jugador1.y = canvas.height - 100;
    jugador1.disparo = "normal"; jugador1.timerPw = 0; jugador1.vidas = 3; jugador1.orbes = 0;

    jugador2.maxVida = cfg.vida; jugador2.vida = cfg.vida;
    jugador2.x = canvas.width / 2 + 50; jugador2.y = canvas.height - 100;
    jugador2.vidas = 3; jugador2.orbes = 0;

    bJugador1 = []; bJugador2 = []; balasEnemigas = []; enemigos = []; particulas = []; items = [];
}

function conmutarPausa() {
    if (!juegoCorriendo) return;
    pausa = !pausa;
    menuPausa.classList.toggle("oculto", !pausa);
    if (conexion && conexion.open) {
        try { conexion.send({ tipo: "PAUSA", valor: pausa }); } catch (_) {}
    }
}

document.getElementById("btn-reanudar").addEventListener("click", conmutarPausa);
document.getElementById("btn-pausa-tactil").addEventListener("touchstart", (e) => { e.preventDefault(); conmutarPausa(); }, { passive: false });
window.addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "p" || e.key === "Escape") conmutarPausa(); });

document.getElementById("btn-reiniciar-go").addEventListener("click", () => {
    menuGameOver.classList.add("oculto");
    menuInicio.classList.remove("oculto");
    juegoCorriendo = false;
    pausa = false;
    if (conexion) { try { conexion.close(); } catch (_) {} }
    conexion = null; conectadoOnline = false; jugador2.activo = false;
});

/* MOUSE & TOUCH */
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
canvas.addEventListener("mousedown", () => { mouse.click = true; });
window.addEventListener("mouseup", () => { mouse.click = false; });

const padTactil = document.getElementById("pad-tactil");
padTactil.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    mouse.x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (touch.clientY - rect.top) * (canvas.height / rect.height);
    mouse.click = true;
}, { passive: false });
padTactil.addEventListener("touchstart", (e) => { e.preventDefault(); mouse.click = true; }, { passive: false });
padTactil.addEventListener("touchend", () => { mouse.click = false; });

function hayColision(a, b) {
    const aw = a.w !== undefined ? a.w : 5;
    const ah = a.h !== undefined ? a.h : 15;
    return (a.x < b.x + b.w && a.x + aw > b.x && a.y < b.y + b.h && a.y + ah > b.y);
}

function FX_Explosion(x, y, color, cantidad = 25, radioMax = 4) {
    for (let i = 0; i < cantidad; i++) {
        particulas.push({
            x, y,
            vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
            r: Math.random() * radioMax + 1, col: color, alpha: 1, deg: Math.random() * 0.025 + 0.015
        });
    }
}

function dibujarPulpoMarciano(context, x, y, w, h, color, frame) {
    context.save();
    context.fillStyle = color;
    context.shadowBlur = 10;
    context.shadowColor = color;

    context.beginPath();
    context.arc(x + w / 2, y + h * 0.32, w / 2, Math.PI, 0);
    context.lineTo(x + w, y + h * 0.6);
    context.lineTo(x, y + h * 0.6);
    context.closePath();
    context.fill();

    context.shadowBlur = 0;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(x + w * 0.3, y + h * 0.3, 4, 0, Math.PI * 2);
    context.arc(x + w * 0.7, y + h * 0.3, 4, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#000000";
    context.beginPath();
    context.arc(x + w * 0.3, y + h * 0.3, 1.5, 0, Math.PI * 2);
    context.arc(x + w * 0.7, y + h * 0.3, 1.5, 0, Math.PI * 2);
    context.fill();

    const osc = Math.sin(frame * 0.1) * 5;
    context.strokeStyle = color;
    context.lineWidth = 3;
    for (let i = 0; i <= 3; i++) {
        const offX = (w / 3) * i;
        context.beginPath();
        context.moveTo(x + offX, y + h * 0.6);
        context.quadraticCurveTo(x + offX + osc, y + h * 0.8, x + offX + (i - 1.5) * 4, y + h);
        context.stroke();
    }
    context.restore();
}

function dibujarNaveJugador(context, x, y, color) {
    context.save();
    context.fillStyle = Math.random() > 0.5 ? "#00ffff" : "#0055ff";
    context.fillRect(x + 8, y + 40, 6, Math.random() * 12 + 4);
    context.fillRect(x + 36, y + 40, 6, Math.random() * 12 + 4);

    context.fillStyle = color;
    context.shadowBlur = 10;
    context.shadowColor = color;
    context.beginPath();
    context.moveTo(x + 25, y);
    context.lineTo(x, y + 38);
    context.lineTo(x + 12, y + 38);
    context.lineTo(x + 25, y + 28);
    context.lineTo(x + 38, y + 38);
    context.lineTo(x + 50, y + 38);
    context.closePath();
    context.fill();

    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(x + 25, y + 18, 3, 0, Math.PI * 2);
    context.fill();
    context.restore();
}

function dispararJugador1() { 
    reproducirSonido("disparo");  
    bJugador1.push({ x: jugador1.x + jugador1.w / 2 - 2, y: jugador1.y, vx: 0, vy: -12, dmg: 1 });
    if (jugador1.disparo === "triple") {
        bJugador1.push({ x: jugador1.x, y: jugador1.y + 10, vx: -3, vy: -11, dmg: 1 });
        bJugador1.push({ x: jugador1.x + jugador1.w - 4, y: jugador1.y + 10, vx: 3, vy: -11, dmg: 1 });
    }
}

function dispararJugador2() {
    reproducirSonido("disparo");  
    if (!jugador2.activo) return;
    bJugador2.push({ x: jugador2.x + jugador2.w / 2 - 2, y: jugador2.y, vx: 0, vy: -12, dmg: 1 });
    if (jugador2.disparo === "triple") {
        bJugador2.push({ x: jugador2.x, y: jugador2.y + 10, vx: -3, vy: -11, dmg: 1 });
        bJugador2.push({ x: jugador2.x + jugador2.w - 4, y: jugador2.y + 10, vx: 3, vy: -11, dmg: 1 });
    }
}

function crearEnemigo(cfg) {
    if (enemigos.some(e => e.esBoss)) return;
    const tipo = Math.random() > 0.5 ? "pulpo" : "cruzador";
    const velocidadNivel = Math.max(0.5, nivel * 0.3);
    enemigos.push({
        x: Math.random() * (canvas.width - 50), y: -50, w: 40, h: 40,
        vx: (Math.random() - 0.5) * 5 * cfg.velocidad * velocidadNivel,
        vy: (Math.random() * 2 + 1) * cfg.velocidad * velocidadNivel,
        col: tipo === "pulpo" ? "#9900ff" : "#00ff55",
        vida: nivel, maxVida: nivel, esBoss: false, tipo,
        recarga: Math.floor(Math.random() * 60)
    });
}

function crearJefe(cfg) {
    if (enemigos.some(e => e.esBoss)) return;
    const vidaJefe = 15 + nivel * 15;
    enemigos.push({
        x: 300, y: -100, w: 160, h: 100,
        vx: 3.5 * cfg.velocidad, vy: 1,
        col: "#ff3300", vida: vidaJefe, maxVida: vidaJefe, esBoss: true,
        fase: nivel, recarga: 0
    });
}

function procesarImpactoBalas(enemigo, listaBalas, indiceEnemigo) {
    for (let j = listaBalas.length - 1; j >= 0; j--) {
        const bala = listaBalas[j];
        if (hayColision(bala, enemigo)) {
            enemigo.vida -= bala.dmg || 1;
            FX_Explosion(bala.x, bala.y, "#ffffff", 5, 2);
            listaBalas.splice(j, 1);

            if (enemigo.vida <= 0) {
                reproducirSonido("explosion");
                FX_Explosion(enemigo.x + enemigo.w / 2, enemigo.y + enemigo.h / 2, enemigo.col, enemigo.esBoss ? 70 : 25, enemigo.esBoss ? 7 : 3);
                puntuacion += enemigo.esBoss ? 100 : 15;

                if (Math.random() < 0.35) {
                    let tipoItem = "orbe";
                    let colorItem = "#00ffcc";
                    let chanceEspecial = Math.random();
                    if (chanceEspecial < 0.15) { tipoItem = "triple"; colorItem = "#ff00ff"; }
                    else if (chanceEspecial < 0.30) { tipoItem = "bomba"; colorItem = "#ffaa00"; }

                    items.push({ x: enemigo.x, y: enemigo.y, w: 20, h: 20, tipo: tipoItem, col: colorItem });
                }
                enemigos.splice(indiceEnemigo, 1);
                return true;
            }
        }
    }
    return false;
}

function actualizarEnemigos() {
    const cfg = CONFIG[modoActual] || CONFIG.normal;
    nivel = Math.min(5, Math.floor(puntuacion / 200) + 1);

    if (nivel > nivelAnterior) {
        nivelAnterior = nivel;
        transicionActiva = true;
        timerTransicion = 180;
        enemigos = [];
        balasEnemigas = [];
        if (nivel === 5) reproducirSonido("jefeAparece");
    }

    if (transicionActiva) {
        timerTransicion--;
        if (timerTransicion <= 0) transicionActiva = false;
        return;
    }

    const frecuenciaSpawn = Math.max(15, 60 - nivel * 8);
    if (frames % frecuenciaSpawn === 0) crearEnemigo(cfg);

    const jefeMeta = nivel * 200 - 30;
    if (puntuacion >= jefeMeta && !enemigos.some(e => e.esBoss)) crearJefe(cfg);

    for (let i = enemigos.length - 1; i >= 0; i--) {
        const enemigo = enemigos[i];
        enemigo.x += enemigo.vx;
        enemigo.y += enemigo.vy;

        if (enemigo.x < 0 || enemigo.x > canvas.width - enemigo.w) enemigo.vx *= -1;
        if (enemigo.esBoss && (enemigo.y > 140 || enemigo.y < 20)) enemigo.vy *= -1;
        if (!enemigo.esBoss && enemigo.tipo === "cruzador" && (enemigo.y > 300 || enemigo.y < -50)) enemigo.vy *= -1;

        enemigo.recarga++;

        if (!enemigo.esBoss && enemigo.tipo === "pulpo" && enemigo.recarga % 80 === 0) {
            balasEnemigas.push({ x: enemigo.x + enemigo.w / 2, y: enemigo.y + enemigo.h, vx: 0, vy: 5 * cfg.velocidad });
        }

        if (enemigo.esBoss && enemigo.recarga % 40 === 0) {
            if (enemigo.fase >= 2) {
                balasEnemigas.push({ x: enemigo.x + enemigo.w / 2, y: enemigo.y + enemigo.h, vx: -2.5, vy: 5 });
                balasEnemigas.push({ x: enemigo.x + enemigo.w / 2, y: enemigo.y + enemigo.h, vx: 2.5, vy: 5 });
            }
            balasEnemigas.push({ x: enemigo.x + enemigo.w / 2, y: enemigo.y + enemigo.h, vx: 0, vy: 6 * cfg.velocidad });
        }

        if (procesarImpactoBalas(enemigo, bJugador1, i)) continue;
        if (!enemigos[i]) continue;
        if (procesarImpactoBalas(enemigo, bJugador2, i)) continue;
        if (!enemigos[i]) continue;

        if (!enemigo.esBoss && enemigo.y > canvas.height) {
            enemigos.splice(i, 1);
            continue;
        }

        procesarColisionJugador(enemigo, jugador1, i, cfg);
        if (enemigos[i] && jugador2.activo) procesarColisionJugador(enemigo, jugador2, i, cfg);
    }
}

function procesarColisionJugador(enemigo, jugador, indice, cfg) {
    if (!jugador.activo || jugador.vida <= 0) return;

    if (hayColision(enemigo, jugador)) {
        reproducirSonido("danoJugador");
        jugador.vida -= enemigo.esBoss ? 50 : cfg.danoEnemigo;

        if (jugador.vida <= 0) {
            jugador.vidas--;
            if (jugador.vidas > 0) {
                jugador.vida = jugador.maxVida;
                FX_Explosion(jugador.x + jugador.w / 2, jugador.y + jugador.h / 2, "#ff0000", 30, 4);
            } else {
                jugador.vida = 0;
            }
        }

        FX_Explosion(enemigo.x + enemigo.w / 2, enemigo.y + enemigo.h / 2, enemigo.col, 15);
        if (!enemigo.esBoss && enemigos[indice]) enemigos.splice(indice, 1);
    }
}

function actualizarBalas() {
    for (let i = bJugador1.length - 1; i >= 0; i--) {
        bJugador1[i].x += bJugador1[i].vx;
        bJugador1[i].y += bJugador1[i].vy;
        if (bJugador1[i].y < -30 || bJugador1[i].x < -30 || bJugador1[i].x > canvas.width + 30) bJugador1.splice(i, 1);
    }

    for (let i = bJugador2.length - 1; i >= 0; i--) {
        bJugador2[i].x += bJugador2[i].vx;
        bJugador2[i].y += bJugador2[i].vy;
        if (bJugador2[i].y < -30 || bJugador2[i].x < -30 || bJugador2[i].x > canvas.width + 30) bJugador2.splice(i, 1);
    }

    for (let i = balasEnemigas.length - 1; i >= 0; i--) {
        const bala = balasEnemigas[i];
        bala.x += bala.vx;
        bala.y += bala.vy;

        if (bala.y > canvas.height + 30 || bala.x < -30 || bala.x > canvas.width + 30) {
            balasEnemigas.splice(i, 1);
            continue;
        }

        if (procesarColisionBalaJugador(bala, jugador1)) {
            balasEnemigas.splice(i, 1);
            continue;
        }

        if (jugador2.activo && procesarColisionBalaJugador(bala, jugador2)) {
            balasEnemigas.splice(i, 1);
        }
    }
}

function procesarColisionBalaJugador(bala, jugador) {
    if (!jugador.activo || jugador.vida <= 0) return false;
    if (hayColision(bala, jugador)) {
        reproducirSonido("danoJugador");
        jugador.vida -= 15;
        jugador.vida = Math.max(0, jugador.vida);
        FX_Explosion(bala.x, bala.y, "#ffcc00", 8);
        return true;
    }
    return false;
}

function actualizarItems() {
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.y += 2;

        if (item.y > canvas.height) { items.splice(i, 1); continue; }
        if (recogerItem(item, jugador1)) { items.splice(i, 1); continue; }
        if (jugador2.activo && recogerItem(item, jugador2)) { items.splice(i, 1); }
    }
}

function recogerItem(item, jugador) {
    if (!jugador.activo || jugador.vida <= 0 || !hayColision(item, jugador)) return false;

    reproducirSonido("item");
    if (item.tipo === "triple") { jugador.disparo = "triple"; jugador.timerPw = 350; }
    if (item.tipo === "bomba") {
        enemigos.forEach(enemigo => {
            enemigo.vida -= 6;
            if (enemigo.vida <= 0) FX_Explosion(enemigo.x + enemigo.w / 2, enemigo.y + enemigo.h / 2, enemigo.col, 15);
        });
        enemigos = enemigos.filter(enemigo => enemigo.vida > 0);
        FX_Explosion(item.x, item.y, "#ffaa00", 75, 12);
    }
    if (item.tipo === "orbe") {
        jugador.orbes++;
        if (jugador.orbes >= 3) {
            jugador.vidas++;
            jugador.orbes = 0;
            reproducirSonido("vidaExtra");
            FX_Explosion(jugador.x + jugador.w / 2, jugador.y + jugador.h / 2, "#00ffcc", 40, 6);
        } else {
            FX_Explosion(item.x + item.w / 2, item.y + item.h / 2, "#ffffff", 10, 2);
        }
    }
    return true;
}

function actualizarPowerUps() {
    if (jugador1.timerPw > 0) {
        jugador1.timerPw--;
        if (jugador1.timerPw <= 0) jugador1.disparo = "normal";
    }
    if (jugador2.timerPw > 0) {
        jugador2.timerPw--;
        if (jugador2.timerPw <= 0) jugador2.disparo = "normal";
    }
}

function actualizarJugador1() {
    const objetivoX = mouse.x - jugador1.w / 2;
    const objetivoY = mouse.y - jugador1.h / 2;
    jugador1.x += (objetivoX - jugador1.x) * jugador1.velocidadSuave;
    jugador1.y += (objetivoY - jugador1.y) * jugador1.velocidadSuave;
    jugador1.x = Math.max(0, Math.min(canvas.width - jugador1.w, jugador1.x));
    jugador1.y = Math.max(0, Math.min(canvas.height - jugador1.h, jugador1.y));
}

function enviarInputCliente() {
    if (!conexion || !conexion.open || esHost || frames % 2 !== 0) return;
    try {
        conexion.send({
            tipo: "INPUT_P2", x: jugador1.x, y: jugador1.y, vida: jugador1.vida,
            disparo: mouse.click && frames % (CONFIG[modoActual]?.cadencia || 9) === 0
        });
    } catch (_) {}
}

function dibujarEstrellas() {
    ctx.fillStyle = "#ffffff";
    estrellas.forEach(estrella => {
        estrella.y += estrella.v;
        if (estrella.y > canvas.height) { estrella.y = 0; estrella.x = Math.random() * canvas.width; }
        ctx.globalAlpha = Math.min(1, estrella.t / 2);
        ctx.fillRect(estrella.x, estrella.y, estrella.t, estrella.t);
    });
    ctx.globalAlpha = 1;
}

function dibujarBalas() {
    ctx.fillStyle = "#00ffff";
    bJugador1.forEach(bala => { ctx.fillRect(bala.x, bala.y, 4, 15); });

    ctx.fillStyle = "#ff00ff";
    bJugador2.forEach(bala => { ctx.fillRect(bala.x, bala.y, 4, 15); });

    ctx.fillStyle = "#ffcc00";
    balasEnemigas.forEach(bala => { ctx.fillRect(bala.x, bala.y, 5, 12); });
}

function dibujarEnemigos() {
    enemigos.forEach(enemigo => {
        if (enemigo.esBoss) {
            ctx.save();
            ctx.fillStyle = enemigo.col;
            ctx.shadowBlur = 15;
            ctx.shadowColor = enemigo.col;
            ctx.fillRect(enemigo.x, enemigo.y, enemigo.w, enemigo.h * 0.3);
            ctx.restore();

            dibujarPulpoMarciano(ctx, enemigo.x + enemigo.w / 4, enemigo.y + enemigo.h * 0.1, enemigo.w / 2, enemigo.h * 0.9, enemigo.col, frames);

            ctx.fillStyle = "#ffffff";
            ctx.font = "11px Courier New";
            ctx.textAlign = "center";
            ctx.fillText(NOMBRES_JEFES[Math.max(0, Math.min(4, nivel - 1))], enemigo.x + enemigo.w / 2, enemigo.y - 22);

            ctx.fillStyle = "rgba(255,255,255,0.1)";
            ctx.fillRect(enemigo.x, enemigo.y - 14, enemigo.w, 6);
            ctx.fillStyle = "#ff0000";
            ctx.fillRect(enemigo.x, enemigo.y - 14, enemigo.w * Math.max(0, enemigo.vida / enemigo.maxVida), 6);
        } else {
            dibujarPulpoMarciano(ctx, enemigo.x, enemigo.y, enemigo.w, enemigo.h, enemigo.col, frames);
        }
    });
}

function dibujarItems() {
    items.forEach(item => {
        ctx.save();
        ctx.fillStyle = item.col;
        ctx.shadowBlur = 12;
        ctx.shadowColor = item.col;

        if (item.tipo === "orbe") {
            ctx.beginPath();
            ctx.arc(item.x + item.w / 2, item.y + item.h / 2, item.w / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(item.x, item.y, item.w, item.h);
        }
        ctx.restore();

        ctx.fillStyle = "#000000";
        ctx.font = "bold 12px Courier New";
        ctx.textAlign = "center";
        let texto = "";
        if (item.tipo === "triple") texto = "3";
        else if (item.tipo === "bomba") texto = "B";
        ctx.fillText(texto, item.x + item.w / 2, item.y + 14);
    });
}

function dibujarParticulas() {
    for (let i = particulas.length - 1; i >= 0; i--) {
        const p = particulas[i];
        p.x += p.vx; p.y += p.vy; p.alpha -= p.deg;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        if (p.alpha <= 0) particulas.splice(i, 1);
    }
    ctx.globalAlpha = 1;
}

function dibujarHUD() {
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Courier New";
    ctx.fillText(`PILOTO: ${jugador1.nick}`, 20, 25);

    ctx.fillStyle = "#00ffcc";
    ctx.fillText(`SCORE: ${puntuacion} | FASE: ${nivel}/5`, 20, 45);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(`VIDAS: ${jugador1.vidas} | ORBES: ${jugador1.orbes}/3`, 20, 65);

    /* Vida Jugador 1 */
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(canvas.width - 180, 20, 160, 14);
    const pct1 = Math.max(0, jugador1.vida / jugador1.maxVida);
    ctx.fillStyle = pct1 > 0.4 ? "#00ffcc" : "#ff3300";
    ctx.fillRect(canvas.width - 180, 20, 160 * pct1, 14);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(canvas.width - 180, 20, 160, 14);

    if (jugador2.activo) {
        ctx.fillStyle = "#ff00ff";
        ctx.fillText(`CO-PILOTO: ${jugador2.nick}`, 20, 95);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`VIDAS: ${jugador2.vidas} | ORBES: ${jugador2.orbes}/3`, 20, 115);

        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(canvas.width - 180, 95, 160, 14);
        const pct2 = Math.max(0, jugador2.vida / jugador2.maxVida);
        ctx.fillStyle = "#ff00ff";
        ctx.fillRect(canvas.width - 180, 95, 160 * pct2, 14);
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(canvas.width - 180, 95, 160, 14);
    }

    if (conectadoOnline) {
        ctx.fillStyle = "#00ff88";
        ctx.font = "11px Courier New";
        ctx.fillText(esHost ? "● HOST P2P" : "● CLIENTE P2P", 20, canvas.height - 18);
    }

    if (transicionActiva) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#00ffcc";
        ctx.font = "bold 32px Courier New";
        ctx.textAlign = "center";
        ctx.fillText(`¡NIVEL ${nivel} ALCANZADO!`, canvas.width / 2, canvas.height / 2);
        ctx.font = "16px Courier New";
        ctx.fillText(nivel === 5 ? "¡PREPÁRATE PARA EL JEFE FINAL!" : "Sistemas enemigos detectados...", canvas.width / 2, canvas.height / 2 + 35);
    }
}

function mostrarPantallaGameOver() {
    const detalles = document.getElementById("go-detalles");
    detalles.innerHTML = `Piloto: ${jugador1.nick}<br>Score obtenido: ${puntuacion} PTS<br>Modo: ${modoActual.toUpperCase()}<br>Nivel alcanzado: ${nivel}/5`;
    menuGameOver.classList.remove("oculto");
}

function finalizarJuego() {
    if (!juegoCorriendo) return;
    juegoCorriendo = false;
    guardarPuntuacion();
    mostrarPantallaGameOver();
    if (conexion && esHost && conexion.open) enviarSincronizacion();
}

function dibujar() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dibujarEstrellas();
    dibujarEnemigos();
    dibujarItems();
    dibujarBalas();

    if (jugador1.vida > 0) dibujarNaveJugador(ctx, jugador1.x, jugador1.y, "#00ffcc");
    if (jugador2.activo && jugador2.vida > 0) dibujarNaveJugador(ctx, jugador2.x, jugador2.y, "#ff00ff");

    dibujarParticulas();
    dibujarHUD();
}

function loop() {
    requestAnimationFrame(loop);

    if (!juegoCorriendo || pausa) {
        dibujar();
        return;
    }

    frames++;
    actualizarJugador1();
    enviarInputCliente();

    if (mouse.click && jugador1.vida > 0) {
        const cfg = CONFIG[modoActual] || CONFIG.normal;
        if (frames % cfg.cadencia === 0) dispararJugador1();
    }

    if (!conectadoOnline || esHost) {
        actualizarEnemigos();
        actualizarBalas();
        actualizarItems();
        actualizarPowerUps();

        const j1Muerto = jugador1.vida <= 0 && jugador1.vidas <= 0;
        const j2Muerto = jugador2.activo && jugador2.vida <= 0 && jugador2.vidas <= 0;

        if (j1Muerto && (!jugador2.activo || j2Muerto)) {
            finalizarJuego();
        }

        if (conectadoOnline && esHost && frames % 5 === 0) {
            enviarSincronizacion();
        }
    } else {
        actualizarBalas();
        actualizarPowerUps();
    }

    dibujar();
}

dibujar();
requestAnimationFrame(loop);