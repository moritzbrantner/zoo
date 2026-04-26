use super::*;

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub(crate) struct PricingSnapshot {
    pub(crate) entry_fee: i64,
    pub(crate) animal_appeal: i64,
    pub(crate) customer_willingness: i64,
    pub(crate) customer_demand_percent: i64,
    pub(crate) expected_customers_per_minute: u32,
}

pub fn set_park_entry_fee(
    state: &mut GameState,
    entry: BuildingId,
    value: i64,
) -> Result<i64, EngineError> {
    let clamped = value.clamp(0, MAX_ENTRY_FEE);
    state.set_building_stat(entry, ENTRY_FEE, clamped)?;
    Ok(clamped)
}

fn park_entry_fee(state: &GameState) -> i64 {
    state
        .buildings()
        .find(|building| building.kind.as_str() == CUSTOMER_ENTRY)
        .and_then(|building| building.stats.get(&StatId::from(ENTRY_FEE)).copied())
        .unwrap_or(DEFAULT_ENTRY_FEE)
        .clamp(0, MAX_ENTRY_FEE)
}

pub(crate) fn pricing_snapshot(state: &GameState) -> PricingSnapshot {
    let entry_fee = park_entry_fee(state);
    let animal_count = state
        .entities()
        .filter(|entity| is_animal_kind(entity.kind()))
        .count() as u32;
    let animal_appeal = state
        .entities()
        .filter(|entity| is_animal_kind(entity.kind()))
        .map(|entity| animal_kind_appeal(entity.kind()))
        .sum::<i64>();
    let average_welfare = average_animal_welfare(state);
    let welfare_bonus = if animal_count == 0 {
        0
    } else {
        (average_welfare - 50).max(0) / 8
    };
    let reputation_bonus = i64::try_from(state.inventory().amount(REPUTATION) / 8).unwrap_or(0);
    let customer_willingness = (8 + animal_appeal + welfare_bonus + reputation_bonus).max(1);
    let customer_demand_percent = customer_demand_percent(entry_fee, customer_willingness);
    let maximum_customers_per_minute: u32 = if animal_count == 0 {
        0
    } else {
        6 + animal_count.saturating_mul(8) + u32::try_from(animal_appeal.max(0) / 2).unwrap_or(0)
    };
    let expected_customers_per_minute =
        maximum_customers_per_minute.saturating_mul(customer_demand_percent as u32) / 100;

    PricingSnapshot {
        entry_fee,
        animal_appeal,
        customer_willingness,
        customer_demand_percent,
        expected_customers_per_minute,
    }
}

fn customer_demand_percent(entry_fee: i64, willingness: i64) -> i64 {
    if entry_fee <= 0 {
        return 100;
    }

    let willingness = willingness.max(1);
    if entry_fee <= willingness {
        100 - (entry_fee * 30 / willingness)
    } else {
        (70 - ((entry_fee - willingness) * 70 / willingness)).clamp(0, 70)
    }
    .clamp(0, 100)
}

pub(crate) fn expected_customer_arrivals(pricing: &PricingSnapshot, delta_seconds: u64) -> u64 {
    if delta_seconds == 0 || pricing.expected_customers_per_minute == 0 {
        return 0;
    }
    u64::from(pricing.expected_customers_per_minute)
        .saturating_mul(delta_seconds)
        .div_ceil(60)
}

pub(crate) fn average_animal_welfare(state: &GameState) -> i64 {
    let mut count = 0_i64;
    let mut total = 0_i64;
    for entity in state
        .entities()
        .filter(|entity| is_animal_kind(entity.kind()))
    {
        count += 1;
        total += entity
            .stats
            .get(&StatId::from(WELFARE))
            .copied()
            .unwrap_or(0);
    }
    if count == 0 { 0 } else { total / count }
}
