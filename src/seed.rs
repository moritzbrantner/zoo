use super::*;

pub fn new_zoo_state() -> Result<GameState, EngineError> {
    let mut state = GameState::new(zoo_catalog());
    seed_zoo_state(&mut state)?;
    Ok(state)
}

pub fn new_zoo_world(
    players: impl IntoIterator<Item = PlayerId>,
) -> Result<GameWorld, GameWorldError> {
    let mut world = GameWorld::new(zoo_catalog());
    for player in players {
        world.add_player(player.clone())?;
        let state = new_zoo_state().map_err(|source| GameWorldError::PlayerEngine {
            player: player.clone(),
            source,
        })?;
        *world.require_player_mut(player)? = state;
    }
    Ok(world)
}

fn seed_zoo_state(state: &mut GameState) -> Result<(), EngineError> {
    state.set_map_bounds(0, 0, ZOO_SIZE - 1, ZOO_SIZE - 1);
    state.inventory_mut().set_capacity(ANIMAL_FEED, 80);
    state.inventory_mut().set_capacity(MEDICINE, 40);
    state.inventory_mut().set_capacity(VISITORS, 180);
    state.inventory_mut().set_capacity(WATER, 120);
    state.inventory_mut().set_capacity(RESEARCH_POINTS, 100);
    state.inventory_mut().add_many(&[
        ResourceAmount::new(COINS, 420),
        ResourceAmount::new(LUMBER, 260),
        ResourceAmount::new(VEGETABLES, 80),
        ResourceAmount::new(MEAT, 40),
        ResourceAmount::new(FISH, 40),
        ResourceAmount::new(WATER, 80),
        ResourceAmount::new(VISITORS, 4),
        ResourceAmount::new(REPUTATION, 1),
    ])?;
    state.grant_tech_node_kind(BASIC_HUSBANDRY)?;

    for y in 0..ZOO_SIZE {
        for x in 0..ZOO_SIZE {
            let location = MapLocation::new(x, y);
            state.set_ground_elevation(location, 0);
            state.set_tile(GRASS, location)?;
        }
    }

    state.create_area(BUILDABLE_GRASS, rectangle(0, 0, ZOO_SIZE - 1, ZOO_SIZE - 1))?;
    state.create_area(HABITAT_ZONE, rectangle(2, 2, ZOO_SIZE - 3, ZOO_CENTER + 6))?;
    state.create_area(GUEST_ZONE, rectangle(1, 0, ZOO_SIZE - 2, ZOO_SIZE - 3))?;
    state.create_area(
        STAFF_ZONE,
        rectangle(
            ZOO_CENTER - 6,
            ZOO_CENTER - 6,
            ZOO_CENTER + 6,
            ZOO_CENTER + 6,
        ),
    )?;
    state.create_path(GUEST_PATH, main_guest_path())?;
    state.create_path(
        SERVICE_PATH,
        row(ZOO_CENTER + 1, ZOO_CENTER - 6, ZOO_CENTER + 6),
    )?;

    let entry = state.start_construction_at(CUSTOMER_ENTRY, MapLocation::new(ZOO_CENTER, 1))?;
    let house =
        state.start_construction_at(ZOOKEEPER_HOUSE, MapLocation::new(ZOO_CENTER, ZOO_CENTER))?;
    state.building_inventory_mut(house)?.add(ANIMAL_FEED, 20)?;
    state.building_inventory_mut(house)?.add(MEDICINE, 6)?;
    state.set_building_stat(entry, CLEANLINESS, 85)?;
    set_park_entry_fee(state, entry, DEFAULT_ENTRY_FEE)?;
    state.set_building_stat(house, CLEANLINESS, 90)?;

    let keeper = state.spawn_entity(
        EntityBlueprintRef::Unit(ZOOKEEPER.into()),
        None,
        MapLocation::new(ZOO_CENTER + 2, ZOO_CENTER),
    )?;
    state.assign_entity_to_building(keeper, house)?;

    for (name, y) in [("Mira", 3), ("Sam", 5), ("Taylor", 7), ("Rin", 9)] {
        let guest = state.spawn_entity(
            EntityBlueprintRef::Npc(GUEST.into()),
            Some(name.to_owned()),
            MapLocation::new(ZOO_CENTER + 1, y),
        )?;
        state.set_entity_stat(guest, EXCITEMENT, 20)?;
        state.set_entity_stat(guest, PATIENCE, 80)?;
        state.set_entity_stat(guest, SPEND_CHANCE, 20)?;
    }

    backfill_species_unlocks(state)?;

    Ok(())
}

