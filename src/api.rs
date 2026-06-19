use super::*;

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooCommandRequest {
    pub command_id: CommandId,
    pub world_id: WorldId,
    pub player_id: PlayerId,
    pub expected_version: u64,
    pub command: ZooCommand,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum ZooCommand {
    Engine(GameCommand),
    SetEntryFee {
        building: BuildingId,
        value: i64,
    },
    BuyAnimal {
        kind: NpcKind,
        name: Option<String>,
        location: MapLocation,
    },
    MoveAnimal {
        entity: EntityId,
        location: MapLocation,
    },
}

impl From<GameCommand> for ZooCommand {
    fn from(command: GameCommand) -> Self {
        Self::Engine(command)
    }
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooCommandResponse {
    pub accepted: bool,
    pub version: u64,
    pub checksum: String,
    pub events: Vec<GameEvent>,
    pub view: ZooView,
    pub error: Option<String>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooCreateWorldRequest {
    pub players: Vec<String>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooPlayerView {
    pub player_id: PlayerId,
    pub checksum: String,
    pub view: ZooView,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooCreateWorldResponse {
    pub world_id: WorldId,
    pub version: u64,
    pub players: Vec<ZooPlayerView>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooWorldListItem {
    pub world_id: WorldId,
    pub version: u64,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooWorldListResponse {
    pub worlds: Vec<ZooWorldListItem>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooApplyCommandRequest {
    pub expected_version: u64,
    pub command: ZooCommand,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooPlacementEvaluationRequest {
    pub kind: String,
    pub location: MapLocation,
    pub orientation: GridOrientation,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooPlacementEvaluationResponse {
    pub valid: bool,
    pub occupied_tiles: Vec<MapLocation>,
    pub rejection: Option<ZooPlacementRejectionView>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooPlacementRejectionView {
    pub code: String,
    pub message: String,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooTickRequest {
    pub delta_seconds: u64,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooTickResponse {
    pub version: u64,
    pub events: BTreeMap<PlayerId, Vec<GameEvent>>,
    pub players: Vec<ZooPlayerView>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooView {
    pub now_seconds: u64,
    pub resources: Vec<ResourceView>,
    pub buildings: Vec<BuildingView>,
    pub jobs: Vec<JobView>,
    pub paths: Vec<PathView>,
    pub areas: Vec<AreaView>,
    pub fences: Vec<FenceView>,
    pub entities: Vec<EntityView>,
    pub animal_species: Vec<AnimalSpeciesView>,
    pub tech_nodes: Vec<String>,
    pub available_tech_nodes: Vec<String>,
    pub upgrades: Vec<String>,
    pub alerts: Vec<AlertView>,
    pub objectives: Vec<ObjectiveView>,
    pub summary: ZooSummary,
    pub economy: ZooEconomyView,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ResourceView {
    pub id: String,
    pub label: String,
    pub amount: u64,
    pub capacity: Option<u64>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct BuildingView {
    pub id: u64,
    pub kind: String,
    pub label: String,
    pub location: MapLocation,
    pub orientation: GridOrientation,
    pub footprint: BuildingFootprint,
    pub height: u32,
    pub level: u32,
    pub required_workers: u32,
    pub assigned_workers: u32,
    pub manned: bool,
    pub status: String,
    pub production: String,
    pub inventory: Vec<ResourceView>,
    pub stats: BTreeMap<String, i64>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct JobView {
    pub id: u64,
    pub kind: String,
    pub completes_at_seconds: u64,
    pub assigned_entities: Vec<u64>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct PathView {
    pub id: u64,
    pub kind: String,
    pub waypoints: Vec<MapLocation>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct AreaView {
    pub id: u64,
    pub kind: String,
    pub tiles: Vec<MapLocation>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct FenceView {
    pub id: u64,
    pub kind: String,
    pub start: MapLocation,
    pub end: MapLocation,
    pub height: u32,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct EntityView {
    pub id: u64,
    pub blueprint: EntityBlueprintRef,
    pub kind: String,
    pub label: String,
    pub location: MapLocation,
    pub assigned_building: Option<u64>,
    pub assigned_job: Option<u64>,
    pub stats: BTreeMap<String, i64>,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct AnimalSpeciesView {
    pub kind: String,
    pub label: String,
    pub required_visitors: u64,
    pub unlocked: bool,
    pub placed_count: u32,
    pub appeal: i64,
    pub purchase_cost: Vec<AnimalSpeciesCostView>,
    pub animal_area_kind: String,
    pub min_level: u32,
    pub fence_kind: String,
    pub min_fence_count: u32,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct AnimalSpeciesCostView {
    pub resource_id: String,
    pub label: String,
    pub amount: u64,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct AlertView {
    pub severity: String,
    pub message: String,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveView {
    pub id: String,
    pub label: String,
    pub current: i64,
    pub target: i64,
    pub complete: bool,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooEconomyView {
    pub revenue_last_tick: i64,
    pub expenses_last_tick: i64,
    pub net_cashflow_last_tick: i64,
    pub projected_cashflow_per_minute: i64,
    pub ticket_revenue_last_tick: i64,
    pub guest_spend_last_tick: i64,
    pub feed_delivery_cost_last_tick: i64,
}

#[cfg_attr(feature = "contracts", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ZooSummary {
    pub active_habitats: u32,
    pub animal_count: u32,
    pub average_welfare: i64,
    pub animal_appeal: i64,
    pub current_visitors: u64,
    pub entry_fee: i64,
    pub customer_willingness: i64,
    pub customer_demand_percent: i64,
    pub expected_customers_per_minute: u32,
    pub tracked_guests: u32,
    pub guest_departures_last_tick: u32,
    pub reputation_level: u32,
    pub won: bool,
    pub critical: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AnimalPurchaseError {
    UnknownAnimalKind(String),
    SpeciesLocked {
        animal_kind: String,
        required_visitors: u64,
        current_visitors: u64,
    },
    NoAnimalAreaAtLocation {
        animal_kind: String,
        location: MapLocation,
    },
    AnimalAreaUnavailable {
        animal_kind: String,
        animal_area: BuildingId,
    },
    AnimalAreaRequirementsNotMet {
        animal_kind: String,
        animal_area: BuildingId,
        requirements: AnimalAreaRequirements,
    },
    MixedAnimalKinds {
        animal_area: BuildingId,
        existing_kind: String,
        requested_kind: String,
    },
}

impl fmt::Display for AnimalPurchaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AnimalPurchaseError::UnknownAnimalKind(kind) => {
                write!(formatter, "unknown animal kind {kind}")
            }
            AnimalPurchaseError::SpeciesLocked {
                animal_kind,
                required_visitors,
                current_visitors,
            } => write!(
                formatter,
                "{animal_kind} unlocks at {required_visitors} visitors, current visitors {current_visitors}"
            ),
            AnimalPurchaseError::NoAnimalAreaAtLocation {
                animal_kind,
                location,
            } => write!(
                formatter,
                "no animal area at ({}, {}) for {animal_kind}",
                location.x, location.y
            ),
            AnimalPurchaseError::AnimalAreaUnavailable {
                animal_kind,
                animal_area,
            } => write!(
                formatter,
                "animal area {animal_area} is unavailable for {animal_kind}"
            ),
            AnimalPurchaseError::AnimalAreaRequirementsNotMet {
                animal_kind,
                animal_area,
                requirements,
            } => write!(
                formatter,
                "animal area {animal_area} does not meet {animal_kind} requirements: level {} {}, {} attached {} fence(s)",
                requirements.min_level,
                requirements.animal_area_kind,
                requirements.min_fence_count,
                requirements.fence_kind
            ),
            AnimalPurchaseError::MixedAnimalKinds {
                animal_area,
                existing_kind,
                requested_kind,
            } => write!(
                formatter,
                "animal area {animal_area} already contains {existing_kind}, so it cannot receive {requested_kind}"
            ),
        }
    }
}

impl Error for AnimalPurchaseError {}

#[derive(Debug)]
pub enum ZooError {
    Engine(EngineError),
    World(GameWorldError),
    Serde(serde_json::Error),
    Animal(AnimalPurchaseError),
    MissingPlayer(PlayerId),
}

impl fmt::Display for ZooError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ZooError::Engine(error) => error.fmt(formatter),
            ZooError::World(error) => error.fmt(formatter),
            ZooError::Serde(error) => error.fmt(formatter),
            ZooError::Animal(error) => error.fmt(formatter),
            ZooError::MissingPlayer(player) => write!(formatter, "missing player {player}"),
        }
    }
}

impl Error for ZooError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            ZooError::Engine(error) => Some(error),
            ZooError::World(error) => Some(error),
            ZooError::Serde(error) => Some(error),
            ZooError::Animal(error) => Some(error),
            ZooError::MissingPlayer(_) => None,
        }
    }
}

impl From<EngineError> for ZooError {
    fn from(value: EngineError) -> Self {
        Self::Engine(value)
    }
}

impl From<GameWorldError> for ZooError {
    fn from(value: GameWorldError) -> Self {
        Self::World(value)
    }
}

impl From<serde_json::Error> for ZooError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serde(value)
    }
}

impl From<AnimalPurchaseError> for ZooError {
    fn from(value: AnimalPurchaseError) -> Self {
        Self::Animal(value)
    }
}

pub fn zoo_checksum(view: &ZooView) -> Result<String, ZooError> {
    let bytes = serde_json::to_vec(view)?;
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    Ok(format!("{hash:016x}"))
}

pub fn command_response(
    accepted: bool,
    version: u64,
    events: Vec<GameEvent>,
    state: &GameState,
    error: Option<String>,
) -> Result<ZooCommandResponse, ZooError> {
    let view = zoo_view(state);
    let checksum = zoo_checksum(&view)?;
    Ok(ZooCommandResponse {
        accepted,
        version,
        checksum,
        events,
        view,
        error,
    })
}

pub fn evaluate_zoo_building_placement(
    state: &GameState,
    request: ZooPlacementEvaluationRequest,
) -> ZooPlacementEvaluationResponse {
    let evaluation = state.evaluate_building_placement(BuildingPlacementCandidate {
        kind: request.kind.into(),
        location: request.location,
        orientation: request.orientation,
    });
    let rejection = evaluation.rejection.map(|rejection| {
        let code = rejection.code().to_owned();
        let message = placement_rejection_message(&rejection);
        ZooPlacementRejectionView { code, message }
    });

    ZooPlacementEvaluationResponse {
        valid: evaluation.valid,
        occupied_tiles: evaluation.occupied_tiles,
        rejection,
    }
}

fn placement_rejection_message(rejection: &PlacementRejection) -> String {
    match rejection {
        PlacementRejection::UnknownBuildingKind(kind) => {
            format!("Unknown building kind: {kind}.")
        }
        PlacementRejection::LockedBuilding(kind) => {
            format!("{kind} is locked.")
        }
        PlacementRejection::UnknownLevel { kind, level } => {
            format!("{kind} has no level {level}.")
        }
        PlacementRejection::RequirementNotMet(requirement) => {
            format!("Requirement not met: {requirement:?}.")
        }
        PlacementRejection::WorkerUnavailable { required } => {
            format!("{required} workers are required.")
        }
        PlacementRejection::NotBuildable(location) => {
            format!("Tile {},{} is not buildable.", location.x, location.y)
        }
        PlacementRejection::OutOfBounds(location) => {
            format!(
                "Tile {},{} is outside the zoo bounds.",
                location.x, location.y
            )
        }
        PlacementRejection::RuleNotMet(rule) => placement_rule_message(rule),
        PlacementRejection::InsufficientResources(error) => match error {
            ResourceError::Insufficient {
                resource,
                needed,
                available,
            } => format!("{resource} is too low: need {needed}, have {available}."),
            ResourceError::CapacityExceeded {
                resource,
                incoming,
                capacity,
            } => format!("{resource} capacity exceeded: {incoming} incoming, capacity {capacity}."),
            ResourceError::ArithmeticOverflow => "Resource arithmetic overflowed.".to_owned(),
        },
        PlacementRejection::ArithmeticOverflow => "Placement arithmetic overflowed.".to_owned(),
    }
}

fn placement_rule_message(rule: &PlacementRule) -> String {
    match rule {
        PlacementRule::RequiresAreaKind(kind) => {
            format!("Placement must be inside {kind}.")
        }
        PlacementRule::NoPathOverlap => "Placement cannot overlap paths.".to_owned(),
        PlacementRule::AdjacentToPath => "Placement must touch a path.".to_owned(),
        PlacementRule::NoOverlap => "Placement overlaps an existing object.".to_owned(),
        PlacementRule::WithinBounds => "Placement must stay inside the zoo bounds.".to_owned(),
        PlacementRule::OnTileKind(kind) => format!("Placement must be on {kind}."),
        PlacementRule::On(target) => format!("Placement must be on {target:?}."),
        PlacementRule::AdjacentTo(target) => format!("Placement must touch {target:?}."),
        PlacementRule::Not(inner) => format!("Placement must not match {inner:?}."),
    }
}

pub fn apply_local_zoo_command_request(
    state: &mut GameState,
    version: &mut u64,
    request: ZooApplyCommandRequest,
) -> Result<ZooCommandResponse, ZooError> {
    if request.expected_version != *version {
        return command_response(
            false,
            *version,
            Vec::new(),
            state,
            Some(format!(
                "version mismatch: expected {}, found {}",
                request.expected_version, *version
            )),
        );
    }

    match apply_zoo_command(state, request.command) {
        Ok(outcome) => {
            *version += 1;
            command_response(true, *version, outcome.events, state, None)
        }
        Err(error) => command_response(false, *version, Vec::new(), state, Some(error.to_string())),
    }
}
