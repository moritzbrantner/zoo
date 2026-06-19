import initWasm, { WasmZoo } from "../wasm/pkg/zoo_game.js";

const LOCAL_WORLD_ID = "local-wasm-world";
const LOCAL_PLAYER_ID = "player-1";

let wasmReady: Promise<unknown> | null = null;

function ensureWasmReady() {
  wasmReady ??= initWasm();
  return wasmReady;
}

function encodeBody(payload: unknown) {
  return JSON.stringify(payload, (_key, value) =>
    typeof value === "bigint" ? Number(value) : value,
  );
}

function decodeBody<T = any>(payload: string): T {
  return JSON.parse(payload) as T;
}

export async function createLocalZooClient() {
  await ensureWasmReady();
  const zoo = new WasmZoo();

  function playerView() {
    const view = decodeBody(zoo.view_json());
    return {
      player_id: LOCAL_PLAYER_ID,
      checksum: checksumView(view),
      view,
    };
  }

  return {
    mode: "wasm",
    createWorld(players = [LOCAL_PLAYER_ID]) {
      const player = playerView();
      return {
        world_id: LOCAL_WORLD_ID,
        version: 0,
        players: players.map((playerId, index) => ({
          ...player,
          player_id: index === 0 ? player.player_id : playerId,
        })),
      };
    },
    getPlayer(_worldId, _playerId) {
      return playerView();
    },
    applyCommand(_worldId, _playerId, expectedVersion, command) {
      return decodeBody(
        zoo.apply_command_json(
          encodeBody({
            expected_version: expectedVersion,
            command,
          }),
        ),
      );
    },
    tick(_worldId, deltaSeconds) {
      const response = decodeBody(zoo.advance(BigInt(deltaSeconds)));
      return {
        version: response.version,
        events: {
          [LOCAL_PLAYER_ID]: response.events,
        },
        players: [
          {
            player_id: LOCAL_PLAYER_ID,
            checksum: response.checksum,
            view: response.view,
          },
        ],
      };
    },
    evaluatePlacement(_worldId, _playerId, kind, location, orientation = "North") {
      return decodeBody(
        zoo.evaluate_building_placement_json(
          encodeBody({
            kind,
            location,
            orientation,
          }),
        ),
      );
    },
  };
}

function checksumView(view) {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(JSON.stringify(view));
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
