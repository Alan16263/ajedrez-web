const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path"); // Necesario para las rutas

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Permite que te conectes desde local a Render
});

// Indicar que los archivos están en la carpeta 'public'
app.use(express.static(path.join(__dirname, "public")));

// Ruta principal
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

let esperando = null;
let partida = null;

// Unificamos con tu script.js: r=Reina, k=Rey, a=Caballo, c=Alfil
function estadoInicial() {
    return {
        tablero: [
            ["tn","an","cn","rn","kn","cn","an","tn"],
            ["pn","pn","pn","pn","pn","pn","pn","pn"],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            ["pb","pb","pb","pb","pb","pb","pb","pb"],
            ["tb","ab","cb","rb","kb","cb","ab","tb"]
        ],
        turno: "b",
        historial: [],
        ultimoMovimiento: null,
        tiempoBlanco: 10*60,
        tiempoNegro: 10*60
    };
}

let intervaloReloj = null;
function iniciarReloj() {
    if (intervaloReloj) clearInterval(intervaloReloj);
    intervaloReloj = setInterval(() => {
        if (!partida) return;
        if (partida.turno === "b") {
            partida.tiempoBlanco--;
            if (partida.tiempoBlanco <= 0) finalizarPartida("b");
        } else {
            partida.tiempoNegro--;
            if (partida.tiempoNegro <= 0) finalizarPartida("n");
        }
        io.emit("estado", partida);
    }, 1000);
}

function finalizarPartida(colorPerdedor) {
    clearInterval(intervaloReloj);
    io.emit("fin", { ganador: colorPerdedor === "b" ? "n" : "b" });
}

io.on("connection", socket => {
    console.log("Jugador conectado:", socket.id);

    // UNIFICADO: Solo un evento de movimiento
    socket.on("movimiento", data => {
        // VALIDACIÓN: Si no hay partida activa o no es el turno, ignorar
        if (!partida || socket.color !== partida.turno) return;

        try {
            const { from, to, pieza, especial } = data;

            // Evitar que el servidor se rompa si los datos vienen incompletos
            if (!from || !to || !pieza) return;

            // Lógica de movimientos especiales...
            if (especial === "enPassant") {
                partida.tablero[from.y][to.x] = null;
            } else if (especial === "enroqueCorto") {
                const fila = pieza.endsWith("b") ? 7 : 0;
                partida.tablero[fila][5] = partida.tablero[fila][7];
                partida.tablero[fila][7] = null;
            } else if (especial === "enroqueLargo") {
                const fila = pieza.endsWith("b") ? 7 : 0;
                partida.tablero[fila][3] = partida.tablero[fila][0];
                partida.tablero[fila][0] = null;
            }

            // Aplicar movimiento
            partida.tablero[to.y][to.x] = pieza;
            partida.tablero[from.y][from.x] = null;
            
            partida.ultimoMovimiento = data;
            partida.turno = partida.turno === "b" ? "n" : "b";
            partida.historial.push({ ...data, color: socket.color === "b" ? "blanco" : "negro" });

            io.emit("estado", partida); 
        } catch (e) {
            console.error("Error procesando movimiento:", e);
        }
    });

    // Lógica de emparejamiento
    if (!esperando) {
        esperando = socket;
        socket.color = "b";
        socket.emit("esperando");
    } else {
        socket.color = "n";
        partida = estadoInicial();
        iniciarReloj();
        socket.emit("inicio", { color: "n", estado: partida });
        esperando.emit("inicio", { color: "b", estado: partida });
        esperando = null;
    }

    socket.on("reset", () => {
        partida = estadoInicial();
        iniciarReloj();
        io.emit("estado", partida);
    });

    socket.on("disconnect", () => {
        console.log("Jugador desconectado:", socket.id);
        // IMPORTANTE: Si un jugador se va, limpiamos para que otros puedan jugar
        if (esperando === socket) {
            esperando = null;
        } else {
            // Si había una partida en curso, avisamos y reseteamos
            partida = null;
            clearInterval(intervaloReloj);
            io.emit("mensaje-sistema", "Un jugador se ha desconectado. Reiniciando juego...");
            io.emit("reset");
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
});