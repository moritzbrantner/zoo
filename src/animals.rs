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
    pub(crate) required_visitors: u64,
    pub(crate) appeal: i64,
    pub(crate) animal_area_kind: &'static str,
    pub(crate) min_level: u32,
    pub(crate) fence_kind: &'static str,
    pub(crate) min_fence_count: u32,
    pub(crate) purchase_cost: &'static [(&'static str, u64)],
}

const ZEBRA_PURCHASE_COST: &[(&str, u64)] = &[(COINS, 35), (ANIMAL_FEED, 8), (WATER, 4)];
const TORTOISE_PURCHASE_COST: &[(&str, u64)] = &[(COINS, 45), (VEGETABLES, 10), (MEDICINE, 2)];
const FLAMINGO_PURCHASE_COST: &[(&str, u64)] = &[(COINS, 55), (FISH, 12), (WATER, 10)];
const PARROT_PURCHASE_COST: &[(&str, u64)] =
    &[(COINS, 65), (ANIMAL_FEED, 10), (RESEARCH_POINTS, 4)];
const LION_PURCHASE_COST: &[(&str, u64)] = &[(COINS, 80), (MEAT, 16), (WATER, 6)];

const ANIMAL_SPECIES: &[AnimalSpeciesDefinition] = &[
    AnimalSpeciesDefinition {
        kind: ZEBRA_HERD,
        label: "Zebra Herd",
        required_visitors: 0,
        appeal: 12,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: WOOD_FENCE,
        min_fence_count: 1,
        purchase_cost: ZEBRA_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: TORTOISE_GROUP,
        label: "Tortoise Group",
        required_visitors: 12,
        appeal: 10,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: WOOD_FENCE,
        min_fence_count: 2,
        purchase_cost: TORTOISE_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: FLAMINGO_FLOCK,
        label: "Flamingo Flock",
        required_visitors: 24,
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
        required_visitors: 40,
        appeal: 24,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: GLASS_BARRIER,
        min_fence_count: 2,
        purchase_cost: PARROT_PURCHASE_COST,
    },
    AnimalSpeciesDefinition {
        kind: LION_PRIDE,
        label: "Lion Pride",
        required_visitors: 60,
        appeal: 32,
        animal_area_kind: ANIMAL_AREA,
        min_level: 1,
        fence_kind: STEEL_FENCE,
        min_fence_count: 2,
        purchase_cost: LION_PURCHASE_COST,
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

pub(crate) fn species_unlock_stat(kind: &str) -> Option<&'static str> {
    match kind {
        ZEBRA_HERD => Some(ANIMAL_UNLOCK_ZEBRA_HERD),
        TORTOISE_GROUP => Some(ANIMAL_UNLOCK_TORTOISE_GROUP),
        FLAMINGO_FLOCK => Some(ANIMAL_UNLOCK_FLAMINGO_FLOCK),
        PARROT_PAIR => Some(ANIMAL_UNLOCK_PARROT_PAIR),
        LION_PRIDE => Some(ANIMAL_UNLOCK_LION_PRIDE),
        _ => None,
    }
}

pub(crate) fn is_species_unlocked(state: &GameState, kind: &str) -> bool {
    species_unlock_stat(kind).is_some_and(|stat| state.stat(stat) > 0)
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
            if let Some(stat) = species_unlock_stat(species.kind) {
                state.set_stat(stat, 1);
                events.push(GameEvent::DomainEvent {
                    kind: format!("zoo.species_unlocked.{}", species.kind),
                });
            }
        }
    }
    events
}

pub(crate) fn backfill_species_unlocks(state: &mut GameState) -> Result<(), EngineError> {
    if let Some(stat) = species_unlock_stat(ZEBRA_HERD) {
        state.set_stat(stat, 1);
    }

    let current_visitors = state.inventory().amount(VISITORS);
    for species in animal_species_definitions() {
        let already_present = state.entities().any(|entity| entity.kind() == species.kind);
        if (current_visitors >= species.required_visitors || already_present)
            && let Some(stat) = species_unlock_stat(species.kind)
        {
            state.set_stat(stat, 1);
        }
    }
    Ok(())
}
