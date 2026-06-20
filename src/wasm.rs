use super::*;
use farm_engine::{BuildingPlacementCandidate, PlacementRejection};
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct WasmPlacementEvaluation {
    valid: bool,
    occupied_tiles: Vec<MapLocation>,
    rejection_code: Option<String>,
    message: Option<String>,
}

#[wasm_bindgen]
pub struct WasmZoo {
    state: GameState,
    version: u64,
}

#[wasm_bindgen]
impl WasmZoo {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<WasmZoo, JsValue> {
        Ok(Self {
            state: new_zoo_state().map_err(|error| JsValue::from_str(&error.to_string()))?,
            version: 0,
        })
    }

    pub fn view_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&zoo_view(&self.state))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn catalog_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&zoo_catalog()).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn evaluate_placement_json(&self, candidate_json: &str) -> Result<String, JsValue> {
        let candidate: BuildingPlacementCandidate = serde_json::from_str(candidate_json)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let evaluation = self.state.evaluate_building_placement(candidate);
        let response = WasmPlacementEvaluation {
            valid: evaluation.valid,
            occupied_tiles: evaluation.occupied_tiles,
            rejection_code: evaluation
                .rejection
                .as_ref()
                .map(|rejection| rejection.code().to_owned()),
            message: evaluation
                .rejection
                .as_ref()
                .map(placement_rejection_message),
        };
        serde_json::to_string(&response).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn apply_json(&mut self, command_json: &str) -> Result<String, JsValue> {
        let command: GameCommand = serde_json::from_str(command_json)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let outcome = apply_zoo_command(&mut self.state, command)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.version += 1;
        let response = command_response(true, self.version, outcome.events, &self.state, None)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        serde_json::to_string(&response).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn apply_zoo_command_json(&mut self, command_json: &str) -> Result<String, JsValue> {
        let command: ZooCommand = serde_json::from_str(command_json)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let outcome = apply_zoo_command(&mut self.state, command)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.version += 1;
        let response = command_response(true, self.version, outcome.events, &self.state, None)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        serde_json::to_string(&response).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn advance(&mut self, delta_seconds: u64) -> Result<String, JsValue> {
        let mut logic = ZooLogic;
        self.state
            .advance_time_with_logic(delta_seconds, &mut logic)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.version += 1;
        let response = command_response(true, self.version, Vec::new(), &self.state, None)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        serde_json::to_string(&response).map_err(|error| JsValue::from_str(&error.to_string()))
    }
}

fn placement_rejection_message(rejection: &PlacementRejection) -> String {
    match rejection {
        PlacementRejection::UnknownBuildingKind(kind) => format!("Unknown building kind {kind}."),
        PlacementRejection::LockedBuilding(kind) => format!("{kind} is locked."),
        PlacementRejection::UnknownLevel { kind, level } => {
            format!("{kind} has no level {level}.")
        }
        PlacementRejection::RequirementNotMet(_) => "Requirements are not met.".to_owned(),
        PlacementRejection::WorkerUnavailable { .. } => {
            "Not enough workers are available.".to_owned()
        }
        PlacementRejection::NotBuildable(_) => "Choose a buildable tile.".to_owned(),
        PlacementRejection::OutOfBounds(_) => "Choose a tile inside the zoo grounds.".to_owned(),
        PlacementRejection::RuleNotMet(rule) => placement_rule_message(rule),
        PlacementRejection::InsufficientResources(_) => "Not enough resources.".to_owned(),
        PlacementRejection::ArithmeticOverflow => "Placement could not be calculated.".to_owned(),
    }
}

fn placement_rule_message(rule: &PlacementRule) -> String {
    match rule {
        PlacementRule::RequiresAreaKind(kind) if kind.as_str() == STARTER_PLOT => {
            "Choose a tile inside the starter plot.".to_owned()
        }
        PlacementRule::RequiresAreaKind(kind) if kind.as_str() == GUEST_ZONE => {
            "Guest buildings must be inside the guest zone.".to_owned()
        }
        PlacementRule::RequiresAreaKind(kind) if kind.as_str() == STAFF_ZONE => {
            "Staff buildings must be inside the staff zone.".to_owned()
        }
        PlacementRule::RequiresAreaKind(kind) if kind.as_str() == HABITAT_ZONE => {
            "Habitats must be inside the habitat zone.".to_owned()
        }
        PlacementRule::AdjacentToPath => "Building must touch a path.".to_owned(),
        PlacementRule::NoOverlap => "Choose a clear tile.".to_owned(),
        PlacementRule::NoPathOverlap => "Building cannot occupy a path tile.".to_owned(),
        PlacementRule::Not(_) => "Building cannot occupy that tile.".to_owned(),
        PlacementRule::WithinBounds => "Choose a tile inside the zoo grounds.".to_owned(),
        _ => "Placement rule is not met.".to_owned(),
    }
}
