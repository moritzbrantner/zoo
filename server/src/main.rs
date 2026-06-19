use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use farm_engine::{CommandId, CommandOutcome, GameEvent, GameWorld, PlayerId, WorldId};
use farm_persistence::{
    CommandJournalEntry, CommandLog, RepositoryError, StoredWorldDocument, WorldRepository,
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tower_http::cors::CorsLayer;
use zoo_game::{
    ZooApplyCommandRequest, ZooCommand, ZooCommandResponse, ZooCreateWorldRequest,
    ZooCreateWorldResponse, ZooLogic, ZooPlacementEvaluationRequest,
    ZooPlacementEvaluationResponse, ZooPlayerView, ZooTickRequest, ZooTickResponse,
    ZooWorldListItem, ZooWorldListResponse, apply_zoo_command, command_response,
    evaluate_zoo_building_placement, new_zoo_world, zoo_checksum, zoo_view,
};

#[derive(Clone)]
struct AppState {
    backend: StoreBackend,
}

#[derive(Clone)]
enum StoreBackend {
    Memory(Arc<Mutex<WorldStore>>),
    Sqlite(Arc<Mutex<SqliteWorldStore>>),
}

#[derive(Default)]
struct WorldStore {
    next_world_id: u64,
    next_command_id: u64,
    worlds: BTreeMap<WorldId, StoredWorldDocument>,
    engine_journal: Vec<CommandJournalEntry>,
    zoo_journal: Vec<serde_json::Value>,
}

struct SqliteWorldStore {
    connection: Connection,
}

#[derive(Debug, Serialize, Deserialize)]
struct ZooJournalEntry {
    stage: String,
    before_format_version: u32,
    after_format_version: Option<u32>,
    events: Vec<GameEvent>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct ApiError {
    error: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            backend: StoreBackend::Memory(Arc::new(Mutex::new(WorldStore::default()))),
        }
    }
}

impl AppState {
    fn sqlite(path: impl Into<PathBuf>) -> Result<Self, RepositoryError> {
        let connection = Connection::open(path.into())
            .map_err(|error| RepositoryError::Storage(error.to_string()))?;
        let store = SqliteWorldStore { connection };
        store.init()?;
        Ok(Self {
            backend: StoreBackend::Sqlite(Arc::new(Mutex::new(store))),
        })
    }

    fn sqlite_from_env() -> Result<Self, RepositoryError> {
        let path = std::env::var("ZOO_DB_PATH").unwrap_or_else(|_| "./zoo.sqlite3".to_owned());
        Self::sqlite(path)
    }

    fn allocate_command_id(&self) -> Result<CommandId, (StatusCode, Json<ApiError>)> {
        match &self.backend {
            StoreBackend::Memory(inner) => {
                let mut store = inner.lock().map_err(lock_error)?;
                store.next_command_id += 1;
                Ok(CommandId::new(format!(
                    "server-command-{}",
                    store.next_command_id
                )))
            }
            StoreBackend::Sqlite(inner) => {
                let store = inner.lock().map_err(lock_error)?;
                let next: i64 = store
                    .connection
                    .query_row(
                        "select coalesce(max(id), 0) + 1 from command_journal",
                        [],
                        |row| row.get(0),
                    )
                    .map_err(internal_error)?;
                Ok(CommandId::new(format!("server-command-{next}")))
            }
        }
    }

    fn create_world_id(&self) -> Result<WorldId, (StatusCode, Json<ApiError>)> {
        match &self.backend {
            StoreBackend::Memory(inner) => {
                let mut store = inner.lock().map_err(lock_error)?;
                store.next_world_id += 1;
                Ok(WorldId::new(format!("dev-world-{}", store.next_world_id)))
            }
            StoreBackend::Sqlite(_) => {
                let nanos = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(internal_error)?
                    .as_nanos();
                Ok(WorldId::new(format!("dev-world-{nanos}")))
            }
        }
    }

    fn insert_world(
        &self,
        world_id: WorldId,
        stored: &StoredWorldDocument,
    ) -> Result<(), RepositoryError> {
        match &self.backend {
            StoreBackend::Memory(inner) => {
                let mut store = inner.lock().map_err(|_| {
                    RepositoryError::Storage("world store lock was poisoned".to_owned())
                })?;
                store.worlds.insert(world_id, stored.clone());
                Ok(())
            }
            StoreBackend::Sqlite(inner) => inner
                .lock()
                .map_err(|_| RepositoryError::Storage("world store lock was poisoned".to_owned()))?
                .insert_world(&world_id, stored),
        }
    }

