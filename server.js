const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Servir archivos estáticos
app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("Jugador conectado:", socket.id);

  socket.on("move", (data) => {
    // Reenviar movimiento al otro jugador
    socket.broadcast.emit("move", data);
  });

  socket.on("disconnect", () => {
    console.log("Jugador desconectado:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
