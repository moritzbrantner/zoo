use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use farm_engine::{CommandId, GameEvent, GameWorld, PlayerId, WorldId};
use farm_persistence::{
    CommandJournalEntry, CommandLog, RepositoryError, StoredWorldDocument, WorldRepository,
    execute_journaled_player_command,
};
use serde::Serialize;
use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tower_http::cors::CorsLayer;
use zoo_game::{
    ZooApplyCommandRequest, ZooCommandResponse, ZooCreateWorldRequest, ZooCreateWorldResponse,
    ZooLogic, ZooPlayerView, ZooTickRequest, ZooTickResponse, apply_zoo_command, command_response,
    new_zoo_world, zoo_checksum, zoo_view,
};

#[derive(Clone, Default)]
struct AppState {
    inner: Arc<Mutex<WorldStore>>,
}

#[derive(Default)]
struct WorldStore {
    next_world_id: u64,
    next_command_id: u64,
    worlds: BTreeMap<WorldId, StoredWorldDocument>,
    journal: Vec<CommandJournalEntry>,
}

#[derive(Debug, Serialize)]
struct ApiError {
    error: String,
}

impl AppState {
    fn allocate_command_id(&self) -> Result<CommandId, (StatusCode, Json<ApiError>)> {
        let mut store = self.inner.lock().map_err(lock_error)?;
        store.next_command_id += 1;
        Ok(CommandId::new(format!(
            "server-command-{}",
            store.next_command_id
        )))
    }
}

impl WorldRepository for AppState {
    fn load_world(&self, id: &WorldId) -> Result<StoredWorldDocument, RepositoryError> {
        let store = self
            .inner
            .lock()
            .map_err(|_| RepositoryError::Storage("world store lock was poisoned".to_owned()))?;
        store
            .worlds
            .get(id)
            .cloned()
            .ok_or_else(|| RepositoryError::NotFound(id.clone()))
    }

    fn save_world(
        &self,
        id: &WorldId,
        expected_version: u64,
        world: &StoredWorldDocument,
    ) -> Result<(), RepositoryError> {
        let mut store = self
            .inner
            .lock()
            .map_err(|_| RepositoryError::Storage("world store lock was poisoned".to_owned()))?;
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
}

impl CommandLog for AppState {
    fn append(&self, entry: CommandJournalEntry) -> Result<(), RepositoryError> {
        let mut store = self
            .inner
            .lock()
            .map_err(|_| RepositoryError::Storage("world store lock was poisoned".to_owned()))?;
        store.journal.push(entry);
        Ok(())
    }
}

#[tokio::main]
async fn main() {
    let app = app(AppState::default());
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
        .route("/api/worlds", post(create_world))
        .route(
            "/api/worlds/{world_id}/players/{player_id}",
            get(get_player),
        )
        .route(
            "/api/worlds/{world_id}/players/{player_id}/commands",
            post(apply_command),
        )
        .route("/api/worlds/{world_id}/tick", post(tick_world))
        .layer(CorsLayer::permissive())
        .with_state(state)
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

    let mut store = state.inner.lock().map_err(lock_error)?;
    store.next_world_id += 1;
    let world_id = WorldId::new(format!("dev-world-{}", store.next_world_id));
    let stored = StoredWorldDocument {
        version: 0,
        document: world.save_document(),
    };
    store.worlds.insert(world_id.clone(), stored.clone());

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
    let result = execute_journaled_player_command(
        &state,
        &state,
        &world_id,
        command_id,
        player_id.clone(),
        request.expected_version,
        request.command,
        apply_zoo_command,
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
    use farm_engine::MapLocation;
    use tower::ServiceExt;
    use zoo_game::ZEBRA_HERD;

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
                command: farm_engine::GameCommand::SpawnEntity {
                    blueprint: farm_engine::EntityBlueprintRef::Npc(ZEBRA_HERD.into()),
                    name: None,
                    location: MapLocation::new(8, 14),
                },
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
}