    fn list_worlds(&self) -> Result<Vec<ZooWorldListItem>, RepositoryError> {
        match &self.backend {
            StoreBackend::Memory(inner) => {
                let store = inner.lock().map_err(|_| {
                    RepositoryError::Storage("world store lock was poisoned".to_owned())
                })?;
                Ok(store
                    .worlds
                    .iter()
                    .map(|(world_id, stored)| ZooWorldListItem {
                        world_id: world_id.clone(),
                        version: stored.version,
                    })
                    .collect())
            }
            StoreBackend::Sqlite(inner) => inner
                .lock()
                .map_err(|_| RepositoryError::Storage("world store lock was poisoned".to_owned()))?
                .list_worlds(),
        }
    }

    fn append_zoo_journal(
        &self,
        world_id: &WorldId,
        command_id: &CommandId,
        player: &PlayerId,
        expected_version: u64,
        command: &ZooCommand,
        entry: ZooJournalEntry,
    ) -> Result<(), RepositoryError> {
        match &self.backend {
            StoreBackend::Memory(inner) => {
                let mut store = inner.lock().map_err(|_| {
                    RepositoryError::Storage("world store lock was poisoned".to_owned())
                })?;
                store.zoo_journal.push(serde_json::json!({
                    "world_id": world_id,
                    "command_id": command_id,
                    "player_id": player,
                    "expected_version": expected_version,
                    "command": command,
                    "entry": entry,
                }));
                Ok(())
            }
            StoreBackend::Sqlite(inner) => inner
                .lock()
                .map_err(|_| RepositoryError::Storage("world store lock was poisoned".to_owned()))?
                .append_zoo_journal(
                    world_id,
                    command_id,
                    player,
                    expected_version,
                    command,
                    entry,
                ),
        }
    }
}

impl SqliteWorldStore {
    fn init(&self) -> Result<(), RepositoryError> {
        self.connection
            .execute_batch(
                r#"
                create table if not exists worlds (
                  world_id text primary key,
                  version integer not null,
                  document_json text not null,
                  created_at text not null default current_timestamp,
                  updated_at text not null default current_timestamp
                );

                create table if not exists command_journal (
                  id integer primary key autoincrement,
                  world_id text not null,
                  command_id text not null,
                  player_id text not null,
                  expected_version integer not null,
                  command_json text not null,
                  outcome_json text,
                  created_at text not null default current_timestamp
                );
                "#,
            )
            .map_err(|error| RepositoryError::Storage(error.to_string()))
    }

    fn insert_world(
        &self,
        world_id: &WorldId,
        stored: &StoredWorldDocument,
    ) -> Result<(), RepositoryError> {
        let document_json = serde_json::to_string(stored)
            .map_err(|error| RepositoryError::Storage(error.to_string()))?;
        self.connection
            .execute(
                "insert into worlds (world_id, version, document_json) values (?1, ?2, ?3)",
                params![world_id.to_string(), stored.version, document_json],
            )
            .map_err(|error| RepositoryError::Storage(error.to_string()))?;
        Ok(())
    }

