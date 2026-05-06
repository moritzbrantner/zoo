use super::components::*;
use super::resources::*;
use super::schedule::zoo_schedule;
use crate::*;
use bevy_ecs::world::World as EcsWorld;
use farm_engine::GameStateDocument;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ZooSimDocument {
    legacy: GameStateDocument,
}

pub(crate) struct BevyZooState {
    state: GameState,
    ecs: EcsWorld,
    version: u64,
}

impl BevyZooState {
    pub(crate) fn new() -> Result<Self, EngineError> {
        Self::from_state(new_zoo_state()?)
    }

    pub(crate) fn from_state(state: GameState) -> Result<Self, EngineError> {
        let mut sim = Self {
            state,
            ecs: EcsWorld::new(),
            version: 0,
        };
        sim.rebuild_ecs();
        Ok(sim)
    }

    pub(crate) fn from_document(document: ZooSimDocument) -> Result<Self, EngineError> {
        Self::from_state(GameState::from_document(document.legacy)?)
    }

    pub(crate) fn save_document(&self) -> ZooSimDocument {
        ZooSimDocument {
            legacy: self.state.save_document(),
        }
    }

    pub(crate) fn apply_command(
        &mut self,
        command: impl Into<ZooCommand>,
    ) -> Result<CommandOutcome, ZooError> {
        let outcome = apply_zoo_command(&mut self.state, command)?;
        self.version = self.version.saturating_add(1);
        self.rebuild_ecs();
        Ok(outcome)
    }

    pub(crate) fn advance(&mut self, delta_seconds: u64) -> Result<Vec<GameEvent>, EngineError> {
        let mut logic = ZooLogic;
        let outcome = self
            .state
            .advance_time_and_collect_events_with_logic(delta_seconds, &mut logic)?;
        self.version = self.version.saturating_add(1);
        self.rebuild_ecs_with_delta(delta_seconds);
        Ok(outcome.events)
    }

    pub(crate) fn view(&self) -> ZooView {
        zoo_view(&self.state)
    }

    pub(crate) fn checksum(&self) -> Result<String, ZooError> {
        zoo_checksum(&self.view())
    }

    pub(crate) fn ecs_summary(&self) -> ZooEcsSummary {
        *self
            .ecs
            .get_resource::<ZooEcsSummary>()
            .expect("Bevy zoo ECS should always have a summary resource")
    }

    pub(crate) fn version(&self) -> u64 {
        self.version
    }

    pub(crate) fn state(&self) -> &GameState {
        &self.state
    }

    fn rebuild_ecs(&mut self) {
        self.rebuild_ecs_with_delta(0);
    }

    fn rebuild_ecs_with_delta(&mut self, delta_seconds: u64) {
        self.ecs = ecs_world_from_state(&self.state, delta_seconds);
        zoo_schedule().run(&mut self.ecs);
    }
}

fn ecs_world_from_state(state: &GameState, delta_seconds: u64) -> EcsWorld {
    let mut world = EcsWorld::new();
    world.insert_resource(SimClock {
        now_seconds: state.now_seconds(),
        delta_seconds,
    });
    world.insert_resource(ZooInventory(state.inventory().clone()));
    world.insert_resource(ZooStats(
        state
            .stats()
            .map(|(stat, value)| (stat.clone(), *value))
            .collect(),
    ));
    world.insert_resource(ZooProgress {
        level: state.player_level(),
        xp: state.player_xp(),
    });
    world.insert_resource(ZooMap {
        ground_count: state.ground_locations().count(),
        path_count: state.paths().count(),
        area_count: state.areas().count(),
        fence_count: state.fences().count(),
    });
    world.insert_resource(ZooEvents::default());
    world.insert_resource(ZooPricing::from(pricing_snapshot(state)));
    world.insert_resource(ZooEcsSummary::default());

    for building in state.buildings() {
        world.spawn((
            LegacyBuildingId(building.id),
            BuildingKindComponent(building.kind.clone()),
            BuildingStatusComponent(building.status.clone()),
            BuildingStats(building.stats.clone()),
            InventoryComponent(building.inventory.clone()),
            Location(building.location),
        ));
    }

    for entity in state.entities() {
        let assignment = entity.assignment.as_ref().map(|assignment| Assignment {
            building: assignment.assigned_building,
            job: assignment.assigned_job,
        });
        let mut entity_world = world.spawn((
            LegacyEntityId(entity.id),
            EntityKindComponent {
                blueprint: entity.blueprint.clone(),
                kind: entity.kind().to_owned(),
            },
            Location(entity.location),
        ));
        if let Some(assignment) = assignment {
            entity_world.insert(assignment);
        }
        if is_animal_kind(entity.kind()) {
            entity_world.insert(AnimalStats {
                hunger: stat_value(&entity.stats, HUNGER),
                health: stat_value(&entity.stats, HEALTH),
                welfare: stat_value(&entity.stats, WELFARE),
                habitat_id: stat_value(&entity.stats, HABITAT_ID),
                feed_progress: stat_value(&entity.stats, FEED_PROGRESS),
            });
        }
        if entity.kind() == GUEST {
            entity_world.insert(GuestStats {
                excitement: stat_value(&entity.stats, EXCITEMENT),
                patience: stat_value(&entity.stats, PATIENCE),
                spend_chance: stat_value(&entity.stats, SPEND_CHANCE),
            });
        }
    }

    world
}

