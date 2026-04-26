export function createZooClient(baseUrl = "http://127.0.0.1:8080") {
  async function request(path, options: RequestInit & { headers?: HeadersInit } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        "content-type": "application/json",
        ...(options.headers ?? {}),
      },
      ...options,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? `Zoo server request failed: ${response.status}`);
    }
    return payload;
  }

  return {
    createWorld(players = ["player-1"]) {
      return request("/api/worlds", {
        method: "POST",
        body: JSON.stringify({ players }),
      });
    },
    getPlayer(worldId, playerId) {
      return request(`/api/worlds/${worldId}/players/${playerId}`);
    },
    applyCommand(worldId, playerId, expectedVersion, command) {
      return request(`/api/worlds/${worldId}/players/${playerId}/commands`, {
        method: "POST",
        body: JSON.stringify({ expected_version: expectedVersion, command }),
      });
    },
    tick(worldId, deltaSeconds) {
      return request(`/api/worlds/${worldId}/tick`, {
        method: "POST",
        body: JSON.stringify({ delta_seconds: deltaSeconds }),
      });
    },
  };
}