    fn list_worlds(&self) -> Result<Vec<ZooWorldListItem>, RepositoryError> {
        let mut statement = self
            .connection
            .prepare("select world_id, version from worlds order by created_at desc, world_id desc")
            .map_err(|error| RepositoryError::Storage(error.to_string()))?;
        let rows = statement
            .query_map([], |row| {
                let world_id: String = row.get(0)?;
                let version: u64 = row.get(1)?;
                Ok(ZooWorldListItem {
                    world_id: WorldId::new(world_id),
                    version,
                })
            })
            .map_err(|error| RepositoryError::Storage(error.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| RepositoryError::Storage(error.to_string()))
    }

    fn append_zoo_journal(
        &self,
        world_id: &WorldId,
        command_id: &CommandId,
        player: &PlayerId,
        expected_version: u64,
        command: &ZooCommand,
        entry: ZooJournalEntry,
    ) -> Result<(), RepositoryError> {
        let command_json = serde_json::to_string(command)
            .map_err(|error| RepositoryError::Storage(error.to_string()))?;
        let outcome_json = serde_json::to_string(&entry)
            .map_err(|error| RepositoryError::Storage(error.to_string()))?;
        self.connection
            .execute(
                "insert into command_journal
                 (world_id, command_id, player_id, expected_version, command_json, outcome_json)
                 values (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    world_id.to_string(),
                    command_id.to_string(),
                    player.to_string(),
                    expected_version,
                    command_json,
                    outcome_json
                ],
            )
            .map_err(|error| RepositoryError::Storage(error.to_string()))?;
        Ok(())
    }
}

impl WorldRepository for AppState {
    fn load_world(&self, id: &WorldId) -> Result<StoredWorldDocument, RepositoryError> {
        match &self.backend {
            StoreBackend::Memory(inner) => {
                let store = inner.lock().map_err(|_| {
                    RepositoryError::Storage("world store lock was poisoned".to_owned())
                })?;
                store
                    .worlds
                    .get(id)
                    .cloned()
                    .ok_or_else(|| RepositoryError::NotFound(id.clone()))
            }
            StoreBackend::Sqlite(inner) => {
                let store = inner.lock().map_err(|_| {
                    RepositoryError::Storage("world store lock was poisoned".to_owned())
                })?;
                let document_json = store
                    .connection
                    .query_row(
                        "select document_json from worlds where world_id = ?1",
                        params![id.to_string()],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
                    .map_err(|error| RepositoryError::Storage(error.to_string()))?
                    .ok_or_else(|| RepositoryError::NotFound(id.clone()))?;
                serde_json::from_str(&document_json)
                    .map_err(|error| RepositoryError::Storage(error.to_string()))
            }
        }
    }

    fn save_world(
        &self,
        id: &WorldId,
        expected_version: u64,
        world: &StoredWorldDocument,
    ) -> Result<(), RepositoryError> {
        match &self.backend {
            StoreBackend::Memory(inner) => {
                let mut store = inner.lock().map_err(|_| {
                    RepositoryError::Storage("world store lock was poisoned".to_owned())
                })?;
                let stored = store
                    .worlds
                    .get_mut(id)
                    .ok_or_else(|| RepositoryError::NotFound(id.clone()))?;
                if stored.version != expected_version {
                    return Err(RepositoryError::Conflict(format!(
                        "version mismatch: expected {}, found {}",
                        expected_version, stored.version
                    )));
                }
                *stored = world.clone();
                Ok(())
            }
            StoreBackend::Sqlite(inner) => {
                let store = inner.lock().map_err(|_| {
                    RepositoryError::Storage("world store lock was poisoned".to_owned())
                })?;
                let document_json = serde_json::to_string(world)
                    .map_err(|error| RepositoryError::Storage(error.to_string()))?;
                let updated = store
                    .connection
                    .execute(
                        "update worlds
                         set version = ?1, document_json = ?2, updated_at = current_timestamp
                         where world_id = ?3 and version = ?4",
                        params![
                            world.version,
                            document_json,
                            id.to_string(),
                            expected_version
                        ],
                    )
                    .map_err(|error| RepositoryError::Storage(error.to_string()))?;
                if updated == 1 {
                    return Ok(());
                }
                let current_version = store
                    .connection
                    .query_row(
                        "select version from worlds where world_id = ?1",
                        params![id.to_string()],
                        |row| row.get::<_, u64>(0),
                    )
                    .optional()
                    .map_err(|error| RepositoryError::Storage(error.to_string()))?;
                match current_version {
                    Some(found) => Err(RepositoryError::Conflict(format!(
                        "version mismatch: expected {}, found {}",
                        expected_version, found
                    ))),
                    None => Err(RepositoryError::NotFound(id.clone())),
                }
            }
        }
    }
}

impl CommandLog for AppState {
    fn append(&self, entry: CommandJournalEntry) -> Result<(), RepositoryError> {
        match &self.backend {
            StoreBackend::Memory(inner) => {
                let mut store = inner.lock().map_err(|_| {
                    RepositoryError::Storage("world store lock was poisoned".to_owned())
                })?;
                store.engine_journal.push(entry);
                Ok(())
            }
            StoreBackend::Sqlite(inner) => {
                let store = inner.lock().map_err(|_| {
                    RepositoryError::Storage("world store lock was poisoned".to_owned())
                })?;
                let (world_id, command_id, player, command, expected_version, outcome_json) =
                    match &entry {
                        CommandJournalEntry::Prepared {
                            world_id,
                            command_id,
                            player,
                            command,
                            expected_version,
                            before_format_version,
                        } => (
                            world_id,
                            command_id,
                            player,
                            command,
                            *expected_version,
                            serde_json::json!({
                                "stage": "prepared",
                                "before_format_version": before_format_version
                            }),
                        ),
                        CommandJournalEntry::Committed {
                            world_id,
                            command_id,
                            player,
                            command,
                            expected_version,
                            before_format_version,
                            after_format_version,
                            events,
                        } => (
                            world_id,
                            command_id,
                            player,
                            command,
                            *expected_version,
                            serde_json::json!({
                                "stage": "committed",
                                "before_format_version": before_format_version,
                                "after_format_version": after_format_version,
                                "events": events
                            }),
                        ),
                        CommandJournalEntry::Rejected {
                            world_id,
                            command_id,
                            player,
                            command,
                            expected_version,
                            before_format_version,
                            error,
                        } => (
                            world_id,
                            command_id,
                            player,
                            command,
                            *expected_version,
                            serde_json::json!({
                                "stage": "rejected",
                                "before_format_version": before_format_version,
                                "error": error
                            }),
                        ),
                    };
                let command_json = serde_json::to_string(command)
                    .map_err(|error| RepositoryError::Storage(error.to_string()))?;
                store
                    .connection
                    .execute(
                        "insert into command_journal
                         (world_id, command_id, player_id, expected_version, command_json, outcome_json)
                         values (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![
                            world_id.to_string(),
                            command_id.to_string(),
                            player.as_ref().map(ToString::to_string).unwrap_or_default(),
                            expected_version,
                            command_json,
                            outcome_json.to_string()
                        ],
                    )
                    .map_err(|error| RepositoryError::Storage(error.to_string()))?;
                Ok(())
            }
        }
    }
}

#[tokio::main]
async fn main() {
    let app = app(AppState::sqlite_from_env().expect("zoo server should initialize SQLite store"));
    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("zoo server should bind to 127.0.0.1:8080");
    println!("zoo server listening on http://{addr}");
    axum::serve(listener, app)
        .await
        .expect("zoo server should run");
}

fn app(state: AppState) -> Router {
    Router::new()
        .route("/api/worlds", get(list_worlds).post(create_world))
        .route(
            "/api/worlds/{world_id}/players/{player_id}",
            get(get_player),
        )
        .route(
            "/api/worlds/{world_id}/players/{player_id}/commands",
            post(apply_command),
        )
        .route(
            "/api/worlds/{world_id}/players/{player_id}/placement",
            post(evaluate_placement),
        )
        .route("/api/worlds/{world_id}/tick", post(tick_world))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn list_worlds(
    State(state): State<AppState>,
) -> Result<Json<ZooWorldListResponse>, (StatusCode, Json<ApiError>)> {
    let worlds = state.list_worlds().map_err(repository_error)?;
    Ok(Json(ZooWorldListResponse { worlds }))
}

async fn create_world(
    State(state): State<AppState>,
    Json(request): Json<ZooCreateWorldRequest>,
) -> Result<Json<ZooCreateWorldResponse>, (StatusCode, Json<ApiError>)> {
    let players = if request.players.is_empty() {
        vec!["player-1".to_owned()]
    } else {
        request.players
    };
    let player_ids = players
        .iter()
        .map(|player| PlayerId::new(player.clone()))
        .collect::<Vec<_>>();
    let world = new_zoo_world(player_ids).map_err(internal_error)?;
    let players = player_views_from_world(&world)?;

    let world_id = state.create_world_id()?;
    let stored = StoredWorldDocument {
        version: 0,
        document: world.save_document(),
    };
    state
        .insert_world(world_id.clone(), &stored)
        .map_err(repository_error)?;

    Ok(Json(ZooCreateWorldResponse {
        world_id,
        version: stored.version,
        players,
    }))
}

async fn get_player(
    State(state): State<AppState>,
    Path((world_id, player_id)): Path<(String, String)>,
) -> Result<Json<ZooPlayerView>, (StatusCode, Json<ApiError>)> {
    let world_id = WorldId::new(world_id.clone());
    let player_id = PlayerId::new(player_id);
    let stored = state.load_world(&world_id).map_err(repository_error)?;
    let world = GameWorld::from_document(stored.document).map_err(internal_error)?;
    player_view_from_world(&world, &player_id).map(Json)
}

async fn apply_command(
    State(state): State<AppState>,
    Path((world_id, player_id)): Path<(String, String)>,
    Json(request): Json<ZooApplyCommandRequest>,
) -> Result<Json<ZooCommandResponse>, (StatusCode, Json<ApiError>)> {
    let world_id = WorldId::new(world_id.clone());
    let player_id = PlayerId::new(player_id.clone());
    let command_id = state.allocate_command_id()?;
    let result = execute_journaled_zoo_command(
        &state,
        &world_id,
        command_id,
        player_id.clone(),
        request.expected_version,
        request.command,
    )
    .map_err(repository_error)?;

    let version = result.stored_world.version;
    let world = GameWorld::from_document(result.stored_world.document).map_err(internal_error)?;
    let state = world.require_player(player_id).map_err(internal_error)?;

    match result.outcome {
        Ok(outcome) => command_response(true, version, outcome.events, state, None)
            .map(Json)
            .map_err(internal_error),
        Err(error) => command_response(false, version, Vec::new(), state, Some(error))
            .map(Json)
            .map_err(internal_error),
    }
}

async fn evaluate_placement(
    State(state): State<AppState>,
    Path((world_id, player_id)): Path<(String, String)>,
    Json(request): Json<ZooPlacementEvaluationRequest>,
) -> Result<Json<ZooPlacementEvaluationResponse>, (StatusCode, Json<ApiError>)> {
    let world_id = WorldId::new(world_id.clone());
    let player_id = PlayerId::new(player_id);
    let stored = state.load_world(&world_id).map_err(repository_error)?;
    let world = GameWorld::from_document(stored.document).map_err(internal_error)?;
    let player_state = world.require_player(player_id).map_err(internal_error)?;
    Ok(Json(evaluate_zoo_building_placement(player_state, request)))
}

async fn tick_world(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
    Json(request): Json<ZooTickRequest>,
) -> Result<Json<ZooTickResponse>, (StatusCode, Json<ApiError>)> {
    let world_id = WorldId::new(world_id.clone());
    let stored = state.load_world(&world_id).map_err(repository_error)?;
    let mut world = GameWorld::from_document(stored.document).map_err(internal_error)?;
    let delta_seconds = request.delta_seconds.min(60);
    let mut logic = ZooLogic;
    let outcomes = world
        .advance_time_and_collect_events_with_logic(delta_seconds, &mut logic)
        .map_err(internal_error)?;
    let next = StoredWorldDocument {
        version: stored
            .version
            .checked_add(1)
            .ok_or_else(|| internal_error("world version overflowed"))?,
        document: world.save_document(),
    };
    state
        .save_world(&world_id, stored.version, &next)
        .map_err(repository_error)?;

    let events = outcomes
        .into_iter()
        .map(|(player, outcome)| {
            let mut player_events = outcome
                .completions
                .into_iter()
                .map(GameEvent::JobCompleted)
                .collect::<Vec<_>>();
            player_events.extend(outcome.events);
            (player, player_events)
        })
        .collect::<BTreeMap<_, _>>();
    let players = player_views_from_world(&world)?;
    Ok(Json(ZooTickResponse {
        version: next.version,
        events,
        players,
    }))
}

struct ZooJournaledCommandResult {
    stored_world: StoredWorldDocument,
    outcome: Result<CommandOutcome, String>,
}

fn execute_journaled_zoo_command(
    state: &AppState,
    world_id: &WorldId,
    command_id: CommandId,
    player: PlayerId,
    expected_version: u64,
    command: ZooCommand,
) -> Result<ZooJournaledCommandResult, RepositoryError> {
    let stored_world = state.load_world(world_id)?;
    let before_format_version = stored_world.document.format_version;
    state.append_zoo_journal(
        world_id,
        &command_id,
        &player,
        expected_version,
        &command,
        ZooJournalEntry {
            stage: "prepared".to_owned(),
            before_format_version,
            after_format_version: None,
            events: Vec::new(),
            error: None,
        },
    )?;

    if stored_world.version != expected_version {
        let error = format!(
            "version mismatch: expected {}, found {}",
            expected_version, stored_world.version
        );
        state.append_zoo_journal(
            world_id,
            &command_id,
            &player,
            expected_version,
            &command,
            ZooJournalEntry {
                stage: "rejected".to_owned(),
                before_format_version,
                after_format_version: None,
                events: Vec::new(),
                error: Some(error.clone()),
            },
        )?;
        return Ok(ZooJournaledCommandResult {
            stored_world,
            outcome: Err(error),
        });
    }

    let mut world = match GameWorld::from_document(stored_world.document.clone()) {
        Ok(world) => world,
        Err(error) => {
            let error = error.to_string();
            state.append_zoo_journal(
                world_id,
                &command_id,
                &player,
                expected_version,
                &command,
                ZooJournalEntry {
                    stage: "rejected".to_owned(),
                    before_format_version,
                    after_format_version: None,
                    events: Vec::new(),
                    error: Some(error.clone()),
                },
            )?;
            return Ok(ZooJournaledCommandResult {
                stored_world,
                outcome: Err(error),
            });
        }
    };

    let outcome = world
        .require_player_mut(player.clone())
        .map_err(|error| error.to_string())
        .and_then(|player_state| {
            apply_zoo_command(player_state, command.clone()).map_err(|error| error.to_string())
        });

    match outcome {
        Ok(outcome) => {
            let next_world = StoredWorldDocument {
                version: stored_world.version.checked_add(1).ok_or_else(|| {
                    RepositoryError::Storage("world version overflowed".to_owned())
                })?,
                document: world.save_document(),
            };
            match state.save_world(world_id, stored_world.version, &next_world) {
                Ok(()) => {
                    state.append_zoo_journal(
                        world_id,
                        &command_id,
                        &player,
                        expected_version,
                        &command,
                        ZooJournalEntry {
                            stage: "committed".to_owned(),
                            before_format_version,
                            after_format_version: Some(next_world.document.format_version),
                            events: outcome.events.clone(),
                            error: None,
                        },
                    )?;
                    Ok(ZooJournaledCommandResult {
                        stored_world: next_world,
                        outcome: Ok(outcome),
                    })
                }
                Err(RepositoryError::Conflict(message)) => {
                    state.append_zoo_journal(
                        world_id,
                        &command_id,
                        &player,
                        expected_version,
                        &command,
                        ZooJournalEntry {
                            stage: "rejected".to_owned(),
                            before_format_version,
                            after_format_version: None,
                            events: Vec::new(),
                            error: Some(message.clone()),
                        },
                    )?;
                    Ok(ZooJournaledCommandResult {
                        stored_world: state.load_world(world_id)?,
                        outcome: Err(message),
                    })
                }
                Err(error) => {
                    state.append_zoo_journal(
                        world_id,
                        &command_id,
                        &player,
                        expected_version,
                        &command,
                        ZooJournalEntry {
                            stage: "rejected".to_owned(),
                            before_format_version,
                            after_format_version: None,
                            events: Vec::new(),
                            error: Some(error.to_string()),
                        },
                    )?;
                    Err(error)
                }
            }
        }
        Err(error) => {
            state.append_zoo_journal(
                world_id,
                &command_id,
                &player,
                expected_version,
                &command,
                ZooJournalEntry {
                    stage: "rejected".to_owned(),
                    before_format_version,
                    after_format_version: None,
                    events: Vec::new(),
                    error: Some(error.clone()),
                },
            )?;
            Ok(ZooJournaledCommandResult {
                stored_world,
                outcome: Err(error),
            })
        }
    }
}

fn player_views_from_world(
    world: &GameWorld,
) -> Result<Vec<ZooPlayerView>, (StatusCode, Json<ApiError>)> {
    world
        .players()
        .map(|(player_id, _)| player_view_from_world(world, player_id))
        .collect()
}

fn player_view_from_world(
    world: &GameWorld,
    player_id: &PlayerId,
) -> Result<ZooPlayerView, (StatusCode, Json<ApiError>)> {
    let state = world
        .require_player(player_id.clone())
        .map_err(internal_error)?;
    let view = zoo_view(state);
    let checksum = zoo_checksum(&view).map_err(internal_error)?;
    Ok(ZooPlayerView {
        player_id: player_id.clone(),
        checksum,
        view,
    })
}

fn not_found(message: String) -> (StatusCode, Json<ApiError>) {
    (StatusCode::NOT_FOUND, Json(ApiError { error: message }))
}

fn repository_error(error: RepositoryError) -> (StatusCode, Json<ApiError>) {
    match error {
        RepositoryError::NotFound(world_id) => not_found(format!("unknown world {world_id}")),
        RepositoryError::Conflict(message) => {
            (StatusCode::CONFLICT, Json(ApiError { error: message }))
        }
        RepositoryError::Storage(message) => internal_error(message),
    }
}

fn internal_error(error: impl ToString) -> (StatusCode, Json<ApiError>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ApiError {
            error: error.to_string(),
        }),
    )
}

fn lock_error<T>(_: T) -> (StatusCode, Json<ApiError>) {
    internal_error("world store lock was poisoned")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use farm_engine::{GameCommand, GridOrientation, MapLocation};
    use std::path::PathBuf;
    use tower::ServiceExt;
    use zoo_game::{GUEST_PATH, TICKET_BOOTH, ZEBRA_HERD, ZooCommand};

    #[tokio::test]
    async fn creates_world_and_fetches_player() {
        let app = app(AppState::default());
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/worlds")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"players":["alice","bob"]}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn rejected_zoo_command_keeps_version_and_player_view_unchanged() {
        let state = AppState::default();
        let Json(created) = create_world(
            State(state.clone()),
            Json(ZooCreateWorldRequest {
                players: vec!["alice".to_owned()],
            }),
        )
        .await
        .unwrap();
        let before_checksum = created.players[0].checksum.clone();

        let Json(response) = apply_command(
            State(state.clone()),
            Path((created.world_id.to_string(), "alice".to_owned())),
            Json(ZooApplyCommandRequest {
                expected_version: 0,
                command: ZooCommand::Engine(farm_engine::GameCommand::SpawnEntity {
                    blueprint: farm_engine::EntityBlueprintRef::Npc(ZEBRA_HERD.into()),
                    name: None,
                    location: MapLocation::new(8, 14),
                }),
            }),
        )
        .await
        .unwrap();

        assert!(!response.accepted);
        assert_eq!(response.version, 0);
        assert_eq!(response.checksum, before_checksum);
        assert_eq!(
            response
                .view
                .entities
                .iter()
                .filter(|entity| entity.kind == ZEBRA_HERD)
                .count(),
            0
        );
        assert!(
            response
                .error
                .as_deref()
                .is_some_and(|error| error.contains("no animal area"))
        );

        let Json(fetched) = get_player(
            State(state),
            Path((created.world_id.to_string(), "alice".to_owned())),
        )
        .await
        .unwrap();
        assert_eq!(fetched.checksum, before_checksum);
        assert_eq!(
            fetched
                .view
                .entities
                .iter()
                .filter(|entity| entity.kind == ZEBRA_HERD)
                .count(),
            0
        );
    }

    #[tokio::test]
    async fn construct_building_command_uses_authoritative_rectangular_placement() {
        let state = AppState::default();
        let Json(created) = create_world(
            State(state.clone()),
            Json(ZooCreateWorldRequest {
                players: vec!["alice".to_owned()],
            }),
        )
        .await
        .unwrap();

        let Json(accepted) = apply_command(
            State(state.clone()),
            Path((created.world_id.to_string(), "alice".to_owned())),
            Json(ZooApplyCommandRequest {
                expected_version: 0,
                command: ZooCommand::Engine(GameCommand::ConstructBuilding {
                    kind: TICKET_BOOTH.into(),
                    location: MapLocation::new(15, 5),
                    orientation: GridOrientation::East,
                }),
            }),
        )
        .await
        .unwrap();

        assert!(accepted.accepted, "{:?}", accepted.error);
        assert_eq!(accepted.version, 1);
        let booth = accepted
            .view
            .buildings
            .iter()
            .find(|building| building.kind == TICKET_BOOTH)
            .expect("accepted command should add the ticket booth");
        assert_eq!(booth.location, MapLocation::new(15, 5));
        assert_eq!(booth.orientation, GridOrientation::East);
        assert_eq!(booth.footprint.occupied_offsets.len(), 4);
        let accepted_checksum = accepted.checksum.clone();

        let Json(rejected) = apply_command(
            State(state.clone()),
            Path((created.world_id.to_string(), "alice".to_owned())),
            Json(ZooApplyCommandRequest {
                expected_version: 1,
                command: ZooCommand::Engine(GameCommand::ConstructBuilding {
                    kind: TICKET_BOOTH.into(),
                    location: MapLocation::new(17, 5),
                    orientation: GridOrientation::East,
                }),
            }),
        )
        .await
        .unwrap();

        assert!(!rejected.accepted);
        assert_eq!(rejected.version, 1);
        assert_eq!(rejected.checksum, accepted_checksum);
        assert!(
            rejected
                .error
                .as_deref()
                .is_some_and(|error| error.contains("placement rule is not met"))
        );
        assert_eq!(
            rejected
                .view
                .buildings
                .iter()
                .filter(|building| building.kind == TICKET_BOOTH)
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn evaluates_building_placement_without_applying_command() {
        let state = AppState::default();
        let Json(created) = create_world(
            State(state.clone()),
            Json(ZooCreateWorldRequest {
                players: vec!["alice".to_owned()],
            }),
        )
        .await
        .unwrap();

        let Json(evaluation) = evaluate_placement(
            State(state.clone()),
            Path((created.world_id.to_string(), "alice".to_owned())),
            Json(ZooPlacementEvaluationRequest {
                kind: TICKET_BOOTH.into(),
                location: MapLocation::new(15, 5),
                orientation: GridOrientation::East,
            }),
        )
        .await
        .unwrap();

        assert!(evaluation.valid, "{evaluation:?}");
        assert_eq!(evaluation.occupied_tiles.len(), 4);
        assert!(evaluation.rejection.is_none());

        let Json(fetched) = get_player(
            State(state),
            Path((created.world_id.to_string(), "alice".to_owned())),
        )
        .await
        .unwrap();
        assert_eq!(
            fetched
                .view
                .buildings
                .iter()
                .filter(|building| building.kind == TICKET_BOOTH)
                .count(),
            0
        );
    }

    #[tokio::test]
    async fn sqlite_worlds_survive_reopening_store() {
        let path = temp_db_path("survive");
        let state = AppState::sqlite(&path).unwrap();
        let Json(created) = create_world(
            State(state.clone()),
            Json(ZooCreateWorldRequest {
                players: vec!["alice".to_owned()],
            }),
        )
        .await
        .unwrap();
        assert_eq!(state.list_worlds().unwrap()[0].version, 0);
        drop(state);

        let reopened = AppState::sqlite(&path).unwrap();
        let Json(fetched) = get_player(
            State(reopened),
            Path((created.world_id.to_string(), "alice".to_owned())),
        )
        .await
        .unwrap();

        assert_eq!(fetched.player_id, "alice".into());
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn sqlite_commands_conflicts_and_ticks_are_persisted() {
        let path = temp_db_path("journal");
        let state = AppState::sqlite(&path).unwrap();
        let Json(created) = create_world(
            State(state.clone()),
            Json(ZooCreateWorldRequest {
                players: vec!["alice".to_owned()],
            }),
        )
        .await
        .unwrap();

        let command = ZooCommand::Engine(GameCommand::CreatePath {
            kind: GUEST_PATH.into(),
            waypoints: vec![MapLocation::new(3, 15), MapLocation::new(4, 15)],
        });
        let Json(committed) = apply_command(
            State(state.clone()),
            Path((created.world_id.to_string(), "alice".to_owned())),
            Json(ZooApplyCommandRequest {
                expected_version: 0,
                command: command.clone(),
            }),
        )
        .await
        .unwrap();
        assert!(committed.accepted);
        assert_eq!(committed.version, 1);

        let Json(conflict) = apply_command(
            State(state.clone()),
            Path((created.world_id.to_string(), "alice".to_owned())),
            Json(ZooApplyCommandRequest {
                expected_version: 0,
                command,
            }),
        )
        .await
        .unwrap();
        assert!(!conflict.accepted);
        assert_eq!(conflict.version, 1);
        assert!(
            conflict
                .error
                .as_deref()
                .is_some_and(|error| error.contains("version mismatch"))
        );

        let Json(ticked) = tick_world(
            State(state.clone()),
            Path(created.world_id.to_string()),
            Json(ZooTickRequest { delta_seconds: 5 }),
        )
        .await
        .unwrap();
        assert_eq!(ticked.version, 2);
        assert_eq!(state.list_worlds().unwrap()[0].version, 2);

        let connection = Connection::open(&path).unwrap();
        let journal_rows: i64 = connection
            .query_row("select count(*) from command_journal", [], |row| row.get(0))
            .unwrap();
        assert!(journal_rows >= 4);

        drop(connection);
        let _ = std::fs::remove_file(path);
    }

    fn temp_db_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "zoo-server-{name}-{}-{nanos}.sqlite3",
            std::process::id()
        ))
    }
}