pub(crate) fn add_entry_and_guest_buildings(catalog: &mut Catalog) {
    catalog.add_building(
        BuildingDefinition::new(CUSTOMER_ENTRY, "Customer Entry").with_level(
            BuildingLevelDefinition::new(1, 0, Vec::new())
                .with_height(2)
                .with_inventory_capacity(vec![ResourceAmount::new(VISITORS, 300)]),
        ),
    );

    catalog.add_building(guest_building(
        TICKET_BOOTH,
        "Ticket Booth",
        6,
        vec![
            ResourceAmount::new(COINS, 24),
            ResourceAmount::new(LUMBER, 12),
        ],
        ProductionRule::new(
            8,
            vec![ResourceAmount::new(VISITORS, 8)],
            vec![
                ResourceAmount::new(COINS, 70),
                ResourceAmount::new(REPUTATION, 1),
            ],
        )
        .with_worker_requirement(1, vec![EDUCATOR.into()]),
    ));
    catalog.add_building(guest_building(
        GUEST_PLAZA,
        "Guest Plaza",
        5,
        vec![
            ResourceAmount::new(COINS, 30),
            ResourceAmount::new(LUMBER, 18),
        ],
        ProductionRule::new(20, Vec::new(), vec![ResourceAmount::new(VISITORS, 12)]),
    ));
    catalog.add_building(guest_building(
        RESTROOM,
        "Restroom",
        10,
        vec![
            ResourceAmount::new(COINS, 35),
            ResourceAmount::new(WATER, 8),
        ],
        ProductionRule::new(
            20,
            vec![ResourceAmount::new(WATER, 4)],
            vec![ResourceAmount::new(REPUTATION, 1)],
        ),
    ));
    catalog.add_building(guest_building(
        SNACK_KIOSK,
        "Food Store",
        12,
        vec![
            ResourceAmount::new(COINS, 40),
            ResourceAmount::new(LUMBER, 10),
        ],
        ProductionRule::new(
            10,
            vec![
                ResourceAmount::new(VISITORS, 6),
                ResourceAmount::new(VEGETABLES, 4),
            ],
            vec![
                ResourceAmount::new(COINS, 55),
                ResourceAmount::new(REPUTATION, 1),
            ],
        ),
    ));
    catalog.add_building(guest_building(
        SOUVENIR_STALL,
        "Gift Shop",
        15,
        vec![
            ResourceAmount::new(COINS, 55),
            ResourceAmount::new(LUMBER, 16),
        ],
        ProductionRule::new(
            14,
            vec![
                ResourceAmount::new(VISITORS, 8),
                ResourceAmount::new(LUMBER, 2),
            ],
            vec![
                ResourceAmount::new(COINS, 80),
                ResourceAmount::new(RESEARCH_POINTS, 2),
            ],
        ),
    ));
}

