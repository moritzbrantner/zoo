use super::*;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AnimalAreaRequirements {
    pub animal_area_kind: &'static str,
    pub min_level: u32,
    pub fence_kind: &'static str,
    pub min_fence_count: u32,
    pub purchase_cost: Vec<ResourceAmount>,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub(crate) struct AnimalSpeciesDefinition {
    pub(crate) kind: &'static str,
    pub(crate) label: &'static str,
    pub(crate) unlock_stat: &'static str,
    pub(crate) required_visitors: u64,
    pub(crate) appeal: i64,
    pub(crate) animal_area_kind: &'static str,
    pub(crate) min_level: u32,
    pub(crate) fence_kind: &'static str,
    pub(crate) min_fence_count: u32,
    pub(crate) purchase_cost: &'static [(&'static str, u64)],
}

const RABBIT_PURCHASE_COST: &[(&str, u64)] = &[(COINS, 18), (VEGETABLES, 4), (WATER, 2)];
const TORTOISE_PURCHASE_COST: &[(&str, u64)] = &[(COINS, 28), (VEGETABLES, 8), (MEDICINE, 2)];
const ZEBRA_PURCHASE_COST: &[(&str, u64)] = &[(COINS, 40), (ANIMAL_FEED, 8), (WATER, 4)];
const FLAMINGO_PURCHASE_COST: &[(&str, u64)] = &[(COINS, 56), (FISH, 12), (WATER, 10)];
const PARROT_PURCHASE_COST: &[(&str, u64)] =
    &[(COINS, 72), (ANIMAL_FEED, 10), (RESEARCH_POINTS, 4)];
const WOLF_PURCHASE_COST: &[(&str, u64)] = &[(COINS, 92), (MEAT, 14), (WATER, 6)];
const LION_PURCHASE_COST: &[(&str, u64)] = &[(COINS, 116), (MEAT, 18), (WATER, 8)];
const GORILLA_PURCHASE_COST: &[(&str, u64)] = &[
    (COINS, 138),
    (VEGETABLES, 14),
    (ANIMAL_FEED, 8),
    (MEDICINE, 6),
];
const ELEPHANT_PURCHASE_COST: &[(&str, u64)] = &[
    (COINS, 172),
    (VEGETABLES, 24),
    (WATER, 18),
    (MEDICINE, 8),
];

const ANIMAL_SPECIES: &[AnimalSpeciesDefinition] = &[
    AnimalSpeciesDefinition {
        kind: RABBIT_COLONY,
        label: "Rabbit Colony",
        unlock_stat: ANIMAL_UNLOCK_RABBIT_COLONY,
        required_visitors: 0,
        appeal: 6,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: WOOD_FENCE,
        min_fence_count: 1,
        purchase_cost: RABBIT_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: TORTOISE_GROUP,
        label: "Tortoise Group",
        unlock_stat: ANIMAL_UNLOCK_TORTOISE_GROUP,
        required_visitors: 10,
        appeal: 10,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: WOOD_FENCE,
        min_fence_count: 2,
        purchase_cost: TORTOISE_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: ZEBRA_HERD,
        label: "Zebra Herd",
        unlock_stat: ANIMAL_UNLOCK_ZEBRA_HERD,
        required_visitors: 20,
        appeal: 14,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: WOOD_FENCE,
        min_fence_count: 2,
        purchase_cost: ZEBRA_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: FLAMINGO_FLOCK,
        label: "Flamingo Flock",
        unlock_stat: ANIMAL_UNLOCK_FLAMINGO_FLOCK,
        required_visitors: 32,
        appeal: 18,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: GLASS_BARRIER,
        min_fence_count: 1,
        purchase_cost: FLAMINGO_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: PARROT_PAIR,
        label: "Parrot Pair",
        unlock_stat: ANIMAL_UNLOCK_PARROT_PAIR,
        required_visitors: 48,
        appeal: 22,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: GLASS_BARRIER,
        min_fence_count: 2,
        purchase_cost: PARROT_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: WOLF_PACK,
        label: "Wolf Pack",
        unlock_stat: ANIMAL_UNLOCK_WOLF_PACK,
        required_visitors: 68,
        appeal: 28,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: STEEL_FENCE,
        min_fence_count: 1,
        purchase_cost: WOLF_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: LION_PRIDE,
        label: "Lion Pride",
        unlock_stat: ANIMAL_UNLOCK_LION_PRIDE,
        required_visitors: 90,
        appeal: 34,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: STEEL_FENCE,
        min_fence_count: 2,
        purchase_cost: LION_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: GORILLA_TROOP,
        label: "Gorilla Troop",
        unlock_stat: ANIMAL_UNLOCK_GORILLA_TROOP,
        required_visitors: 115,
        appeal: 42,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: STEEL_FENCE,
        min_fence_count: 3,
        purchase_cost: GORILLA_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: ELEPHANT_HERD,
        label: "Elephant Herd",
        unlock_stat: ANIMAL_UNLOCK_ELEPHANT_HERD,
        required_visitors: 145,
        appeal: 52,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: STEEL_FENCE,
        min_fence_count: 4,
        purchase_cost: ELEPHANT_PURCHASE_COST,
    },
];

pub(crate) fn animal_species_definitions() -> &'static [AnimalSpeciesDefinition] {
    ANIMAL_SPECIES
}

pub(crate) fn animal_species(kind: &str) -> Option<&'static AnimalSpeciesDefinition> {
    ANIMAL_SPECIES.iter().find(|species| species.kind == kind)
}

pub(crate) fn animal_kind_label(kind: &str) -> Option<&'static str> {
    animal_species(kind).map(|species| species.label)
}

pub(crate) fn animal_kind_appeal(kind: &str) -> i64 {
    animal_species(kind)
        .map(|species| species.appeal)
        .unwrap_or(0)
}

pub(crate) fn is_animal_kind(kind: &str) -> bool {
    animal_species(kind).is_some()
}

pub(crate) fn is_species_unlocked(state: &GameState, kind: &str) -> bool {
    animal_species(kind).is_some_and(|species| state.stat(species.unlock_stat) > 0)
}

pub fn animal_area_requirements(kind: &str) -> Option<AnimalAreaRequirements> {
    let species = animal_species(kind)?;
    Some(AnimalAreaRequirements {
        animal_area_kind: species.animal_area_kind,
        min_level: species.min_level,
        fence_kind: species.fence_kind,
        min_fence_count: species.min_fence_count,
        purchase_cost: species
            .purchase_cost
            .iter()
            .map(|(resource, amount)| ResourceAmount::new(*resource, *amount))
            .collect(),
    })
}

pub(crate) fn unlock_species_for_current_visitors(state: &mut GameState) -> Vec<GameEvent> {
    let current_visitors = state.inventory().amount(VISITORS);
    let mut events = Vec::new();
    for species in animal_species_definitions() {
        if current_visitors >= species.required_visitors
            && !is_species_unlocked(state, species.kind)
        {
            state.set_stat(species.unlock_stat, 1);
            events.push(GameEvent::DomainEvent {
                kind: format!("zoo.species_unlocked.{}", species.kind),
            });
        }
    }
    events
}

pub(crate) fn backfill_species_unlocks(state: &mut GameState) -> Result<(), EngineError> {
    let current_visitors = state.inventory().amount(VISITORS);
    for species in animal_species_definitions() {
        let already_present = state.entities().any(|entity| entity.kind() == species.kind);
        if current_visitors >= species.required_visitors || already_present {
            state.set_stat(species.unlock_stat, 1);
        }
    }
    Ok(())
}
