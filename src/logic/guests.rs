use super::*;
use std::collections::BTreeSet;

const GUEST_EXCITEMENT_INTERVAL_SECONDS: u64 = 5;
const GUEST_EXCITEMENT_GAIN: i64 = 6;
const EDUCATOR_EXCITEMENT_BONUS: i64 = 2;
const GUEST_EXCITEMENT_DECAY: i64 = 4;
const GUEST_PATIENCE_GAIN: i64 = 3;
const GUEST_PATIENCE_DECAY: i64 = 6;
const MAX_TRACKED_GUESTS: usize = 8;
const SEEDED_GUEST_NAMES: &[&str] = &["Mira", "Sam", "Taylor", "Rin"];

pub(crate) struct GuestTickOutcome {
    pub(crate) events: Vec<GameEvent>,
    pub(crate) arrivals: u64,
    pub(crate) departures: u64,
    pub(crate) excited_guest_count: u64,
}

pub(crate) fn sync_tracked_guests(state: &mut GameState) -> Result<(), EngineError> {
    let target = usize::try_from(state.inventory().amount(VISITORS))
        .unwrap_or(MAX_TRACKED_GUESTS)
        .min(MAX_TRACKED_GUESTS);
    let mut guests = tracked_guest_records(state);
    guests.sort_by_key(|entity| entity.id.get());

    for guest in guests.iter().skip(target) {
        state.remove_entity(guest.id)?;
    }

    let existing_names = tracked_guest_records(state)
        .into_iter()
        .filter_map(|guest| guest.name)
        .collect::<BTreeSet<_>>();
    let current_count = tracked_guest_records(state).len();
    for spawn_index in current_count..target {
        let guest = state.spawn_entity(
            EntityBlueprintRef::Npc(GUEST.into()),
            Some(next_guest_name(&existing_names, spawn_index)),
            tracked_guest_spawn_location(state, spawn_index),
        )?;
        state.set_entity_stat(guest, EXCITEMENT, 20)?;
        state.set_entity_stat(guest, PATIENCE, 80)?;
        state.set_entity_stat(guest, SPEND_CHANCE, 20)?;
    }

    Ok(())
}

pub(crate) fn update_guest_satisfaction_and_departures(
    state: &mut GameState,
    delta_seconds: u64,
) -> Result<GuestTickOutcome, EngineError> {
    if delta_seconds == 0 {
        state.set_stat(GUEST_DEPARTURES_LAST_TICK, 0);
        return Ok(GuestTickOutcome {
            events: Vec::new(),
            arrivals: 0,
            departures: 0,
            excited_guest_count: 0,
        });
    }

    let habitats = active_habitats(state)
        .into_iter()
        .map(|(_, location)| location)
        .collect::<Vec<_>>();
    let pricing = pricing_snapshot(state);
    let guests = tracked_guest_records(state)
        .into_iter()
        .map(|entity| {
            let excitement = entity
                .stats
                .get(&StatId::from(EXCITEMENT))
                .copied()
                .unwrap_or(0);
            let patience = entity
                .stats
                .get(&StatId::from(PATIENCE))
                .copied()
                .unwrap_or(80);
            (entity.id, entity.location, excitement, patience)
        })
        .collect::<Vec<_>>();
    let educators = assigned_staff_count(state, EDUCATOR, None);
    let mut excited = 0_u64;
    let mut leaving = Vec::new();
    let tracked_count = u64::try_from(guests.len()).unwrap_or(u64::MAX);
    let current_visitors = state.inventory().amount(VISITORS);
    let price_pressure = pricing
        .entry_fee
        .saturating_sub(pricing.customer_willingness)
        .max(0);

    for (guest, location, current_excitement, current_patience) in guests {
        let near_habitat = habitats
            .iter()
            .any(|habitat| location.manhattan_distance_to(*habitat) <= 3);
        let excitement =
            updated_guest_excitement(current_excitement, near_habitat, educators, delta_seconds);
        let patience = updated_guest_patience(
            current_patience,
            near_habitat,
            price_pressure,
            delta_seconds,
        );

        state.set_entity_stat(guest, EXCITEMENT, excitement)?;
        state.set_entity_stat(guest, PATIENCE, patience)?;
        state.set_entity_stat(
            guest,
            SPEND_CHANCE,
            ((excitement / 2) * pricing.customer_demand_percent / 100).clamp(0, 80),
        )?;
        if guest_should_leave(excitement, patience) {
            leaving.push(guest);
            continue;
        }
        if excitement >= 70 {
            excited += 1;
        }
    }

    let leaving_count = u64::try_from(leaving.len()).unwrap_or(u64::MAX);
    let departures = if tracked_count == 0 || leaving_count == 0 {
        0
    } else {
        leaving_count
            .max(current_visitors.saturating_mul(leaving_count) / tracked_count)
            .min(current_visitors)
    };

    let mut events = Vec::new();
    for guest in leaving {
        state.remove_entity(guest)?;
        events.push(GameEvent::EntityRemoved {
            kind: "entity".to_owned(),
            id: guest.get(),
        });
    }

    if departures > 0 {
        state.inventory_mut().remove(VISITORS, departures)?;
    }
    state.set_stat(
        GUEST_DEPARTURES_LAST_TICK,
        i64::try_from(departures).unwrap_or(i64::MAX),
    );

    Ok(GuestTickOutcome {
        events,
        arrivals: expected_customer_arrivals(&pricing, delta_seconds),
        departures,
        excited_guest_count: excited,
    })
}