pub(crate) fn add_staff_buildings(catalog: &mut Catalog) {
    catalog.add_building(
        BuildingDefinition::new(ZOOKEEPER_HOUSE, "Zookeeper House")
            .with_placement_rules(staff_rules())
            .with_level(
                BuildingLevelDefinition::new(1, 0, Vec::new())
                    .with_height(2)
                    .with_inventory_capacity(vec![
                        ResourceAmount::new(ANIMAL_FEED, 100),
                        ResourceAmount::new(MEDICINE, 30),
                        ResourceAmount::new(VEGETABLES, 100),
                        ResourceAmount::new(MEAT, 80),
                        ResourceAmount::new(FISH, 80),
                    ]),
            ),
    );

    catalog.add_building(staff_building(
        KEEPER_KITCHEN,
        "Keeper Kitchen",
        12,
        vec![
            ResourceAmount::new(COINS, 35),
            ResourceAmount::new(LUMBER, 18),
        ],
        ProductionRule::new(
            10,
            vec![
                ResourceAmount::new(VEGETABLES, 8),
                ResourceAmount::new(WATER, 3),
            ],
            vec![ResourceAmount::new(ANIMAL_FEED, 18)],
        )
        .with_worker_requirement(1, vec![ZOOKEEPER.into()]),
    ));
    catalog.add_building(
        BuildingDefinition::new(FEED_SHED, "Feed Shed")
            .with_placement_rules(staff_rules())
            .with_level(
                BuildingLevelDefinition::new(1, 5, vec![ResourceAmount::new(LUMBER, 15)])
                    .with_storage_bonus(vec![ResourceAmount::new(ANIMAL_FEED, 60)]),
            ),
    );
    catalog.add_building(staff_building(
        VET_CLINIC,
        "Vet Clinic",
        18,
        vec![
            ResourceAmount::new(COINS, 60),
            ResourceAmount::new(LUMBER, 18),
        ],
        ProductionRule::new(
            16,
            vec![
                ResourceAmount::new(VEGETABLES, 3),
                ResourceAmount::new(WATER, 2),
            ],
            vec![ResourceAmount::new(MEDICINE, 8)],
        )
        .with_worker_requirement(1, vec![VETERINARIAN.into()]),
    ));
    catalog.add_building(staff_building(
        MAINTENANCE_SHED,
        "Maintenance Shed",
        14,
        vec![
            ResourceAmount::new(COINS, 45),
            ResourceAmount::new(LUMBER, 20),
        ],
        ProductionRule::new(
            14,
            vec![ResourceAmount::new(LUMBER, 4)],
            vec![ResourceAmount::new(REPUTATION, 1)],
        )
        .with_worker_requirement(1, vec![MECHANIC.into()]),
    ));
    catalog.add_building(staff_building(
        RESEARCH_OFFICE,
        "Research Office",
        20,
        vec![
            ResourceAmount::new(COINS, 80),
            ResourceAmount::new(LUMBER, 24),
        ],
        ProductionRule::new(
            20,
            vec![ResourceAmount::new(COINS, 20)],
            vec![ResourceAmount::new(RESEARCH_POINTS, 10)],
        )
        .with_worker_requirement(1, vec![EDUCATOR.into()]),
    ));
}

pub(crate) fn add_habitats(catalog: &mut Catalog) {
    catalog.add_building(
        BuildingDefinition::new(ANIMAL_AREA, "Animal Area")
            .with_placement_rules(animal_area_rules())
            .with_level(
                BuildingLevelDefinition::new(
                    1,
                    18,
                    vec![
                        ResourceAmount::new(COINS, 50),
                        ResourceAmount::new(LUMBER, 20),
                    ],
                )
                .with_height(1)
                .with_inventory_capacity(vec![
                    ResourceAmount::new(ANIMAL_FEED, 30),
                    ResourceAmount::new(WATER, 20),
                ])
                .with_production_queue(ProductionQueueConfig::new(2))
                .with_production(
                    ProductionRule::new(
                        16,
                        vec![
                            ResourceAmount::new(ANIMAL_FEED, 5),
                            ResourceAmount::new(WATER, 3),
                        ],
                        vec![
                            ResourceAmount::new(VISITORS, 8),
                            ResourceAmount::new(CONSERVATION_POINTS, 1),
                        ],
                    )
                    .with_worker_requirement(1, vec![ZOOKEEPER.into()]),
                ),
            ),
    );

    for (kind, name, feed, output_visitors, output_conservation) in [
        (SAVANNA_HABITAT, "Savanna Habitat", ANIMAL_FEED, 14, 2),
        (WETLANDS_HABITAT, "Wetlands Habitat", FISH, 16, 3),
        (AVIARY, "Aviary", ANIMAL_FEED, 18, 4),
        (REPTILE_HOUSE, "Reptile House", MEAT, 15, 4),
    ] {
        catalog.add_building(
            BuildingDefinition::new(kind, name)
                .with_placement_rules(habitat_rules())
                .with_level(
                    BuildingLevelDefinition::new(
                        1,
                        24,
                        vec![
                            ResourceAmount::new(COINS, 70),
                            ResourceAmount::new(LUMBER, 28),
                        ],
                    )
                    .with_height(2)
                    .with_inventory_capacity(vec![
                        ResourceAmount::new(feed, 40),
                        ResourceAmount::new(WATER, 30),
                    ])
                    .with_production_queue(ProductionQueueConfig::new(3))
                    .with_production(
                        ProductionRule::new(
                            18,
                            vec![ResourceAmount::new(feed, 8), ResourceAmount::new(WATER, 4)],
                            vec![
                                ResourceAmount::new(VISITORS, output_visitors),
                                ResourceAmount::new(CONSERVATION_POINTS, output_conservation),
                                ResourceAmount::new(RESEARCH_POINTS, 2),
                            ],
                        )
                        .with_worker_requirement(1, vec![ZOOKEEPER.into()]),
                    ),
                )
                .with_level(
                    BuildingLevelDefinition::new(
                        2,
                        36,
                        vec![
                            ResourceAmount::new(COINS, 90),
                            ResourceAmount::new(LUMBER, 36),
                        ],
                    )
                    .with_height(3)
                    .with_inventory_capacity(vec![
                        ResourceAmount::new(feed, 80),
                        ResourceAmount::new(WATER, 60),
                        ResourceAmount::new(MEDICINE, 20),
                    ])
                    .with_production_queue(ProductionQueueConfig::new(5))
                    .with_production(
                        ProductionRule::new(
                            15,
                            vec![ResourceAmount::new(feed, 10), ResourceAmount::new(WATER, 5)],
                            vec![
                                ResourceAmount::new(VISITORS, output_visitors + 8),
                                ResourceAmount::new(CONSERVATION_POINTS, output_conservation + 2),
                                ResourceAmount::new(RESEARCH_POINTS, 4),
                            ],
                        )
                        .with_worker_requirement(1, vec![ZOOKEEPER.into()]),
                    ),
                ),
        );
    }
}

