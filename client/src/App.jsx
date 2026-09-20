import React, { useState, useEffect } from "react";
import LobbyPage from "./pages/LobbyPage";
import PlayerPage from "./pages/PlayerPage";
import AdminPage from "./pages/AdminPage";
import UserPage from "./pages/UserPage";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Parse path:
  // "/" -> LobbyPage
  // "/:roomId/player" -> PlayerPage (scoped to roomId)
  // "/:roomId/admin" -> AdminPage (scoped to roomId)
  // "/:roomId" -> UserPage (scoped to roomId)

  const cleanPath = path.replace(/\/+$/, ""); // remove trailing slash
  const segments = cleanPath.split("/").filter(Boolean);

  if (segments.length === 0) {
    return <LobbyPage />;
  }

  const [firstSegment, secondSegment] = segments;

  // Legacy route support: /player, /admin -> mapped to "main" room
  if (firstSegment === "player") {
    return <PlayerPage roomId="main" />;
  }
  if (firstSegment === "admin") {
    return <AdminPage roomId="main" />;
  }

  // Multi-room routes:
  // /:roomId/player
  if (secondSegment === "player") {
    return <PlayerPage roomId={firstSegment} />;
  }

  // /:roomId/admin
  if (secondSegment === "admin") {
    return <AdminPage roomId={firstSegment} />;
  }

  // /:roomId
  return <UserPage roomId={firstSegment} />;
}