pub(crate) fn active_habitats(state: &GameState) -> Vec<(BuildingId, MapLocation)> {
    state
        .buildings()
        .filter(|building| {
            is_habitat_kind(building.kind.as_str()) && building.status == BuildingStatus::Active
        })
        .map(|building| (building.id, building.location))
        .collect()
}

fn updated_guest_excitement(
    current: i64,
    near_habitat: bool,
    educators: u32,
    delta_seconds: u64,
) -> i64 {
    let intervals = i64::try_from(delta_seconds.div_ceil(GUEST_EXCITEMENT_INTERVAL_SECONDS))
        .unwrap_or(i64::MAX);
    let change = if near_habitat {
        intervals.saturating_mul(
            GUEST_EXCITEMENT_GAIN + i64::from(educators.min(3)) * EDUCATOR_EXCITEMENT_BONUS,
        )
    } else {
        -intervals.saturating_mul(GUEST_EXCITEMENT_DECAY)
    };
    current.saturating_add(change).clamp(0, 100)
}

fn updated_guest_patience(
    current: i64,
    near_habitat: bool,
    price_pressure: i64,
    delta_seconds: u64,
) -> i64 {
    let intervals = i64::try_from(delta_seconds.div_ceil(GUEST_EXCITEMENT_INTERVAL_SECONDS))
        .unwrap_or(i64::MAX);
    let change = if near_habitat {
        intervals.saturating_mul(GUEST_PATIENCE_GAIN)
    } else {
        -intervals.saturating_mul(GUEST_PATIENCE_DECAY + price_pressure / 10)
    };
    current.saturating_add(change).clamp(0, 100)
}

pub(crate) fn guest_should_leave(excitement: i64, patience: i64) -> bool {
    excitement <= 10 || patience <= 20
}

fn tracked_guest_records(state: &GameState) -> Vec<EntityRecord> {
    state
        .entities()
        .filter(|entity| entity.kind() == GUEST)
        .collect()
}

fn next_guest_name(existing_names: &BTreeSet<String>, spawn_index: usize) -> String {
    for name in SEEDED_GUEST_NAMES {
        if !existing_names.contains(*name) {
            return (*name).to_owned();
        }
    }
    format!("Guest {}", spawn_index + 1)
}

fn tracked_guest_spawn_location(state: &GameState, spawn_index: usize) -> MapLocation {
    let entry_location = state
        .buildings()
        .find(|building| building.kind.as_str() == CUSTOMER_ENTRY)
        .map(|building| building.location)
        .unwrap_or_else(|| MapLocation::new(ZOO_CENTER, 1));
    let y_offset = i32::try_from(spawn_index)
        .unwrap_or(i32::MAX)
        .saturating_mul(2)
        + 2;
    MapLocation::new(
        entry_location.x + 1,
        (entry_location.y + y_offset).min(ZOO_CENTER),
    )
}
