const socket = io();
let miColor = null;
socket.on("esperando", () => {
    document.getElementById("estado").textContent = "Esperando rival...";
});
socket.on("inicio", data => {
    miColor = data.color;

    estado = data.estado.tablero;
    turno = data.estado.turno === "b" ? "blanco" : "negro";
    movimientos = data.estado.historial;

    dibujarTablero();
    dibujarHistorial();
    actualizarVistaReloj();
});
let ultimoMovimiento = null;
socket.on("estado", data => {
    estado = data.tablero;
    turno = data.turno === "b" ? "blanco" : "negro";
    ultimoMovimiento = data.ultimoMovimiento;
    
    // Sincronizar el historial para que aparezca en el panel lateral
    movimientos = data.historial; 

    tiempoBlanco = data.tiempoBlanco;
    tiempoNegro = data.tiempoNegro;

    dibujarTablero();
    dibujarHistorial();
    actualizarVistaReloj();
});

const tablero = document.getElementById("tablero");
const turnoTexto = document.getElementById("turno");
const estadoTexto = document.getElementById("estado");
const peonesID = {};
let animando = false;
let tiempoBlanco = 10 * 60; // 10 minutos
let tiempoNegro = 10 * 60;
let intervaloReloj = null;
const historialDiv = document.getElementById("historial");
const nombresPiezas = {
    p: "Pawn",
    t: "Tower",
    a: "Knight",
    c: "Bishop",
    r: "Queen",
    k: "King"
};

let movimientos = [];
let numeroMovimiento = 1;
let contador50 = 0;
let seleccion = null;
let movimientosValidos = [];
let movido = {
    kb: false,
    kn: false,
    tb0: false, // torre blanca izquierda
    tb7: false, // torre blanca derecha
    tn0: false, // torre negra izquierda
    tn7: false  // torre negra derecha
};

const piezas = {
    "pb": "♙", "pn": "♟",
    "tb": "♖", "tn": "♜",
    "ab": "♗", "an": "♝",
    "cb": "♘", "cn": "♞",
    "rb": "♕", "rn": "♛",
    "kb": "♔", "kn": "♚"
};

let estado = [
    ["tn","an","cn","rn","kn","cn","an","tn"],
    ["pn","pn","pn","pn","pn","pn","pn","pn"],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ["pb","pb","pb","pb","pb","pb","pb","pb"],
    ["tb","ab","cb","rb","kb","cb","ab","tb"]
];

function dibujarTablero() {
    tablero.innerHTML = "";

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {

            const celda = document.createElement("div");
            celda.classList.add("celda");

            if ((x + y) % 2 === 0) celda.classList.add("blanca");
            else celda.classList.add("negra");

            celda.dataset.x = x;
            celda.dataset.y = y;

            const pieza = estado[y][x];
            if (pieza) {
                const span = document.createElement("span");
                span.textContent = piezas[pieza];
                span.classList.add(pieza.endsWith("b") ? "pieza-blanca" : "pieza-negra");
                celda.appendChild(span);
            }
            celda.addEventListener("click", manejarClick);

            tablero.appendChild(celda);
        }
    }
}

dibujarTablero();
actualizarVistaReloj();
iniciarReloj();


function manejarClick(e) {
    if ((turno === "blanco" && miColor !== "b") ||
        (turno === "negro" && miColor !== "n")) {
        estadoTexto.textContent = "No es tu turno";
        return;
    }
    const x = parseInt(e.currentTarget.dataset.x);
    const y = parseInt(e.currentTarget.dataset.y);

    const pieza = estado[y][x];

    // 🔒 SI YA HAY SELECCIÓN
    if (seleccion) {
        // ✔️ Permitir mover SOLO si es movimiento válido
        if (esMovimientoValido(x, y)) {
            moverPieza(x, y);
        } else {
            // ❌ No permitir cambiar de pieza
            estadoTexto.textContent = "Debes mover la pieza seleccionada";
        }
        return;
    }

    // 🔓 NO HAY SELECCIÓN → intentar seleccionar
    if (!pieza) return;

    const colorPieza = pieza.endsWith("b") ? "blanco" : "negro";
    if (colorPieza !== turno) return;

    // Seleccionar pieza
    seleccion = { x, y, pieza };
    limpiarResaltados();
    resaltarSeleccion(x, y);

    const posibles = obtenerMovimientos(x, y, pieza);

    movimientosValidos = posibles.filter(m =>
        movimientoLegal(
            { x, y },
            { x: m.x, y: m.y },
            pieza
        )
    );

    resaltarMovimientos();
}

