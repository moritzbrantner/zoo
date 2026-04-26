use farm_engine::{
    AreaDefinition, Building, BuildingDefinition, BuildingId, BuildingLevelDefinition,
    BuildingStatus, Catalog, CommandId, CommandOutcome, Effect, EngineError, EntityBlueprintRef,
    EntityId, EntityRecord, FenceDefinition, GameCommand, GameEvent, GameLogic, GameState,
    GameWorld, GameWorldError, Job, JobCompletion, LevelDefinition, MapLocation, NpcDefinition,
    NpcKind, PathDefinition, PlacementRule, PlacementTarget, PlayerId, ProductionQueueConfig,
    ProductionRule, ProductionStatus, Requirement, ResourceAmount, ResourceDefinition, ResourceId,
    ResourceStorage, StatId, TechNodeDefinition, TileDefinition, UnitDefinition, UpgradeDefinition,
    WorldId,
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
    use farm_engine::{BuildingStatus, GameCommand, ResourceError};

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
        assert_eq!(entry.location, MapLocation::new(ZOO_CENTER, 1));
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
        assert_eq!(house.location, MapLocation::new(ZOO_CENTER, ZOO_CENTER));
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
                .any(|species| species.kind == ZEBRA_HERD && species.unlocked)
        );
        assert!(
            view.animal_species
                .iter()
                .any(|species| species.kind == LION_PRIDE && !species.unlocked)
        );
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
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
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
            .place_fence(WOOD_FENCE, MapLocation::new(8, 13), MapLocation::new(9, 13))
            .unwrap();
        assert_eq!(state.fence(fence).unwrap().kind.as_str(), WOOD_FENCE);
    }

    #[test]
    fn animal_purchase_requires_species_area_setup() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        state.advance_time(18).unwrap();

        assert!(matches!(
            buy_animal_group(&mut state, ZEBRA_HERD, animal_area),
            Err(ZooError::Animal(
                AnimalPurchaseError::AnimalAreaRequirementsNotMet { .. }
            ))
        ));

        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 13), MapLocation::new(9, 13))
            .unwrap();
        state.inventory_mut().add(ANIMAL_FEED, 20).unwrap();
        let zebra = buy_animal_group(&mut state, ZEBRA_HERD, animal_area).unwrap();
        assert_eq!(
            state.entity_stat(zebra, HABITAT_ID).unwrap(),
            animal_area.get() as i64
        );
        assert_eq!(state.entity(zebra).unwrap().kind(), ZEBRA_HERD);
    }

    #[test]
    fn animal_purchase_enforces_species_specific_fence_counts_and_spends_costs() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        state.advance_time(18).unwrap();
        state.inventory_mut().add(VISITORS, 56).unwrap();
        unlock_species_for_current_visitors(&mut state);
        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(8, 13),
                MapLocation::new(9, 13),
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
                MapLocation::new(8, 15),
                MapLocation::new(9, 15),
            )
            .unwrap();
        let coins_before = state.inventory().amount(COINS);
        let meat_before = state.inventory().amount(MEAT);
        let water_before = state.inventory().amount(WATER);

        let lion =
            buy_named_animal_group(&mut state, LION_PRIDE, "North Lions", animal_area).unwrap();

        assert_eq!(state.inventory().amount(COINS), coins_before - 80);
        assert_eq!(state.inventory().amount(MEAT), meat_before - 16);
        assert_eq!(state.inventory().amount(WATER), water_before - 6);
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
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 13), MapLocation::new(9, 13))
            .unwrap();
        let inventory_before = state.inventory().clone();

        assert!(matches!(
            buy_animal_group(&mut state, ZEBRA_HERD, animal_area),
            Err(ZooError::Engine(EngineError::Resource(
                ResourceError::Insufficient {
                    resource,
                    needed: 8,
                    available: 0,
                }
            ))) if resource.as_str() == ANIMAL_FEED
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
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        state.advance_time(18).unwrap();
        state.inventory_mut().add(VISITORS, 8).unwrap();
        unlock_species_for_current_visitors(&mut state);
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 13), MapLocation::new(9, 13))
            .unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 15), MapLocation::new(9, 15))
            .unwrap();
        state.inventory_mut().add(ANIMAL_FEED, 20).unwrap();

        buy_animal_group(&mut state, ZEBRA_HERD, animal_area).unwrap();
        assert!(matches!(
            buy_animal_group(&mut state, TORTOISE_GROUP, animal_area),
            Err(ZooError::Animal(AnimalPurchaseError::MixedAnimalKinds {
                existing_kind,
                requested_kind,
                ..
            })) if existing_kind == ZEBRA_HERD && requested_kind == TORTOISE_GROUP
        ));
    }

    #[test]
    fn zoo_move_npc_command_rehomes_animals_only_to_valid_areas() {
        let mut state = new_zoo_state().unwrap();
        let first_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        let second_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(14, 14))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 13), MapLocation::new(9, 13))
            .unwrap();
        state.inventory_mut().add(ANIMAL_FEED, 20).unwrap();
        let zebra = buy_animal_group(&mut state, ZEBRA_HERD, first_area).unwrap();
        let original_location = state.entity(zebra).unwrap().location;
        let second_location = state.building(second_area).unwrap().location;

        assert!(matches!(
            apply_zoo_command(
                &mut state,
                GameCommand::MoveEntity {
                    entity: zebra,
                    location: second_location,
                },
            ),
            Err(ZooError::Animal(
                AnimalPurchaseError::AnimalAreaRequirementsNotMet { .. }
            ))
        ));
        assert_eq!(state.entity(zebra).unwrap().location, original_location);
        assert_eq!(
            state.entity_stat(zebra, HABITAT_ID).unwrap(),
            first_area.get() as i64
        );

        state
            .place_fence(
                WOOD_FENCE,
                MapLocation::new(14, 13),
                MapLocation::new(15, 13),
            )
            .unwrap();
        let outcome = apply_zoo_command(
            &mut state,
            GameCommand::MoveEntity {
                entity: zebra,
                location: second_location,
            },
        )
        .unwrap();

        assert_eq!(outcome.events, vec![GameEvent::EntityMoved(zebra)]);
        assert_eq!(state.entity(zebra).unwrap().location, second_location);
        assert_eq!(
            state.entity_stat(zebra, HABITAT_ID).unwrap(),
            second_area.get() as i64
        );
    }

    #[test]
    fn zoo_create_npc_command_buys_animals_through_area_rules() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 13), MapLocation::new(9, 13))
            .unwrap();
        state.inventory_mut().add(ANIMAL_FEED, 20).unwrap();
        let animal_area_location = state.building(animal_area).unwrap().location;

        let outcome = apply_zoo_command(
            &mut state,
            GameCommand::SpawnEntity {
                blueprint: EntityBlueprintRef::Npc(ZEBRA_HERD.into()),
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
                .filter(|entity| entity.blueprint == EntityBlueprintRef::Npc(ZEBRA_HERD.into()))
                .count(),
            1
        );
    }

    #[test]
    fn entry_fee_creates_customer_demand_sweet_spot_from_animals() {
        let mut free = zebra_pricing_state();
        let mut sweet = zebra_pricing_state();
        let mut expensive = zebra_pricing_state();
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
    fn zoo_logic_updates_animals_and_objectives() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        state.advance_time(18).unwrap();
        assert_eq!(
            state.building(animal_area).unwrap().status,
            BuildingStatus::Active
        );
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 13), MapLocation::new(9, 13))
            .unwrap();
        state.inventory_mut().add(ANIMAL_FEED, 20).unwrap();
        let animal =
            buy_named_animal_group(&mut state, ZEBRA_HERD, "Starter Zebra Herd", animal_area)
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
    fn fresh_zoo_only_unlocks_zebra_species() {
        let state = new_zoo_state().unwrap();

        assert!(is_species_unlocked(&state, ZEBRA_HERD));
        assert!(!is_species_unlocked(&state, TORTOISE_GROUP));
        assert!(!is_species_unlocked(&state, FLAMINGO_FLOCK));
        assert!(!is_species_unlocked(&state, PARROT_PAIR));
        assert!(!is_species_unlocked(&state, LION_PRIDE));
    }

    #[test]
    fn locked_species_purchase_reports_required_and_current_visitors() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(8, 13),
                MapLocation::new(9, 13),
            )
            .unwrap();
        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(8, 15),
                MapLocation::new(9, 15),
            )
            .unwrap();

        assert!(matches!(
            buy_named_animal_group(&mut state, LION_PRIDE, "North Lions", animal_area),
            Err(ZooError::Animal(AnimalPurchaseError::SpeciesLocked {
                required_visitors: 60,
                current_visitors: 4,
                ..
            }))
        ));
    }

    #[test]
    fn species_unlocks_persist_after_visitors_drop() {
        let mut state = new_zoo_state().unwrap();
        state.inventory_mut().add(VISITORS, 36).unwrap();

        let events = unlock_species_for_current_visitors(&mut state);
        assert!(events.iter().any(|event| {
            matches!(
                event,
                GameEvent::DomainEvent { kind } if kind == "zoo.species_unlocked.parrot_pair"
            )
        }));
        assert!(is_species_unlocked(&state, PARROT_PAIR));

        state.inventory_mut().remove(VISITORS, 40).unwrap();
        assert_eq!(state.inventory().amount(VISITORS), 0);
        assert!(is_species_unlocked(&state, PARROT_PAIR));
    }

    #[test]
    fn backfill_unlocks_species_already_present_in_legacy_states() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        state.advance_time(18).unwrap();
        state.inventory_mut().add(VISITORS, 56).unwrap();
        unlock_species_for_current_visitors(&mut state);
        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(8, 13),
                MapLocation::new(9, 13),
            )
            .unwrap();
        state
            .place_fence(
                STEEL_FENCE,
                MapLocation::new(8, 15),
                MapLocation::new(9, 15),
            )
            .unwrap();
        let lion =
            buy_named_animal_group(&mut state, LION_PRIDE, "North Lions", animal_area).unwrap();

        state.inventory_mut().remove(VISITORS, 60).unwrap();
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
    fn animal_species_view_reports_unlocks_and_placed_counts() {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 13), MapLocation::new(9, 13))
            .unwrap();
        state.inventory_mut().add(ANIMAL_FEED, 20).unwrap();
        buy_named_animal_group(&mut state, ZEBRA_HERD, "Starter Zebra Herd", animal_area).unwrap();

        let view = zoo_view(&state);
        let zebra = view
            .animal_species
            .iter()
            .find(|species| species.kind == ZEBRA_HERD)
            .expect("zebra species should be present");
        let lion = view
            .animal_species
            .iter()
            .find(|species| species.kind == LION_PRIDE)
            .expect("lion species should be present");

        assert!(zebra.unlocked);
        assert_eq!(zebra.placed_count, 1);
        assert_eq!(zebra.appeal, 12);
        assert!(!lion.unlocked);
        assert_eq!(lion.required_visitors, 60);
    }

    fn zebra_pricing_state() -> GameState {
        let mut state = new_zoo_state().unwrap();
        let animal_area = state
            .start_construction_at(ANIMAL_AREA, MapLocation::new(8, 14))
            .unwrap();
        state.advance_time(18).unwrap();
        state
            .place_fence(WOOD_FENCE, MapLocation::new(8, 13), MapLocation::new(9, 13))
            .unwrap();
        state.inventory_mut().add(ANIMAL_FEED, 20).unwrap();
        buy_animal_group(&mut state, ZEBRA_HERD, animal_area).unwrap();
        state
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