pub(crate) fn add_tech_and_upgrades(catalog: &mut Catalog) {
    catalog.add_tech_node(
        TechNodeDefinition::new(
            BASIC_HUSBANDRY,
            "Basic Husbandry",
            vec![ResourceAmount::new(RESEARCH_POINTS, 10)],
        )
        .with_grants(vec![Effect::UnlockBuilding(SAVANNA_HABITAT.into())]),
    );
    catalog.add_tech_node(
        TechNodeDefinition::new(
            VETERINARY_CARE,
            "Veterinary Care",
            vec![ResourceAmount::new(RESEARCH_POINTS, 18)],
        )
        .with_requirements(vec![Requirement::HasTechNode(BASIC_HUSBANDRY.into())])
        .with_grants(vec![Effect::UnlockUnit(VETERINARIAN.into())]),
    );
    catalog.add_tech_node(
        TechNodeDefinition::new(
            GUEST_SERVICES,
            "Guest Services",
            vec![ResourceAmount::new(RESEARCH_POINTS, 15)],
        )
        .with_grants(vec![Effect::UnlockBuilding(SOUVENIR_STALL.into())]),
    );
    catalog.add_tech_node(
        TechNodeDefinition::new(
            HABITAT_ENRICHMENT,
            "Habitat Enrichment",
            vec![ResourceAmount::new(RESEARCH_POINTS, 25)],
        )
        .with_requirements(vec![Requirement::HasTechNode(BASIC_HUSBANDRY.into())])
        .with_grants(vec![Effect::UnlockUpgrade(REINFORCED_HABITATS.into())]),
    );
    catalog.add_tech_node(
        TechNodeDefinition::new(
            CONSERVATION_PROGRAMS,
            "Conservation Programs",
            vec![
                ResourceAmount::new(RESEARCH_POINTS, 35),
                ResourceAmount::new(CONSERVATION_POINTS, 8),
            ],
        )
        .with_requirements(vec![Requirement::HasTechNode(HABITAT_ENRICHMENT.into())])
        .with_grants(vec![Effect::UnlockBuilding(AVIARY.into())]),
    );

    catalog.add_upgrade(
        UpgradeDefinition::new(
            EFFICIENT_FEED_PREP,
            "Efficient Feed Prep",
            vec![ResourceAmount::new(RESEARCH_POINTS, 12)],
        )
        .with_effects(vec![Effect::MultiplyProductionDuration {
            numerator: 4,
            denominator: 5,
        }]),
    );
    catalog.add_upgrade(
        UpgradeDefinition::new(
            GUIDED_TOURS,
            "Guided Tours",
            vec![ResourceAmount::new(RESEARCH_POINTS, 18)],
        )
        .with_effects(vec![Effect::MultiplyProductionOutput {
            resource: VISITORS.into(),
            numerator: 6,
            denominator: 5,
        }]),
    );
    catalog.add_upgrade(
        UpgradeDefinition::new(
            REINFORCED_HABITATS,
            "Reinforced Habitats",
            vec![ResourceAmount::new(RESEARCH_POINTS, 20)],
        )
        .with_requirements(vec![Requirement::HasTechNode(HABITAT_ENRICHMENT.into())])
        .with_effects(vec![Effect::MultiplyBuildDuration {
            numerator: 4,
            denominator: 5,
        }]),
    );
    catalog.add_upgrade(
        UpgradeDefinition::new(
            WATER_RECYCLING,
            "Water Recycling",
            vec![ResourceAmount::new(RESEARCH_POINTS, 16)],
        )
        .with_effects(vec![Effect::AddStorageCapacity(ResourceAmount::new(
            WATER, 60,
        ))]),
    );
    catalog.add_upgrade(
        UpgradeDefinition::new(
            DONATION_CAMPAIGN,
            "Donation Campaign",
            vec![ResourceAmount::new(RESEARCH_POINTS, 22)],
        )
        .with_effects(vec![Effect::MultiplyProductionOutput {
            resource: COINS.into(),
            numerator: 13,
            denominator: 10,
        }]),
    );
}

