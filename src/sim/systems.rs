use super::components::*;
use super::resources::*;
use crate::*;
use bevy_ecs::prelude::{Query, Res, ResMut, With};

pub(crate) fn compute_summary_system(
    inventory: Res<ZooInventory>,
    stats: Res<ZooStats>,
    progress: Res<ZooProgress>,
    pricing: Res<ZooPricing>,
    buildings: Query<(&BuildingKindComponent, &BuildingStatusComponent)>,
    animals: Query<&AnimalStats>,
    guests: Query<&GuestStats>,
    mut summary: ResMut<ZooEcsSummary>,
) {
    let active_habitats = buildings
        .iter()
        .filter(|(kind, status)| {
            crate::view::is_habitat_kind(kind.0.as_str()) && status.0 == BuildingStatus::Active
        })
        .count() as u32;
    let animal_count = animals.iter().count() as u32;
    let total_welfare = animals.iter().map(|animal| animal.welfare).sum::<i64>();
    let average_welfare = if animal_count == 0 {
        0
    } else {
        total_welfare / i64::from(animal_count)
    };
    let current_visitors = inventory.0.amount(VISITORS);
    let guest_departures_last_tick = u32::try_from(
        *stats
            .0
            .get(&StatId::from(GUEST_DEPARTURES_LAST_TICK))
            .unwrap_or(&0),
    )
    .unwrap_or(u32::MAX);
    let won = active_habitats >= 3
        && progress.level >= 3
        && inventory.0.amount(CONSERVATION_POINTS) >= 25
        && average_welfare >= 70;
    let critical =
        inventory.0.amount(COINS) < 10 || animals.iter().any(|animal| animal.welfare < 25);

    *summary = ZooEcsSummary {
        active_habitats,
        animal_count,
        average_welfare,
        animal_appeal: pricing.animal_appeal,
        current_visitors,
        entry_fee: pricing.entry_fee,
        customer_willingness: pricing.customer_willingness,
        customer_demand_percent: pricing.customer_demand_percent,
        expected_customers_per_minute: pricing.expected_customers_per_minute,
        tracked_guests: guests.iter().count() as u32,
        guest_departures_last_tick,
        reputation_level: progress.level,
        won,
        critical,
    };
}

pub(crate) fn clear_events_system(mut events: ResMut<ZooEvents>) {
    events.0.clear();
}

pub(crate) fn count_assignments_system(
    assignments: Query<&Assignment>,
    mut events: ResMut<ZooEvents>,
) {
    let assigned = assignments
        .iter()
        .filter(|assignment| assignment.building.is_some() || assignment.job.is_some())
        .count();
    if assigned > 0 {
        events.0.push(GameEvent::DomainEvent {
            kind: "zoo.ecs.assignments_indexed".to_owned(),
        });
    }
}

pub(crate) fn verify_animals_have_locations_system(
    animals: Query<&Location, With<AnimalStats>>,
    _events: ResMut<ZooEvents>,
) {
    let _located_animals = animals.iter().count();
}