fn stat_value(stats: &std::collections::BTreeMap<StatId, i64>, stat: &str) -> i64 {
    stats.get(&StatId::from(stat)).copied().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_ecs_summary_matches_view(sim: &BevyZooState) {
        let view = sim.view();
        assert!(
            sim.ecs_summary().matches_view_summary(&view.summary),
            "ECS summary did not match view summary: ecs={:?}, view={:?}",
            sim.ecs_summary(),
            view.summary
        );
    }

    #[test]
    fn initial_bevy_state_matches_legacy_view_summary() {
        let sim = BevyZooState::new().unwrap();
        let view = sim.view();

        assert_eq!(view.summary.current_visitors, 4);
        assert_eq!(view.summary.tracked_guests, 4);
        assert_eq!(view.summary.animal_count, 0);
        assert_ecs_summary_matches_view(&sim);
    }

    #[test]
    fn bevy_state_keeps_summary_parity_after_fixed_tick() {
        let mut sim = BevyZooState::new().unwrap();

        sim.advance(60).unwrap();

        assert_eq!(sim.version(), 1);
        assert_ecs_summary_matches_view(&sim);
    }

    #[test]
    fn bevy_command_bridge_preserves_path_command_parity() {
        let mut sim = BevyZooState::new().unwrap();
        let mut legacy = new_zoo_state().unwrap();
        let command = GameCommand::CreatePath {
            kind: GUEST_PATH.into(),
            waypoints: vec![MapLocation::new(3, 15), MapLocation::new(4, 15)],
        };

        sim.apply_command(command.clone()).unwrap();
        apply_zoo_command(&mut legacy, command).unwrap();

        assert_eq!(sim.state().paths().count(), legacy.paths().count());
        assert_eq!(
            sim.checksum().unwrap(),
            zoo_checksum(&zoo_view(&legacy)).unwrap()
        );
        assert_ecs_summary_matches_view(&sim);
    }

    #[test]
    fn bevy_command_rejection_does_not_partially_mutate_state() {
        let mut sim = BevyZooState::new().unwrap();
        let before = sim.checksum().unwrap();

        let result = sim.apply_command(GameCommand::ConstructBuilding {
            kind: ANIMAL_AREA.into(),
            location: MapLocation::new(20, 2),
        });

        assert!(result.is_err());
        assert_eq!(sim.checksum().unwrap(), before);
        assert_eq!(sim.version(), 0);
        assert_ecs_summary_matches_view(&sim);
    }

    #[test]
    fn bevy_document_round_trip_preserves_view_checksum() {
        let mut sim = BevyZooState::new().unwrap();
        sim.advance(30).unwrap();
        let checksum = sim.checksum().unwrap();
        let restored = BevyZooState::from_document(sim.save_document()).unwrap();

        assert_eq!(restored.checksum().unwrap(), checksum);
        assert_ecs_summary_matches_view(&restored);
    }

    #[test]
    fn bevy_replay_is_deterministic() {
        let commands = vec![
            GameCommand::CreatePath {
                kind: GUEST_PATH.into(),
                waypoints: vec![MapLocation::new(3, 15), MapLocation::new(4, 15)],
            },
            GameCommand::CreateArea {
                kind: GUEST_ZONE.into(),
                tiles: vec![MapLocation::new(4, 15), MapLocation::new(5, 15)],
            },
        ];
        let mut first = BevyZooState::new().unwrap();
        let mut second = BevyZooState::new().unwrap();

        for command in commands {
            first.apply_command(command.clone()).unwrap();
            second.apply_command(command).unwrap();
        }
        first.advance(45).unwrap();
        second.advance(45).unwrap();

        assert_eq!(first.checksum().unwrap(), second.checksum().unwrap());
        assert_ecs_summary_matches_view(&first);
        assert_ecs_summary_matches_view(&second);
    }
}
