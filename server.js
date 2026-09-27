const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "https://manasa106.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

app.get("/", (req, res) => {
  res.json({
    status: "online",
    project: "VibeSense AI",
    message: "WebRTC signaling server is running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString()
  });
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-room", ({ roomId, role }) => {
    if (!roomId) return;

    const room = rooms.get(roomId) || {
      sender: null,
      viewer: null
    };

    if (role === "sender") {
      if (room.sender && room.sender !== socket.id) {
        socket.emit("room-error", "A sender is already connected to this room.");
        return;
      }

      room.sender = socket.id;
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = "sender";

      rooms.set(roomId, room);

      console.log(`Sender joined room ${roomId}`);

      socket.emit("joined-room", {
        roomId,
        role: "sender"
      });

      if (room.viewer) {
        io.to(room.viewer).emit("peer-ready", {
          role: "sender"
        });
      }
    }

    if (role === "viewer") {
      if (room.viewer && room.viewer !== socket.id) {
        socket.emit("room-error", "A viewer is already connected to this room.");
        return;
      }

      room.viewer = socket.id;
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = "viewer";

      rooms.set(roomId, room);

      console.log(`Viewer joined room ${roomId}`);

      socket.emit("joined-room", {
        roomId,
        role: "viewer"
      });

      if (room.sender) {
        io.to(room.sender).emit("peer-ready", {
          role: "viewer"
        });
      }
    }
  });

  socket.on("offer", ({ roomId, offer }) => {
    const room = rooms.get(roomId);

    if (!room) return;

    if (room.viewer) {
      io.to(room.viewer).emit("offer", {
        offer
      });
    }
  });

  socket.on("answer", ({ roomId, answer }) => {
    const room = rooms.get(roomId);

    if (!room) return;

    if (room.sender) {
      io.to(room.sender).emit("answer", {
        answer
      });
    }
  });

  socket.on("ice-candidate", ({ roomId, candidate }) => {
    const room = rooms.get(roomId);

    if (!room) return;

    const target =
      socket.data.role === "sender"
        ? room.viewer
        : room.sender;

    if (target) {
      io.to(target).emit("ice-candidate", {
        candidate
      });
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (roomId) {
      const room = rooms.get(roomId);

      if (room) {
        if (room.sender === socket.id) {
          room.sender = null;

          if (room.viewer) {
            io.to(room.viewer).emit("peer-disconnected");
          }
        }

        if (room.viewer === socket.id) {
          room.viewer = null;

          if (room.sender) {
            io.to(room.sender).emit("peer-disconnected");
          }
        }

        if (!room.sender && !room.viewer) {
          rooms.delete(roomId);
        } else {
          rooms.set(roomId, room);
        }
      }
    }

    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("====================================");
  console.log("       VIBESENSE AI SERVER");
  console.log("====================================");
  console.log(`Server running on port ${PORT}`);
});