function numeroPeon(pieza, origenX) {
    return peonesID[pieza + origenX] ?? "";
}
function obtenerMovimientos(x, y, pieza, ignorarEnroque = false) {
    let movimientos = [];
    const esBlanco = pieza.endsWith("b");
    const enemigo = esBlanco ? "n" : "b";

    // ==========================================
    // ♟️ PEÓN (p)
    // ==========================================
    if (pieza[0] === "p") {
        const dir = esBlanco ? -1 : 1;
        const filaInicial = esBlanco ? 6 : 1;

        // Movimiento 1 paso adelante
        let ny = y + dir;
        if (estaDentro(x, ny) && estado[ny][x] === null) {
            movimientos.push({ x, y: ny });

            // Movimiento 2 pasos (desde fila inicial)
            let ny2 = y + dir * 2;
            if (y === filaInicial && estado[ny2][x] === null) {
                movimientos.push({ x, y: ny2 });
            }
        }

        // Capturas normales
        for (let dx of [-1, 1]) {
            let cx = x + dx;
            let cy = y + dir;
            if (estaDentro(cx, cy) && estado[cy][cx] !== null && estado[cy][cx].endsWith(enemigo)) {
                movimientos.push({ x: cx, y: cy });
            }
        }

        // ⚡ PEÓN AL PASO (EN PASSANT)
        if (ultimoMovimiento && ultimoMovimiento.pieza && ultimoMovimiento.pieza[0] === "p") {
            const { from: f, to: t } = ultimoMovimiento;
            // El peón enemigo debe haber movido 2 casillas y estar al lado del mío
            if (Math.abs(t.y - f.y) === 2 && t.y === y && Math.abs(t.x - x) === 1) {
                movimientos.push({ 
                    x: t.x, 
                    y: y + dir, 
                    especial: "enPassant" 
                });
            }
        }
    }

    // ==========================================
    // ♜ TORRE (t)
    // ==========================================
    if (pieza[0] === "t") {
        const direcciones = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
        for (let d of direcciones) {
            let nx = x + d.dx, ny = y + d.dy;
            while (estaDentro(nx, ny)) {
                if (estado[ny][nx] === null) movimientos.push({ x: nx, y: ny });
                else {
                    if (estado[ny][nx].endsWith(enemigo)) movimientos.push({ x: nx, y: ny });
                    break;
                }
                nx += d.dx; ny += d.dy;
            }
        }
    }

    // ==========================================
    // ♝ ALFIL (c) - Basado en tu lógica de matriz
    // ==========================================
    if (pieza[0] === "c") {
        const diagonales = [{ dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 }];
        for (let d of diagonales) {
            let nx = x + d.dx, ny = y + d.dy;
            while (estaDentro(nx, ny)) {
                if (estado[ny][nx] === null) movimientos.push({ x: nx, y: ny });
                else {
                    if (estado[ny][nx].endsWith(enemigo)) movimientos.push({ x: nx, y: ny });
                    break;
                }
                nx += d.dx; ny += d.dy;
            }
        }
    }

    // ==========================================
    // ♞ CABALLO (a) - Basado en tu lógica de matriz
    // ==========================================
    if (pieza[0] === "a") {
        const saltos = [
            { dx: 2, dy: 1 }, { dx: 2, dy: -1 }, { dx: -2, dy: 1 }, { dx: -2, dy: -1 },
            { dx: 1, dy: 2 }, { dx: 1, dy: -2 }, { dx: -1, dy: 2 }, { dx: -1, dy: -2 }
        ];
        for (let s of saltos) {
            let nx = x + s.dx, ny = y + s.dy;
            if (estaDentro(nx, ny) && (estado[ny][nx] === null || estado[ny][nx].endsWith(enemigo))) {
                movimientos.push({ x: nx, y: ny });
            }
        }
    }

    // ==========================================
    // ♛ REINA (r)
    // ==========================================
    if (pieza[0] === "r") {
        const dirs = [
            { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
            { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 }
        ];
        for (let d of dirs) {
            let nx = x + d.dx, ny = y + d.dy;
            while (estaDentro(nx, ny)) {
                if (estado[ny][nx] === null) movimientos.push({ x: nx, y: ny });
                else {
                    if (estado[ny][nx].endsWith(enemigo)) movimientos.push({ x: nx, y: ny });
                    break;
                }
                nx += d.dx; ny += d.dy;
            }
        }
    }

    // ==========================================
    // 👑 REY (k) + ENROQUE
    // ==========================================
    if (pieza[0] === "k") {
        const dirs = [
            { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
            { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 }
        ];
        for (let d of dirs) {
            let nx = x + d.dx, ny = y + d.dy;
            if (estaDentro(nx, ny) && (estado[ny][nx] === null || estado[ny][nx].endsWith(enemigo))) {
                movimientos.push({ x: nx, y: ny });
            }
        }

        // Lógica de Enroque (Castling)
        if (!ignorarEnroque && !estaEnJaque(esBlanco ? "blanco" : "negro")) {
            const fila = esBlanco ? 7 : 0;
            const reyKey = esBlanco ? "kb" : "kn";

            if (!movido[reyKey] && y === fila && x === 4) {
                // Enroque corto
                const torreC = esBlanco ? "tb7" : "tn7";
                if (!movido[torreC] && estado[fila][5] === null && estado[fila][6] === null &&
                    !casillaAtacada(5, fila, esBlanco ? "blanco" : "negro") &&
                    !casillaAtacada(6, fila, esBlanco ? "blanco" : "negro")) {
                    movimientos.push({ x: 6, y: fila, especial: "enroqueCorto" });
                }
                // Enroque largo
                const torreL = esBlanco ? "tb0" : "tn0";
                if (!movido[torreL] && estado[fila][1] === null && estado[fila][2] === null && estado[fila][3] === null &&
                    !casillaAtacada(3, fila, esBlanco ? "blanco" : "negro") &&
                    !casillaAtacada(2, fila, esBlanco ? "blanco" : "negro")) {
                    movimientos.push({ x: 2, y: fila, especial: "enroqueLargo" });
                }
            }
        }
    }

    return movimientos;
}
function inicializarPeones() {
    for (let x = 0; x < 8; x++) {
        peonesID[`pb${x}`] = x + 1;
        peonesID[`pn${x}`] = x + 1;
    }
}
inicializarPeones();
function casillaAtacada(x, y, color) {
    const enemigo = color === "blanco" ? "n" : "b";

    for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
            const p = estado[j][i];
            if (!p || !p.endsWith(enemigo)) continue;

            const movs = obtenerMovimientos(i, j, p, true);
            if (movs.some(m => m.x === x && m.y === y)) {
                return true;
            }
        }
    }
    return false;
}

