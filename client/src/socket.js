import { io } from "socket.io-client";

// Connect to current host or proxy in development
const socket = io(window.location.origin, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 10,
  reconnectionDelay: 1500,
});

export default socket;