fn guest_building(
    kind: &str,
    name: &str,
    build_time: u64,
    cost: Vec<ResourceAmount>,
    production: ProductionRule,
) -> BuildingDefinition {
    BuildingDefinition::new(kind, name)
        .with_placement_rules(guest_rules())
        .with_level(
            BuildingLevelDefinition::new(1, build_time, cost)
                .with_height(2)
                .with_production_queue(ProductionQueueConfig::new(3))
                .with_production(production),
        )
}

fn staff_building(
    kind: &str,
    name: &str,
    build_time: u64,
    cost: Vec<ResourceAmount>,
    production: ProductionRule,
) -> BuildingDefinition {
    BuildingDefinition::new(kind, name)
        .with_placement_rules(staff_rules())
        .with_level(
            BuildingLevelDefinition::new(1, build_time, cost)
                .with_height(2)
                .with_inventory_capacity(vec![ResourceAmount::new(ANIMAL_FEED, 60)])
                .with_production_queue(ProductionQueueConfig::new(4))
                .with_production(production),
        )
}

fn habitat_rules() -> Vec<PlacementRule> {
    vec![
        PlacementRule::WithinBounds,
        PlacementRule::RequiresAreaKind(HABITAT_ZONE.into()),
        PlacementRule::AdjacentToPath,
        PlacementRule::NoOverlap,
    ]
}

fn animal_area_rules() -> Vec<PlacementRule> {
    vec![
        PlacementRule::WithinBounds,
        PlacementRule::RequiresAreaKind(HABITAT_ZONE.into()),
        PlacementRule::AdjacentToPath,
        PlacementRule::NoOverlap,
    ]
}

pub(crate) fn fence_rules() -> Vec<PlacementRule> {
    vec![
        PlacementRule::WithinBounds,
        PlacementRule::AdjacentTo(PlacementTarget::BuildingKind(ANIMAL_AREA.into())),
    ]
}

fn guest_rules() -> Vec<PlacementRule> {
    vec![
        PlacementRule::WithinBounds,
        PlacementRule::RequiresAreaKind(GUEST_ZONE.into()),
        PlacementRule::AdjacentToPath,
        PlacementRule::NoOverlap,
    ]
}

fn staff_rules() -> Vec<PlacementRule> {
    vec![
        PlacementRule::WithinBounds,
        PlacementRule::RequiresAreaKind(STAFF_ZONE.into()),
        PlacementRule::AdjacentToPath,
        PlacementRule::NoOverlap,
    ]
}

fn rectangle(min_x: i32, min_y: i32, max_x: i32, max_y: i32) -> Vec<MapLocation> {
    (min_y..=max_y)
        .flat_map(|y| (min_x..=max_x).map(move |x| MapLocation::new(x, y)))
        .collect()
}

fn row(y: i32, min_x: i32, max_x: i32) -> Vec<MapLocation> {
    (min_x..=max_x).map(|x| MapLocation::new(x, y)).collect()
}

fn column(x: i32, min_y: i32, max_y: i32) -> Vec<MapLocation> {
    (min_y..=max_y).map(|y| MapLocation::new(x, y)).collect()
}

fn main_guest_path() -> Vec<MapLocation> {
    let mut waypoints = column(ZOO_CENTER + 1, 0, ZOO_CENTER);
    waypoints.extend(row(ZOO_CENTER - 1, 2, ZOO_CENTER));
    waypoints
}
