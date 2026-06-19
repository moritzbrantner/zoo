use farm_engine::{
    AreaDefinition, Building, BuildingDefinition, BuildingFootprint, BuildingId,
    BuildingLevelDefinition, BuildingStatus, Catalog, CommandId, CommandOutcome, Effect,
    EngineError, EntityBlueprintRef, EntityId, EntityRecord, FenceDefinition, GameCommand,
    GameEvent, GameLogic, GameState, GameWorld, GameWorldError, GridOrientation, Job,
    JobCompletion, LevelDefinition, MapLocation, NpcDefinition, NpcKind, PathDefinition,
    PlacementRule, PlacementTarget, PlayerId, ProductionQueueConfig, ProductionRule,
    ProductionStatus, Requirement, ResourceAmount, ResourceDefinition, ResourceId, ResourceStorage,
    StatId, TechNodeDefinition, TileDefinition, UnitDefinition, UpgradeDefinition, WorldId,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::error::Error;
use std::fmt;

mod animals;
mod api;
mod catalog;
mod constants;
mod logic;
mod pricing;
mod seed;
mod sim;
mod view;
#[cfg(feature = "wasm")]
mod wasm;

pub use self::animals::{AnimalAreaRequirements, animal_area_requirements};
pub use self::api::*;
pub use self::catalog::zoo_catalog;
pub use self::constants::*;
pub use self::logic::{ZooLogic, apply_zoo_command, buy_animal_group, buy_named_animal_group};
pub use self::pricing::set_park_entry_fee;
pub use self::seed::{new_zoo_state, new_zoo_world};
pub use self::view::zoo_view;

pub(crate) use self::animals::{
    animal_kind_appeal, animal_kind_label, animal_species, animal_species_definitions,
    backfill_species_unlocks, is_animal_kind, is_species_unlocked,
    unlock_species_for_current_visitors,
};
pub(crate) use self::logic::active_habitats;
pub(crate) use self::logic::guest_should_leave;
pub(crate) use self::pricing::{expected_customer_arrivals, pricing_snapshot};
pub(crate) use self::seed::{
    add_entry_and_guest_buildings, add_habitats, add_staff_buildings, add_tech_and_upgrades,
    fence_rules,
};
pub(crate) use self::view::is_habitat_kind;

#[cfg(test)]
mod tests {
    use super::*;
    use farm_engine::{
        BuildingPlacementCandidate, BuildingStatus, GameCommand, PlacementRejection, ResourceError,
    };

    #[test]
    fn catalog_validates() {
        let report = zoo_catalog().validate();
        assert!(report.errors.is_empty(), "{:?}", report.errors);
        assert!(report.warnings.is_empty(), "{:?}", report.warnings);
    }

    #[test]
    fn starting_zoo_has_seeded_world_and_view() {
        let state = new_zoo_state().unwrap();
        let view = zoo_view(&state);
        assert_eq!(
            state.ground_locations().count(),
            (ZOO_SIZE * ZOO_SIZE) as usize
        );
        assert!(view.resources.iter().any(|resource| resource.id == COINS));
        assert!(
            view.buildings
                .iter()
                .any(|building| building.kind == CUSTOMER_ENTRY)
        );
        let entry = view
            .buildings
            .iter()
            .find(|building| building.kind == CUSTOMER_ENTRY)
            .expect("customer entry should be seeded");
        assert_eq!(entry.location, MapLocation::new(ZOO_CENTER - 2, 1));
        assert!(
            view.buildings
                .iter()
                .any(|building| building.kind == ZOOKEEPER_HOUSE)
        );
        let house = view
            .buildings
            .iter()
            .find(|building| building.kind == ZOOKEEPER_HOUSE)
            .expect("zookeeper house should be seeded");
        assert_eq!(house.location, MapLocation::new(18, 14));
        let guest_path = view
            .paths
            .iter()
            .find(|path| path.kind == GUEST_PATH)
            .expect("guest path should be seeded");
        assert!(
            guest_path
                .waypoints
                .contains(&MapLocation::new(ZOO_CENTER + 1, 0))
        );
        assert!(
            guest_path
                .waypoints
                .contains(&MapLocation::new(ZOO_CENTER + 1, ZOO_CENTER))
        );
        assert_eq!(
            view.entities
                .iter()
                .filter(|entity| entity.blueprint == EntityBlueprintRef::Npc(GUEST.into()))
                .count(),
            4
        );
        assert_eq!(view.summary.current_visitors, 4);
        assert_eq!(view.summary.tracked_guests, 4);
        assert_eq!(view.summary.guest_departures_last_tick, 0);
        assert!(
            view.animal_species
                .iter()
                .any(|species| species.kind == RABBIT_COLONY && species.unlocked)
        );
        assert!(
            view.animal_species
                .iter()
                .any(|species| species.kind == LION_PRIDE && !species.unlocked)
        );
    }

    #[test]
    fn starter_plot_is_seeded_as_visible_buildable_grid() {
        let state = new_zoo_state().unwrap();
        let starter_plot = state
            .areas()
            .find(|area| area.kind.as_str() == STARTER_PLOT)
            .expect("starter plot should be seeded");

        assert_eq!(starter_plot.tiles.len(), 24 * 18);
        assert!(starter_plot.tiles.contains(&MapLocation::new(4, 0)));
        assert!(starter_plot.tiles.contains(&MapLocation::new(27, 17)));
        assert!(!starter_plot.tiles.contains(&MapLocation::new(3, 0)));
        assert!(!starter_plot.tiles.contains(&MapLocation::new(28, 17)));
    }

    #[test]
    fn placement_evaluation_reports_zoo_rejections() {
        let mut state = new_zoo_state().unwrap();
        let outside_plot = state.evaluate_building_placement(BuildingPlacementCandidate {
            kind: ANIMAL_AREA.into(),
            location: MapLocation::new(28, 11),
            orientation: GridOrientation::North,
        });
        assert!(!outside_plot.valid);
        assert!(matches!(
            outside_plot.rejection,
            Some(PlacementRejection::RuleNotMet(PlacementRule::RequiresAreaKind(kind)))
                if kind.as_str() == STARTER_PLOT
        ));

        let on_path = state.evaluate_building_placement(BuildingPlacementCandidate {
            kind: ANIMAL_AREA.into(),
            location: MapLocation::new(8, 14),
            orientation: GridOrientation::North,
        });
        assert!(!on_path.valid);
        assert!(matches!(
            on_path.rejection,
            Some(PlacementRejection::RuleNotMet(PlacementRule::NoPathOverlap))
        ));

        let valid = state.evaluate_building_placement(BuildingPlacementCandidate {
            kind: ANIMAL_AREA.into(),
            location: MapLocation::new(8, 11),
            orientation: GridOrientation::North,
        });
        assert!(valid.valid);
        assert_eq!(valid.occupied_tiles.len(), 16);

        let coins = state.inventory().amount(COINS);
        state.inventory_mut().remove(COINS, coins).unwrap();
        let unaffordable = state.evaluate_building_placement(BuildingPlacementCandidate {
            kind: ANIMAL_AREA.into(),
            location: MapLocation::new(8, 11),
            orientation: GridOrientation::North,
        });
        assert!(matches!(
            unaffordable.rejection,
            Some(PlacementRejection::InsufficientResources(_))
        ));

        let locked = state.evaluate_building_placement(BuildingPlacementCandidate {
            kind: WETLANDS_HABITAT.into(),
            location: MapLocation::new(8, 11),
            orientation: GridOrientation::North,
        });
        assert!(matches!(
            locked.rejection,
            Some(PlacementRejection::LockedBuilding(kind)) if kind.as_str() == WETLANDS_HABITAT
        ));
    }

    #[test]
    fn placement_evaluation_rotates_zoo_rectangular_footprints() {
        let state = new_zoo_state().unwrap();

        let north = state.evaluate_building_placement(BuildingPlacementCandidate {
            kind: CUSTOMER_ENTRY.into(),
            location: MapLocation::new(14, 3),
            orientation: GridOrientation::North,
        });
        assert!(north.valid);
        assert_eq!(
            north.occupied_tiles,
            vec![
                MapLocation::new(14, 3),
                MapLocation::new(15, 3),
                MapLocation::new(16, 3),
                MapLocation::new(14, 4),
                MapLocation::new(15, 4),
                MapLocation::new(16, 4),
            ]
        );

        let east = state.evaluate_building_placement(BuildingPlacementCandidate {
            kind: CUSTOMER_ENTRY.into(),
            location: MapLocation::new(15, 6),
            orientation: GridOrientation::East,
        });
        assert!(east.valid);
        assert_eq!(
            east.occupied_tiles,
            vec![
                MapLocation::new(15, 6),
                MapLocation::new(15, 5),
                MapLocation::new(15, 4),
                MapLocation::new(16, 6),
                MapLocation::new(16, 5),
                MapLocation::new(16, 4),
            ]
        );
    }

    #[test]
    fn rotated_zoo_footprint_overlap_is_rejected() {
        let mut state = new_zoo_state().unwrap();

        state
            .start_construction_at_oriented(
                CUSTOMER_ENTRY,
                MapLocation::new(15, 6),
                GridOrientation::East,
            )
            .unwrap();

        let overlap = state.evaluate_building_placement(BuildingPlacementCandidate {
            kind: CUSTOMER_ENTRY.into(),
            location: MapLocation::new(15, 5),
            orientation: GridOrientation::East,
        });

        assert!(!overlap.valid);
        assert_eq!(
            overlap.occupied_tiles,
            vec![
                MapLocation::new(15, 5),
                MapLocation::new(15, 4),
                MapLocation::new(15, 3),
                MapLocation::new(16, 5),
                MapLocation::new(16, 4),
                MapLocation::new(16, 3),
            ]
        );
        assert!(matches!(
            overlap.rejection,
            Some(PlacementRejection::RuleNotMet(PlacementRule::NoOverlap))
        ));
    }

    #[test]
    fn commands_mutate_paths_fences_transfers_and_player_isolation() {
        let mut world = new_zoo_world(["alice".into(), "bob".into()]).unwrap();
        let bob_coins = world
            .require_player("bob")
            .unwrap()
            .inventory()
            .amount(COINS);
        let outcome = world
            .apply_to_player(
                "alice",
                GameCommand::CreatePath {
                    kind: GUEST_PATH.into(),
                    waypoints: vec![MapLocation::new(3, 15), MapLocation::new(4, 15)],
                },
            )
            .unwrap();
        assert!(matches!(
            outcome.events.as_slice(),
            [GameEvent::PathCreated(_)]
        ));
        assert_eq!(world.require_player("alice").unwrap().paths().count(), 3);
        assert_eq!(world.require_player("bob").unwrap().paths().count(), 2);
        assert_eq!(
            world
                .require_player("bob")
                .unwrap()
                .inventory()
                .amount(COINS),
            bob_coins
        );
    }

    #[test]
    fn animal_area_requires_path_and_fences_attach_to_it() {
        let mut state = new_zoo_state().unwrap();
        assert!(matches!(
            state.start_construction_at(ANIMAL_AREA, MapLocation::new(20, 2)),
            Err(EngineError::PlacementRuleNotMet(
                PlacementRule::AdjacentToPath
            ))
        ));

        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        assert_eq!(
            state.building(animal_area).unwrap().kind.as_str(),
            ANIMAL_AREA
        );

        assert!(matches!(
            state.place_fence(WOOD_FENCE, MapLocation::new(20, 20), MapLocation::new(21, 20)),
            Err(EngineError::PlacementRuleNotMet(PlacementRule::AdjacentTo(
                PlacementTarget::BuildingKind(kind)
            ))) if kind.as_str() == ANIMAL_AREA
        ));

        let fence = state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        assert_eq!(state.fence(fence).unwrap().kind.as_str(), WOOD_FENCE);
    }

    #[test]
    fn animal_purchase_requires_species_area_setup() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();

        assert!(matches!(
            buy_animal_group(&mut state, RABBIT_COLONY, animal_area),
            Err(ZooError::Animal(
                AnimalPurchaseError::AnimalAreaRequirementsNotMet { .. }
            ))
        ));

        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        let rabbit = buy_animal_group(&mut state, RABBIT_COLONY, animal_area).unwrap();
        assert_eq!(
            state.entity_stat(rabbit, HABITAT_ID).unwrap(),
            animal_area.get() as i64
        );
        assert_eq!(state.entity(rabbit).unwrap().kind(), RABBIT_COLONY);
    }

    #[test]
    fn animal_purchase_enforces_species_specific_fence_counts_and_spends_costs() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state.inventory_mut().add(VISITORS, 141).unwrap();
        unlock_species_for_current_visitors(&mut state);
        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(8, 10),
                MapLocation::new(9, 10),
            )
            .unwrap();

        assert!(matches!(
            buy_named_animal_group(&mut state, LION_PRIDE, "North Lions", animal_area),
            Err(ZooError::Animal(
                AnimalPurchaseError::AnimalAreaRequirementsNotMet {
                    requirements,
                    ..
                }
            )) if requirements.fence_kind == STEEL_FENCE
                && requirements.min_fence_count == 2
        ));
        assert_eq!(
            state
                .entities()
                .filter(|entity| entity.blueprint == EntityBlueprintRef::Npc(LION_PRIDE.into()))
                .count(),
            0
        );

        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(10, 10),
                MapLocation::new(11, 10),
            )
            .unwrap();
        let coins_before = state.inventory().amount(COINS);
        let meat_before = state.inventory().amount(MEAT);
        let water_before = state.inventory().amount(WATER);

        let lion =
            buy_named_animal_group(&mut state, LION_PRIDE, "North Lions", animal_area).unwrap();

        assert_eq!(state.inventory().amount(COINS), coins_before - 116);
        assert_eq!(state.inventory().amount(MEAT), meat_before - 18);
        assert_eq!(state.inventory().amount(WATER), water_before - 8);
        assert_eq!(
            state.entity(lion).unwrap().name.as_deref(),
            Some("North Lions")
        );
        assert_eq!(state.entity_stat(lion, HUNGER).unwrap(), 20);
        assert_eq!(state.entity_stat(lion, HEALTH).unwrap(), 85);
        assert_eq!(state.entity_stat(lion, WELFARE).unwrap(), 75);
        assert_eq!(
            state.entity_stat(lion, HABITAT_ID).unwrap(),
            animal_area.get() as i64
        );
    }

    #[test]
    fn failed_animal_purchase_leaves_inventory_and_animals_unchanged() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        let vegetables = state.inventory().amount(VEGETABLES);
        state
            .inventory_mut()
            .remove(VEGETABLES, vegetables)
            .unwrap();
        let inventory_before = state.inventory().clone();

        assert!(matches!(
            buy_animal_group(&mut state, RABBIT_COLONY, animal_area),
            Err(ZooError::Engine(EngineError::Resource(
                ResourceError::Insufficient {
                    resource,
                    needed: 4,
                    available: 0
                }
            ))) if resource.as_str() == VEGETABLES
        ));

        assert_eq!(state.inventory(), &inventory_before);
        assert_eq!(
            state
                .entities()
                .filter(|entity| is_animal_kind(entity.kind()))
                .count(),
            0
        );
    }

    #[test]
    fn animal_purchase_rejects_mixed_species_in_one_area() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state.inventory_mut().add(VISITORS, 16).unwrap();
        unlock_species_for_current_visitors(&mut state);
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        state
            .place_fence(
                WOOD_FENCE,
                MapLocation::new(10, 10),
                MapLocation::new(11, 10),
            )
            .unwrap();
        buy_animal_group(&mut state, RABBIT_COLONY, animal_area).unwrap();
        assert!(matches!(
            buy_animal_group(&mut state, TORTOISE_GROUP, animal_area),
            Err(ZooError::Animal(AnimalPurchaseError::MixedAnimalKinds {
                existing_kind,
                requested_kind,
                ..
            })) if existing_kind == RABBIT_COLONY && requested_kind == TORTOISE_GROUP
        ));
    }

    #[test]
    fn zoo_move_npc_command_rehomes_animals_only_to_valid_areas() {
        let mut state = new_zoo_state().unwrap();
        let first_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        let second_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(4, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        let rabbit = buy_animal_group(&mut state, RABBIT_COLONY, first_area).unwrap();
        let original_location = state.entity(rabbit).unwrap().location;
        let second_location = state.building(second_area).unwrap().location;

        assert!(matches!(
            apply_zoo_command(
                &mut state,
                GameCommand::MoveEntity {
                    entity: rabbit,
                    location: second_location,
                },
            ),
            Err(ZooError::Animal(
                AnimalPurchaseError::AnimalAreaRequirementsNotMet { .. }
            ))
        ));
        assert_eq!(state.entity(rabbit).unwrap().location, original_location);
        assert_eq!(
            state.entity_stat(rabbit, HABITAT_ID).unwrap(),
            first_area.get() as i64
        );

        state
            .place_fence(WOOD_FENCE, MapLocation::new(4, 10), MapLocation::new(5, 10))
            .unwrap();
        let outcome = apply_zoo_command(
            &mut state,
            GameCommand::MoveEntity {
                entity: rabbit,
                location: second_location,
            },
        )
        .unwrap();

        assert_eq!(outcome.events, vec![GameEvent::EntityMoved(rabbit)]);
        assert_eq!(state.entity(rabbit).unwrap().location, second_location);
        assert_eq!(
            state.entity_stat(rabbit, HABITAT_ID).unwrap(),
            second_area.get() as i64
        );
    }

    #[test]
    fn zoo_create_npc_command_buys_animals_through_area_rules() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        let animal_area_location = state.building(animal_area).unwrap().location;

        let outcome = apply_zoo_command(
            &mut state,
            GameCommand::SpawnEntity {
                blueprint: EntityBlueprintRef::Npc(RABBIT_COLONY.into()),
                name: None,
                location: animal_area_location,
            },
        )
        .unwrap();

        assert!(matches!(
            outcome.events.as_slice(),
            [GameEvent::EntityCreated(_)]
        ));
        assert_eq!(
            state
                .entities()
                .filter(|entity| entity.blueprint == EntityBlueprintRef::Npc(RABBIT_COLONY.into()))
                .count(),
            1
        );
    }

    #[test]
    fn entry_fee_creates_customer_demand_sweet_spot_from_animals() {
        let mut free = rabbit_pricing_state();
        let mut sweet = rabbit_pricing_state();
        let mut expensive = rabbit_pricing_state();
        let sweet_fee = zoo_view(&sweet).summary.customer_willingness;

        set_entry_fee_with_command(&mut free, 0);
        set_entry_fee_with_command(&mut sweet, sweet_fee);
        set_entry_fee_with_command(&mut expensive, sweet_fee * 3);

        let mut logic = ZooLogic;
        let free_starting_coins = free.inventory().amount(COINS);
        let sweet_starting_coins = sweet.inventory().amount(COINS);
        let expensive_starting_coins = expensive.inventory().amount(COINS);
        free.advance_time_with_logic(60, &mut logic).unwrap();
        sweet.advance_time_with_logic(60, &mut logic).unwrap();
        expensive.advance_time_with_logic(60, &mut logic).unwrap();

        let free_view = zoo_view(&free);
        let sweet_view = zoo_view(&sweet);
        let expensive_view = zoo_view(&expensive);
        assert!(sweet_view.summary.animal_appeal > 0);
        assert!(sweet_view.summary.customer_willingness > DEFAULT_ENTRY_FEE);
        assert!(
            free_view.summary.customer_demand_percent > sweet_view.summary.customer_demand_percent
        );
        assert!(
            sweet_view.summary.customer_demand_percent
                > expensive_view.summary.customer_demand_percent
        );
        assert!(free.inventory().amount(VISITORS) > sweet.inventory().amount(VISITORS));
        assert!(sweet.inventory().amount(VISITORS) > expensive.inventory().amount(VISITORS));
        assert!(
            sweet.inventory().amount(COINS) - sweet_starting_coins
                > free.inventory().amount(COINS) - free_starting_coins
        );
        assert!(
            sweet.inventory().amount(COINS) - sweet_starting_coins
                > expensive.inventory().amount(COINS) - expensive_starting_coins
        );
    }

    #[test]
    fn entry_fee_command_clamps_and_updates_customer_entry_stat() {
        let mut state = new_zoo_state().unwrap();
        let entry = customer_entry_id(&state);
        let outcome = apply_zoo_command(
            &mut state,
            GameCommand::SetBuildingStat {
                building: entry,
                stat: ENTRY_FEE.into(),
                value: MAX_ENTRY_FEE + 50,
            },
        )
        .unwrap();

        assert_eq!(
            outcome.events,
            vec![GameEvent::BuildingStatChanged {
                building: entry,
                stat: ENTRY_FEE.into(),
                value: MAX_ENTRY_FEE,
            }]
        );
        assert_eq!(zoo_view(&state).summary.entry_fee, MAX_ENTRY_FEE);
        assert_eq!(
            state.building_stat(entry, ENTRY_FEE).unwrap(),
            MAX_ENTRY_FEE
        );
    }

    #[test]
    fn zoo_apply_command_request_accepts_zoo_domain_commands() {
        let state = new_zoo_state().unwrap();
        let entry = customer_entry_id(&state);
        let request = ZooApplyCommandRequest {
            expected_version: 7,
            command: ZooCommand::SetEntryFee {
                building: entry,
                value: 18,
            },
        };

        let serialized = serde_json::to_value(&request).unwrap();

        assert_eq!(serialized["expected_version"], 7);
        assert_eq!(serialized["command"]["SetEntryFee"]["value"], 18);
    }

    #[test]
    fn zoo_apply_command_request_accepts_engine_path_commands() {
        let payload = serde_json::json!({
            "expected_version": 7,
            "command": {
                "Engine": {
                    "CreatePath": {
                        "kind": "service_path",
                        "waypoints": [
                            { "x": 11, "y": 15, "elevation": 0 },
                            { "x": 12, "y": 15, "elevation": 0 }
                        ]
                    }
                }
            }
        });

        let request: ZooApplyCommandRequest = serde_json::from_value(payload).unwrap();

        assert!(matches!(
            request.command,
            ZooCommand::Engine(GameCommand::CreatePath { .. })
        ));
    }

    #[test]
    fn zoo_logic_updates_animals_and_objectives() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        assert_eq!(
            state.building(animal_area).unwrap().status,
            BuildingStatus::Active
        );
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        let animal = buy_named_animal_group(
            &mut state,
            RABBIT_COLONY,
            "Starter Rabbit Colony",
            animal_area,
        )
        .unwrap();
        let mut logic = ZooLogic;
        state.advance_time_with_logic(30, &mut logic).unwrap();
        assert!(state.entity_stat(animal, HUNGER).unwrap() > 20);
        let view = zoo_view(&state);
        assert_eq!(
            view.entities
                .iter()
                .filter(|entity| is_animal_kind(&entity.kind))
                .count(),
            1
        );
    }

    #[test]
    fn staffed_animal_areas_receive_food_deliveries_from_main_building_for_coins() {
        let (mut staffed, animal_area, animal, house) = rabbit_animal_area_state(true);
        let (mut unstaffed, _, _, _) = rabbit_animal_area_state(false);
        let house_feed_before = staffed
            .building_inventory(house)
            .unwrap()
            .amount(ANIMAL_FEED);

        let mut staffed_logic = ZooLogic;
        let outcome = staffed
            .advance_time_and_collect_events_with_logic(30, &mut staffed_logic)
            .unwrap();
        let mut unstaffed_logic = ZooLogic;
        unstaffed
            .advance_time_with_logic(30, &mut unstaffed_logic)
            .unwrap();

        assert!(outcome.events.iter().any(|event| {
            matches!(
                event,
                GameEvent::DomainEvent { kind } if kind == &format!("zoo.feed_delivery.{}", animal_area.get())
            )
        }));
        assert_eq!(
            staffed.inventory().amount(COINS) + 5,
            unstaffed.inventory().amount(COINS)
        );
        assert_eq!(
            staffed
                .building_inventory(house)
                .unwrap()
                .amount(ANIMAL_FEED),
            house_feed_before - 3
        );
        assert_eq!(
            staffed
                .building_inventory(animal_area)
                .unwrap()
                .amount(ANIMAL_FEED),
            2
        );
        assert!(staffed.entity_stat(animal, HUNGER).unwrap() < 20);
        let economy = zoo_view(&staffed).economy;
        assert_eq!(economy.feed_delivery_cost_last_tick, 5);
        assert_eq!(economy.expenses_last_tick, 5);
        assert_eq!(
            economy.net_cashflow_last_tick,
            economy.revenue_last_tick - 5
        );
    }

    #[test]
    fn unstaffed_animal_areas_do_not_receive_food_deliveries() {
        let (mut state, animal_area, animal, house) = rabbit_animal_area_state(false);
        let house_feed_before = state.building_inventory(house).unwrap().amount(ANIMAL_FEED);

        let mut logic = ZooLogic;
        state.advance_time_with_logic(30, &mut logic).unwrap();

        assert_eq!(
            state.building_inventory(house).unwrap().amount(ANIMAL_FEED),
            house_feed_before
        );
        assert_eq!(
            state
                .building_inventory(animal_area)
                .unwrap()
                .amount(ANIMAL_FEED),
            0
        );
        assert!(state.entity_stat(animal, HUNGER).unwrap() > 20);
    }

    #[test]
    fn fresh_zoo_only_unlocks_rabbit_species() {
        let state = new_zoo_state().unwrap();

        assert!(is_species_unlocked(&state, RABBIT_COLONY));
        assert!(!is_species_unlocked(&state, TORTOISE_GROUP));
        assert!(!is_species_unlocked(&state, ZEBRA_HERD));
        assert!(!is_species_unlocked(&state, FLAMINGO_FLOCK));
        assert!(!is_species_unlocked(&state, PARROT_PAIR));
        assert!(!is_species_unlocked(&state, WOLF_PACK));
        assert!(!is_species_unlocked(&state, LION_PRIDE));
        assert!(!is_species_unlocked(&state, GORILLA_TROOP));
        assert!(!is_species_unlocked(&state, ELEPHANT_HERD));
    }

    #[test]
    fn species_unlock_progression_matches_roster_thresholds() {
        let thresholds = [
            (RABBIT_COLONY, 0_u64),
            (TORTOISE_GROUP, 10),
            (ZEBRA_HERD, 20),
            (FLAMINGO_FLOCK, 32),
            (PARROT_PAIR, 48),
            (WOLF_PACK, 68),
            (LION_PRIDE, 90),
            (GORILLA_TROOP, 115),
            (ELEPHANT_HERD, 145),
        ];

        for (kind, threshold) in thresholds {
            let mut state = new_zoo_state().unwrap();
            let current = state.inventory().amount(VISITORS);
            if threshold > current {
                state
                    .inventory_mut()
                    .add(VISITORS, threshold - current)
                    .unwrap();
            }
            let events = unlock_species_for_current_visitors(&mut state);
            assert!(
                is_species_unlocked(&state, kind),
                "{kind} should unlock at {threshold} visitors"
            );
            assert!(
                threshold == 0
                    || events.iter().any(|event| {
                        matches!(
                            event,
                            GameEvent::DomainEvent { kind: event_kind }
                                if event_kind == &format!("zoo.species_unlocked.{kind}")
                        )
                    })
            );
        }
    }

    #[test]
    fn animal_species_roster_is_monotonic_by_progression_tier() {
        let species = animal_species_definitions();
        assert_eq!(species.len(), 9);

        for pair in species.windows(2) {
            let [current, next] = pair else { continue };
            assert!(current.required_visitors < next.required_visitors);
            assert!(current.appeal < next.appeal);
            assert!(
                purchase_cost_amount(current, COINS) < purchase_cost_amount(next, COINS),
                "coin cost should rise from {} to {}",
                current.kind,
                next.kind
            );
        }
    }

    #[test]
    fn locked_species_purchase_reports_required_and_current_visitors() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(8, 10),
                MapLocation::new(9, 10),
            )
            .unwrap();
        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(10, 10),
                MapLocation::new(11, 10),
            )
            .unwrap();

        assert!(matches!(
            buy_named_animal_group(&mut state, LION_PRIDE, "North Lions", animal_area),
            Err(ZooError::Animal(AnimalPurchaseError::SpeciesLocked {
                required_visitors: 90,
                current_visitors: 4,
                ..
            }))
        ));
    }

    #[test]
    fn species_unlocks_persist_after_visitors_drop() {
        let mut state = new_zoo_state().unwrap();
        state.inventory_mut().add(VISITORS, 44).unwrap();

        let events = unlock_species_for_current_visitors(&mut state);
        assert!(events.iter().any(|event| {
            matches!(
                event,
                GameEvent::DomainEvent { kind } if kind == "zoo.species_unlocked.parrot_pair"
            )
        }));
        assert!(is_species_unlocked(&state, PARROT_PAIR));

        state.inventory_mut().remove(VISITORS, 48).unwrap();
        assert_eq!(state.inventory().amount(VISITORS), 0);
        assert!(is_species_unlocked(&state, PARROT_PAIR));
    }

    #[test]
    fn backfill_unlocks_species_already_present_in_legacy_states() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state.inventory_mut().add(VISITORS, 141).unwrap();
        unlock_species_for_current_visitors(&mut state);
        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(8, 10),
                MapLocation::new(9, 10),
            )
            .unwrap();
        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(10, 10),
                MapLocation::new(11, 10),
            )
            .unwrap();
        let lion =
            buy_named_animal_group(&mut state, LION_PRIDE, "North Lions", animal_area).unwrap();

        state.inventory_mut().remove(VISITORS, 145).unwrap();
        state.set_stat(ANIMAL_UNLOCK_LION_PRIDE, 0);
        assert!(!is_species_unlocked(&state, LION_PRIDE));

        backfill_species_unlocks(&mut state).unwrap();
        assert!(is_species_unlocked(&state, LION_PRIDE));
        assert_eq!(state.entity(lion).unwrap().kind(), LION_PRIDE);
    }

    #[test]
    fn guests_leave_when_they_cannot_find_animals() {
        let mut state = new_zoo_state().unwrap();
        let mut logic = ZooLogic;

        let outcome = state
            .advance_time_and_collect_events_with_logic(15, &mut logic)
            .unwrap();

        assert_eq!(state.inventory().amount(VISITORS), 0);
        assert_eq!(
            state
                .entities()
                .filter(|entity| entity.kind() == GUEST)
                .count(),
            0
        );
        assert_eq!(state.stat(GUEST_DEPARTURES_LAST_TICK), 4);
        assert_eq!(zoo_view(&state).summary.guest_departures_last_tick, 4);
        assert_eq!(
            outcome
                .events
                .iter()
                .filter(|event| matches!(event, GameEvent::EntityRemoved { kind, .. } if kind == "entity"))
                .count(),
            4
        );
    }

    #[test]
    fn tracked_guests_sync_to_current_visitors_with_cap() {
        let mut state = new_zoo_state().unwrap();
        state.inventory_mut().add(VISITORS, 16).unwrap();
        let mut logic = ZooLogic;

        state.advance_time_with_logic(0, &mut logic).unwrap();

        assert_eq!(zoo_view(&state).summary.current_visitors, 20);
        assert_eq!(zoo_view(&state).summary.tracked_guests, 8);
    }

    #[test]
    fn economy_view_reports_ticket_revenue_from_guest_arrivals() {
        let mut state = rabbit_pricing_state();
        let mut logic = ZooLogic;

        state.advance_time_with_logic(60, &mut logic).unwrap();

        let view = zoo_view(&state);
        assert!(view.economy.ticket_revenue_last_tick > 0);
        assert!(view.economy.revenue_last_tick >= view.economy.ticket_revenue_last_tick);
        assert_eq!(
            view.economy.net_cashflow_last_tick,
            view.economy.revenue_last_tick - view.economy.expenses_last_tick
        );
        assert!(view.economy.projected_cashflow_per_minute > 0);
    }

    #[test]
    fn sandbox_milestones_reflect_free_build_progress() {
        let mut state = new_zoo_state().unwrap();
        state.set_stat(PROJECTED_CASHFLOW_PER_MINUTE, 12);
        state.set_stat(GUEST_SPEND_LAST_TICK, 3);
        state.inventory_mut().add(VISITORS, 21).unwrap();
        state.inventory_mut().add(MEDICINE, 2).unwrap();
        unlock_species_for_current_visitors(&mut state);

        let first_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        let second_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(4, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(4, 10), MapLocation::new(5, 10))
            .unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(6, 10), MapLocation::new(7, 10))
            .unwrap();
        buy_named_animal_group(&mut state, RABBIT_COLONY, "Starter Rabbits", first_area).unwrap();
        buy_named_animal_group(&mut state, TORTOISE_GROUP, "Starter Tortoises", second_area)
            .unwrap();

        let objectives = zoo_view(&state)
            .objectives
            .into_iter()
            .map(|objective| (objective.id, objective.complete))
            .collect::<BTreeMap<_, _>>();

        assert_eq!(objectives.get("positive_cashflow"), Some(&true));
        assert_eq!(objectives.get("first_habitat"), Some(&true));
        assert_eq!(objectives.get("visitor_growth"), Some(&true));
        assert_eq!(objectives.get("stable_welfare"), Some(&true));
        assert_eq!(objectives.get("service_revenue"), Some(&true));
        assert_eq!(objectives.get("species_variety"), Some(&true));
    }

    #[test]
    fn animal_species_view_reports_unlocks_and_placed_counts() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        buy_named_animal_group(
            &mut state,
            RABBIT_COLONY,
            "Starter Rabbit Colony",
            animal_area,
        )
        .unwrap();

        let view = zoo_view(&state);
        let rabbit = view
            .animal_species
            .iter()
            .find(|species| species.kind == RABBIT_COLONY)
            .expect("rabbit species should be present");
        let elephant = view
            .animal_species
            .iter()
            .find(|species| species.kind == ELEPHANT_HERD)
            .expect("elephant species should be present");

        assert!(rabbit.unlocked);
        assert_eq!(rabbit.placed_count, 1);
        assert_eq!(rabbit.appeal, 6);
        assert_eq!(rabbit.animal_area_kind, ANIMAL_AREA);
        assert_eq!(rabbit.fence_kind, WOOD_FENCE);
        assert_eq!(rabbit.min_fence_count, 1);
        assert_eq!(rabbit.purchase_cost.len(), 3);
        assert!(!elephant.unlocked);
        assert_eq!(elephant.required_visitors, 145);
        assert_eq!(elephant.min_fence_count, 4);
    }

    #[test]
    fn elephant_purchase_requires_four_steel_fences() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state.inventory_mut().add(VISITORS, 141).unwrap();
        unlock_species_for_current_visitors(&mut state);
        for (start, end) in [
            (MapLocation::new(8, 10), MapLocation::new(9, 10)),
            (MapLocation::new(10, 10), MapLocation::new(11, 10)),
            (MapLocation::new(7, 11), MapLocation::new(7, 12)),
        ] {
            state.place_fence(STEEL_FENCE, start, end).unwrap();
        }

        assert!(matches!(
            buy_animal_group(&mut state, ELEPHANT_HERD, animal_area),
            Err(ZooError::Animal(
                AnimalPurchaseError::AnimalAreaRequirementsNotMet { requirements, .. }
            )) if requirements.min_fence_count == 4 && requirements.fence_kind == STEEL_FENCE
        ));

        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(12, 11),
                MapLocation::new(12, 12),
            )
            .unwrap();
        state.inventory_mut().add(MEDICINE, 8).unwrap();
        let elephant =
            buy_named_animal_group(&mut state, ELEPHANT_HERD, "Matriarch Herd", animal_area)
                .unwrap();
        assert_eq!(state.entity(elephant).unwrap().kind(), ELEPHANT_HERD);
    }

    fn rabbit_pricing_state() -> GameState {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        buy_animal_group(&mut state, RABBIT_COLONY, animal_area).unwrap();
        state
    }

    fn rabbit_animal_area_state(
        assign_keeper: bool,
    ) -> (GameState, BuildingId, EntityId, BuildingId) {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 11))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 10), MapLocation::new(9, 10))
            .unwrap();
        let animal = buy_named_animal_group(
            &mut state,
            RABBIT_COLONY,
            "Starter Rabbit Colony",
            animal_area,
        )
        .unwrap();
        if assign_keeper {
            let keeper = state
                .entity_ids_of_blueprint(EntityBlueprintRef::Unit(ZOOKEEPER.into()))
                .into_iter()
                .next()
                .expect("seeded zookeeper should exist");
            state
                .assign_entity_to_building(keeper, animal_area)
                .unwrap();
        }
        let house = state
            .buildings()
            .find(|building| building.kind.as_str() == ZOOKEEPER_HOUSE)
            .expect("zookeeper house should exist")
            .id;
        (state, animal_area, animal, house)
    }

    fn purchase_cost_amount(species: &animals::AnimalSpeciesDefinition, resource: &str) -> u64 {
        species
            .purchase_cost
            .iter()
            .find_map(|(kind, amount)| (*kind == resource).then_some(*amount))
            .unwrap_or(0)
    }

    fn set_entry_fee_with_command(state: &mut GameState, value: i64) {
        let entry = customer_entry_id(state);
        apply_zoo_command(
            state,
            GameCommand::SetBuildingStat {
                building: entry,
                stat: ENTRY_FEE.into(),
                value,
            },
        )
        .unwrap();
    }

    fn customer_entry_id(state: &GameState) -> BuildingId {
        state
            .buildings()
            .find(|building| building.kind.as_str() == CUSTOMER_ENTRY)
            .expect("customer entry should exist")
            .id
    }
}
