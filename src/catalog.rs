use super::*;

pub fn zoo_catalog() -> Catalog {
    let mut catalog = Catalog::new();

    for (id, name) in [
        (COINS, "Coins"),
        (LUMBER, "Lumber"),
        (VEGETABLES, "Vegetables"),
        (MEAT, "Meat"),
        (FISH, "Fish"),
        (ANIMAL_FEED, "Animal Feed"),
        (MEDICINE, "Medicine"),
        (WATER, "Water"),
        (VISITORS, "Visitors"),
        (RESEARCH_POINTS, "Research Points"),
        (REPUTATION, "Reputation"),
        (CONSERVATION_POINTS, "Conservation Points"),
    ] {
        catalog.add_resource(ResourceDefinition::new(id, name));
    }

    catalog.add_level(
        LevelDefinition::new(2, 50)
            .with_effects(vec![Effect::UnlockBuilding(WETLANDS_HABITAT.into())]),
    );
    catalog.add_level(LevelDefinition::new(3, 140).with_effects(vec![
        Effect::UnlockBuilding(AVIARY.into()),
        Effect::UnlockBuilding(REPTILE_HOUSE.into()),
    ]));

    catalog.add_tile(TileDefinition::new(GRASS, "Grass").with_tags(vec!["terrain".to_owned()]));
    catalog.add_tile(
        TileDefinition::new(WATER_TILE, "Water")
            .with_buildable(false)
            .with_walkable(false),
    );
    catalog.add_tile(
        TileDefinition::new(ROCK, "Rock")
            .with_buildable(false)
            .with_walkable(false),
    );
    catalog.add_tile(TileDefinition::new(SERVICE_FLOOR, "Service Floor"));
    catalog.add_tile(TileDefinition::new(PLAZA, "Plaza"));

    catalog.add_path(PathDefinition::new(
        GUEST_PATH,
        "Guest Path",
        vec![ResourceAmount::new(LUMBER, 1)],
    ));
    catalog.add_path(PathDefinition::new(
        SERVICE_PATH,
        "Service Path",
        vec![ResourceAmount::new(LUMBER, 1)],
    ));

    catalog.add_area(AreaDefinition::new(
        BUILDABLE_GRASS,
        "Buildable Grass",
        Vec::new(),
    ));
    catalog.add_area(AreaDefinition::new(
        STARTER_PLOT,
        "Starter Plot",
        Vec::new(),
    ));
    catalog.add_area(AreaDefinition::new(
        HABITAT_ZONE,
        "Habitat Zone",
        Vec::new(),
    ));
    catalog.add_area(AreaDefinition::new(GUEST_ZONE, "Guest Zone", Vec::new()));
    catalog.add_area(AreaDefinition::new(STAFF_ZONE, "Staff Zone", Vec::new()));

    catalog.add_fence(
        FenceDefinition::new(
            WOOD_FENCE,
            "Wood Fence",
            vec![ResourceAmount::new(LUMBER, 2)],
        )
        .with_height(2)
        .with_placement_rules(fence_rules()),
    );
    catalog.add_fence(
        FenceDefinition::new(
            STEEL_FENCE,
            "Steel Fence",
            vec![ResourceAmount::new(LUMBER, 4)],
        )
        .with_height(3)
        .with_placement_rules(fence_rules()),
    );
    catalog.add_fence(
        FenceDefinition::new(
            GLASS_BARRIER,
            "Glass Barrier",
            vec![
                ResourceAmount::new(COINS, 12),
                ResourceAmount::new(LUMBER, 3),
            ],
        )
        .with_height(2)
        .with_placement_rules(fence_rules()),
    );

    for (kind, name, cost) in [
        (ZOOKEEPER, "Zookeeper", vec![ResourceAmount::new(COINS, 18)]),
        (
            VETERINARIAN,
            "Veterinarian",
            vec![
                ResourceAmount::new(COINS, 30),
                ResourceAmount::new(REPUTATION, 2),
            ],
        ),
        (MECHANIC, "Mechanic", vec![ResourceAmount::new(COINS, 20)]),
        (EDUCATOR, "Educator", vec![ResourceAmount::new(COINS, 24)]),
    ] {
        catalog.add_unit(UnitDefinition::new(kind, name, cost));
    }

    catalog.add_npc(NpcDefinition::new(GUEST, "Guest"));
    for species in animal_species_definitions() {
        catalog.add_npc(
            NpcDefinition::new(species.kind, species.label).with_requirements(vec![
                Requirement::HasBuilding {
                    kind: ANIMAL_AREA.into(),
                    min_level: 1,
                    count: 1,
                },
            ]),
        );
    }

    add_entry_and_guest_buildings(&mut catalog);
    add_staff_buildings(&mut catalog);
    add_habitats(&mut catalog);
    add_tech_and_upgrades(&mut catalog);
    catalog
}
