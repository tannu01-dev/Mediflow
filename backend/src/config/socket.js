
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Hospital = require("../models/Hospital");

let io;

function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  // Every socket must authenticate with a valid JWT.
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

      if (!token || !process.env.JWT_SECRET) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.sub).select(
        "name email role hospitalId isActive"
      );

      if (!user || !user.isActive) {
        return next(new Error("User account is unavailable"));
      }

      if (user.hospitalId.toString() !== decoded.hospitalId) {
        return next(new Error("Invalid hospital association"));
      }

      const hospital = await Hospital.findById(user.hospitalId).select("status");

      if (!hospital || hospital.status !== "ACTIVE") {
        return next(new Error("Hospital is inactive"));
      }

      socket.user = {
        id: user._id.toString(),
        role: user.role,
        hospitalId: user.hospitalId.toString(),
      };

      next();
    } catch {
      next(new Error("Invalid or expired authentication token"));
    }
  });

  io.on("connection", (socket) => {
    const { id, role, hospitalId } = socket.user;

    // Rooms are assigned only from verified server-side identity.
    socket.join(`user:${id}`);
    socket.join(`hospital:${hospitalId}`);
    socket.join(`hospital:${hospitalId}:role:${role}`);

    socket.emit("socket:ready", {
      connected: true,
      userId: id,
      hospitalId,
    });

    socket.on("disconnect", () => {
      // Socket.IO automatically removes the socket from its rooms.
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error("Socket.IO has not been initialized");
  }
  return io;
}

function emitToUser(userId, eventName, payload) {
  if (io && userId) {
    io.to(`user:${userId}`).emit(eventName, payload);
  }
}

function emitToHospitalRoles(hospitalId, roles, eventName, payload) {
  if (!io || !hospitalId || !Array.isArray(roles)) return;

  for (const role of roles) {
    io.to(`hospital:${hospitalId}:role:${role}`).emit(eventName, payload);
  }
}

function emitToHospital(hospitalId, eventName, payload) {
  if (io && hospitalId) {
    io.to(`hospital:${hospitalId}`).emit(eventName, payload);
  }
}

function publishOperationalEvent(hospitalId, kind, payload = {}) {
  if (!io || !hospitalId) return;
  const event = { kind: String(kind || "GENERAL"), at: new Date().toISOString(), ...payload };
  io.to(`hospital:${hospitalId}`).emit("hospital:event", event);
  io.to(`hospital:${hospitalId}`).emit("dashboard:refresh", event);
}

module.exports = {
  initializeSocket,
  getIO,
  emitToUser,
  emitToHospitalRoles,
  emitToHospital,
  publishOperationalEvent,
};