function resaltarSeleccion(x, y) {
    obtenerCelda(x, y).classList.add("seleccionada");
}

function resaltarMovimientos() {
    movimientosValidos.forEach(m => {
        obtenerCelda(m.x, m.y).classList.add("movimiento");
    });
}

function limpiarResaltados() {
    document.querySelectorAll(".seleccionada, .movimiento")
        .forEach(c => c.classList.remove("seleccionada", "movimiento"));
}
function obtenerPiezaPromocionada(x, y, piezaActual) {
    // Blanco llega a fila 0, Negro llega a fila 7
    if (piezaActual === "pb" && y === 0) return "rb"; 
    if (piezaActual === "pn" && y === 7) return "rn"; 
    return piezaActual;
}

function moverPieza(x, y) {
    if (animando) return;
    
    const movDestino = movimientosValidos.find(m => m.x === x && m.y === y);
    if (!movDestino) return;

    const origen = { x: seleccion.x, y: seleccion.y };
    const destino = { x, y };
    let piezaOriginal = seleccion.pieza;

    // Verificar si corona
    const piezaFinal = obtenerPiezaPromocionada(destino.x, destino.y, piezaOriginal);

    animando = true;
    tablero.style.pointerEvents = "none"; // Bloquear clics durante animación

    animarMovimiento(origen.x, origen.y, x, y, () => {
        socket.emit("movimiento", {
            from: origen,
            to: destino,
            pieza: piezaFinal,
            especial: movDestino.especial || null 
        });
        
        seleccion = null;
        movimientosValidos = [];
        animando = false;
        tablero.style.pointerEvents = "auto";
    });
}
function enviarMovimientoServidor(origen, destino, pieza) {
    if (!socket) return;

    socket.emit("movimiento", {
        from: origen,
        to: destino,
        pieza
    });
}

