use super::*;
use wasm_bindgen::prelude::*;

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

    pub fn evaluate_building_placement_json(&self, request_json: &str) -> Result<String, JsValue> {
        let request: ZooPlacementEvaluationRequest = serde_json::from_str(request_json)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let response = evaluate_zoo_building_placement(&self.state, request);
        serde_json::to_string(&response).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn apply_command_json(&mut self, request_json: &str) -> Result<String, JsValue> {
        let request: ZooApplyCommandRequest = serde_json::from_str(request_json)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let response = apply_local_zoo_command_request(&mut self.state, &mut self.version, request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wasm_exposes_placement_evaluation_json() {
        let zoo = WasmZoo::new().unwrap();
        let response_json = zoo
            .evaluate_building_placement_json(
                r#"{
                    "kind": "animal_area",
                    "location": { "x": 8, "y": 11, "elevation": 0 },
                    "orientation": "North"
                }"#,
            )
            .unwrap();
        let response: ZooPlacementEvaluationResponse =
            serde_json::from_str(&response_json).unwrap();

        assert!(response.valid);
        assert_eq!(response.occupied_tiles.len(), 16);
        assert_eq!(response.rejection, None);

        let invalid_json = zoo
            .evaluate_building_placement_json(
                r#"{
                    "kind": "animal_area",
                    "location": { "x": 28, "y": 11, "elevation": 0 },
                    "orientation": "North"
                }"#,
            )
            .unwrap();
        let invalid: ZooPlacementEvaluationResponse = serde_json::from_str(&invalid_json).unwrap();

        assert!(!invalid.valid);
        assert_eq!(
            invalid
                .rejection
                .as_ref()
                .map(|rejection| rejection.code.as_str()),
            Some("placement_rule_not_met")
        );
    }

    #[test]
    fn wasm_applies_local_commands_with_server_response_shape() {
        let mut zoo = WasmZoo::new().unwrap();
        let accepted_json = zoo
            .apply_command_json(
                r#"{
                    "expected_version": 0,
                    "command": {
                        "Engine": {
                            "ConstructBuilding": {
                                "kind": "animal_area",
                                "location": { "x": 8, "y": 11, "elevation": 0 },
                                "orientation": "North"
                            }
                        }
                    }
                }"#,
            )
            .unwrap();
        let accepted: ZooCommandResponse = serde_json::from_str(&accepted_json).unwrap();

        assert!(accepted.accepted);
        assert_eq!(accepted.version, 1);
        assert!(
            accepted
                .view
                .buildings
                .iter()
                .any(|building| building.kind == ANIMAL_AREA)
        );

        let rejected_json = zoo
            .apply_command_json(
                r#"{
                    "expected_version": 1,
                    "command": {
                        "Engine": {
                            "ConstructBuilding": {
                                "kind": "animal_area",
                                "location": { "x": 28, "y": 11, "elevation": 0 },
                                "orientation": "North"
                            }
                        }
                    }
                }"#,
            )
            .unwrap();
        let rejected: ZooCommandResponse = serde_json::from_str(&rejected_json).unwrap();

        assert!(!rejected.accepted);
        assert_eq!(rejected.version, 1);
        assert!(
            rejected
                .error
                .as_deref()
                .is_some_and(|error| error.contains("placement rule is not met"))
        );
    }
}
