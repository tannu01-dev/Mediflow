require("dotenv").config();

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const { initializeSocket } = require("./config/socket");
const { assertProductionSecrets } = require("./utils/securityConfig");

const PORT = process.env.PORT || 5000;

const httpServer = http.createServer(app);

// Initialize authenticated Socket.IO connections.
initializeSocket(httpServer);

async function startServer() {
  assertProductionSecrets();
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required before starting the API.");
  await connectDB();

  httpServer.listen(PORT, () => {
    console.log(`MediFlow API running at http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log("Socket.IO real-time service initialized");
  });
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down MediFlow...`);

  httpServer.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer().catch((error) => {
  console.error("Failed to start MediFlow:", error);
  process.exit(1);
});