function finalizarTurno() {
    seleccion = null;
    movimientosValidos = [];
    dibujarTablero();
    actualizarVistaReloj();
    iniciarReloj();
    tablero.style.pointerEvents = "auto";
    animando = false;
}

function dibujarHistorial() {
    historialDiv.innerHTML = "";

    movimientos.forEach(mov => {
        const div = document.createElement("div");
        div.className = mov.color;
        div.textContent =
            mov.color === "blanco"
                ? `${mov.numero}. ${mov.texto}`
                : `… ${mov.texto}`;
        historialDiv.appendChild(div);
    });
}
function coordAJedrez(x, y) {
    const letras = ["a","b","c","d","e","f","g","h"];
    return letras[x] + (8 - y);
}

function estaDentro(x, y) {
    return x >= 0 && x < 8 && y >= 0 && y < 8;
}

function obtenerCelda(x, y) {
    return document.querySelector(`.celda[data-x="${x}"][data-y="${y}"]`);
}

function esMovimientoValido(x, y) {
    return movimientosValidos.some(m => m.x === x && m.y === y);
}

function encontrarRey(color) {
    const rey = color === "blanco" ? "kb" : "kn";

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            if (estado[y][x] === rey) {
                return { x, y };
            }
        }
    }
    return null;
}
function estaEnJaque(color) {
    const reyPos = encontrarRey(color);
    if (!reyPos) return false;

    const enemigo = color === "blanco" ? "n" : "b";

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const pieza = estado[y][x];
            if (!pieza) continue;

            // Solo piezas enemigas
            if (!pieza.endsWith(enemigo)) continue;

            const movimientos = obtenerMovimientos(x, y, pieza,true);

            if (movimientos.some(m => m.x === reyPos.x && m.y === reyPos.y)) {
                return true;
            }
        }
    }

    return false;
}

function clonarEstado(estadoOriginal) {
    return estadoOriginal.map(fila => fila.slice());
}
function movimientoLegal(origen, destino, pieza) {
    const copia = clonarEstado(estado);

    // Simular movimiento
    copia[destino.y][destino.x] = pieza;
    copia[origen.y][origen.x] = null;

    // Guardar estado real
    const estadoReal = estado;
    estado = copia;

    const color = pieza.endsWith("b") ? "blanco" : "negro";
    const enJaque = estaEnJaque(color);

    // Restaurar estado
    estado = estadoReal;

    return !enJaque;
}
function tieneMovimientosLegales(color) {
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const pieza = estado[y][x];
            if (!pieza) continue;

            const esBlanco = pieza.endsWith("b");
            if ((color === "blanco" && !esBlanco) ||
                (color === "negro" && esBlanco)) continue;

            const movimientos = obtenerMovimientos(x, y, pieza);

            for (let m of movimientos) {
                if (movimientoLegal(
                    { x, y },
                    { x: m.x, y: m.y },
                    pieza
                )) {
                    return true; // Existe al menos uno
                }
            }
        }
    }
    return false;
}
function esJaqueMate(color) {
    if (!estaEnJaque(color)) return false;
    return !tieneMovimientosLegales(color);
}
function promoverPeon(x, y) {
    const pieza = estado[y][x];
    if (!pieza || pieza[0] !== "p") return;

    // Blanco llega arriba, negro abajo
    if (pieza === "pb" && y === 0) {
        estado[y][x] = "rb"; // reina blanca
    }
    if (pieza === "pn" && y === 7) {
        estado[y][x] = "rn"; // reina negra
    }
}
function esAhogado(color) {
    if (estaEnJaque(color)) return false;
    return !tieneMovimientosLegales(color);
}
function materialInsuficiente() {
    let piezas = [];

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            if (estado[y][x]) {
                piezas.push(estado[y][x][0]);
            }
        }
    }

    // Solo reyes
    if (piezas.length === 2) return true;

    // Rey + alfil / caballo vs rey
    if (piezas.length === 3) {
        return piezas.includes("c") || piezas.includes("a");
    }

    return false;
}
function registrarMovimiento(origen, destino, pieza, esCaptura, especial = "") {
    const tipo = pieza[0];
    const color = pieza[1];

    const colorTexto = color === "b" ? "white" : "black";
    let nombre = `${nombresPiezas[tipo]} ${colorTexto}`;

    // Numerar peones
    if (tipo === "p") {
        nombre += " " + numeroPeon(pieza, origen.x);
    }

    const hacia = coordAJedrez(destino.x, destino.y);

    let texto = `${nombre} ${hacia}`;

    if (esCaptura) texto += " x";

    if (especial) texto = especial;

    // Jaque / mate
    if (estaEnJaque(turno === "blanco" ? "negro" : "blanco")) {
        texto += esJaqueMate(turno === "blanco" ? "negro" : "blanco")
            ? " #"
            : " +";
    }

    movimientos.push({
        numero: numeroMovimiento,
        texto,
        color
    });

    if (color === "n") numeroMovimiento++;
}


