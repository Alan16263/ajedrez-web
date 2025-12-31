const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let esperando = null;
let partida = null;

function estadoInicial() {
    return {
        tablero: [
            ["tn","cn","an","dn","rn","an","cn","tn"],
            ["pn","pn","pn","pn","pn","pn","pn","pn"],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            ["pb","pb","pb","pb","pb","pb","pb","pb"],
            ["tb","cb","ab","db","rb","ab","cb","tb"]
        ],
        turno: "b",
        historial: [],
        ultimoMovimiento: null, // 👈 IMPORTANTE para En Passant
        tiempoBlanco: 10*60,
        tiempoNegro: 10*60
    };
}

// =====================
// Reloj
// =====================
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

function finalizarPartida(color) {
    clearInterval(intervaloReloj);
    io.emit("fin", { ganador: color === "b" ? "n" : "b" });
}

// =====================
// Socket
// =====================
io.on("connection", socket => {
    console.log("Jugador conectado:", socket.id);
      socket.on("movimiento", data => {
        if (!partida) return;
        if (socket.color !== partida.turno) return;

        const { from, to, pieza, especial } = data;

        // Lógica de captura En Passant
        if (especial === "enPassant") {
            const yCaptura = from.y; // El peón enemigo está en la misma fila de origen
            partida.tablero[yCaptura][to.x] = null;
        }

        // Mover pieza
        partida.tablero[to.y][to.x] = pieza;
        partida.tablero[from.y][from.x] = null;
        
        partida.ultimoMovimiento = data; // Guardamos el último movimiento
        partida.turno = partida.turno === "b" ? "n" : "b";
        partida.historial.push(data);

        io.emit("estado", partida); 
    });

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

    socket.on("movimiento", data => {
        if (!partida) return;
        if (socket.color !== partida.turno) return;

        const { from, to, pieza } = data;

        // Aquí podrías validar movimiento legal antes de aplicar
        partida.tablero[to.y][to.x] = pieza;
        partida.tablero[from.y][from.x] = null;
        partida.turno = partida.turno === "b" ? "n" : "b";
        partida.historial.push(data);

        io.emit("estado", partida);
    });

    socket.on("reset", () => {
        partida = estadoInicial();
        io.emit("reset");
        iniciarReloj();
    });

    socket.on("disconnect", () => {
        console.log("Jugador desconectado:", socket.id);
        esperando = null;
        partida = null;
        clearInterval(intervaloReloj);
        io.emit("reset");
    });
});

server.listen(3000, () => console.log("Servidor corriendo en http://localhost:3000"));