function animarMovimiento(origenX, origenY, destinoX, destinoY, callback) {
    const tablero = document.getElementById("tablero");

    const celdaOrigen = tablero.children[origenY * 8 + origenX];
    const celdaDestino = tablero.children[destinoY * 8 + destinoX];

    const pieza = celdaOrigen.querySelector("span");
    if (!pieza) {
        callback();
        return;
    }

    const rectOrigen = celdaOrigen.getBoundingClientRect();
    const rectDestino = celdaDestino.getBoundingClientRect();

    const clon = pieza.cloneNode(true);
    document.body.appendChild(clon);

    clon.style.position = "absolute";
    clon.style.left = rectOrigen.left + "px";
    clon.style.top = rectOrigen.top + "px";
    clon.style.fontSize = "36px";
    clon.style.zIndex = "9999";
    clon.style.pointerEvents = "none";
    clon.style.transition = "all 0.25s ease";

    // ocultar la pieza original
    pieza.style.visibility = "hidden";

    requestAnimationFrame(() => {
        clon.style.left = rectDestino.left + "px";
        clon.style.top = rectDestino.top + "px";
    });

    setTimeout(() => {
        clon.remove();
        callback();
    }, 260);
}

function dibujarCoordenadas() {
    const letras = ["a","b","c","d","e","f","g","h"];
    const numeros = ["8","7","6","5","4","3","2","1"];

    // Llenar todos los contenedores de letras (arriba y abajo)
    document.querySelectorAll(".letras").forEach(contenedor => {
        contenedor.innerHTML = "";
        letras.forEach(l => {
            const d = document.createElement("div");
            d.textContent = l;
            contenedor.appendChild(d);
        });
    });

    // Llenar todos los contenedores de números (izquierda y derecha)
    document.querySelectorAll(".numeros").forEach(contenedor => {
        contenedor.innerHTML = "";
        numeros.forEach(n => {
            const d = document.createElement("div");
            d.textContent = n;
            contenedor.appendChild(d);
        });
    });
}

dibujarCoordenadas();

function formatearTiempo(segundos) {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function actualizarVistaReloj() {
    document.getElementById("tiempo-blanco").textContent =
        formatearTiempo(tiempoBlanco);
    document.getElementById("tiempo-negro").textContent =
        formatearTiempo(tiempoNegro);

    document.getElementById("reloj-blanco")
        .classList.toggle("activo", turno === "blanco");
    document.getElementById("reloj-negro")
        .classList.toggle("activo", turno === "negro");
}

function estadoInicial() {
    return {
        tablero: [/* tu tablero */],
        turno: "b",
        historial: [],
        tiempoBlanco: 10*60, // segundos
        tiempoNegro: 10*60
    };
}

io.emit("fin", { ganador });


socket.on("reset", () => {
    partida = estadoInicial();
    io.emit("reset");
    iniciarReloj();
});


socket.on("fin", data => {
    estadoTexto.textContent = `⏱️ Tiempo agotado — Ganador: ${data.ganador === "b" ? "Blancas" : "Negras"}`;
    tablero.style.pointerEvents = "none";
});

// Al final de script.js
window.onload = () => {
    dibujarTablero();
    dibujarCoordenadas();
    actualizarVistaReloj();
};
