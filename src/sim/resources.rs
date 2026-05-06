use crate::*;
use bevy_ecs::prelude::Resource;
use std::collections::BTreeMap;

#[derive(Resource, Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct SimClock {
    pub(crate) now_seconds: u64,
    pub(crate) delta_seconds: u64,
}

#[derive(Resource, Clone, Debug, Eq, PartialEq)]
pub(crate) struct ZooInventory(pub(crate) ResourceStorage);

#[derive(Resource, Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct ZooStats(pub(crate) BTreeMap<StatId, i64>);

#[derive(Resource, Clone, Debug, Eq, PartialEq)]
pub(crate) struct ZooProgress {
    pub(crate) level: u32,
    pub(crate) xp: u64,
}

#[derive(Resource, Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct ZooMap {
    pub(crate) ground_count: usize,
    pub(crate) path_count: usize,
    pub(crate) area_count: usize,
    pub(crate) fence_count: usize,
}

#[derive(Resource, Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct ZooEvents(pub(crate) Vec<GameEvent>);

#[derive(Resource, Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ZooPricing {
    pub(crate) entry_fee: i64,
    pub(crate) animal_appeal: i64,
    pub(crate) customer_willingness: i64,
    pub(crate) customer_demand_percent: i64,
    pub(crate) expected_customers_per_minute: u32,
}

impl From<crate::pricing::PricingSnapshot> for ZooPricing {
    fn from(pricing: crate::pricing::PricingSnapshot) -> Self {
        Self {
            entry_fee: pricing.entry_fee,
            animal_appeal: pricing.animal_appeal,
            customer_willingness: pricing.customer_willingness,
            customer_demand_percent: pricing.customer_demand_percent,
            expected_customers_per_minute: pricing.expected_customers_per_minute,
        }
    }
}

#[derive(Resource, Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct ZooEcsSummary {
    pub(crate) active_habitats: u32,
    pub(crate) animal_count: u32,
    pub(crate) average_welfare: i64,
    pub(crate) animal_appeal: i64,
    pub(crate) current_visitors: u64,
    pub(crate) entry_fee: i64,
    pub(crate) customer_willingness: i64,
    pub(crate) customer_demand_percent: i64,
    pub(crate) expected_customers_per_minute: u32,
    pub(crate) tracked_guests: u32,
    pub(crate) guest_departures_last_tick: u32,
    pub(crate) reputation_level: u32,
    pub(crate) won: bool,
    pub(crate) critical: bool,
}

impl ZooEcsSummary {
    pub(crate) fn matches_view_summary(&self, summary: &ZooSummary) -> bool {
        self.active_habitats == summary.active_habitats
            && self.animal_count == summary.animal_count
            && self.average_welfare == summary.average_welfare
            && self.animal_appeal == summary.animal_appeal
            && self.current_visitors == summary.current_visitors
            && self.entry_fee == summary.entry_fee
            && self.customer_willingness == summary.customer_willingness
            && self.customer_demand_percent == summary.customer_demand_percent
            && self.expected_customers_per_minute == summary.expected_customers_per_minute
            && self.tracked_guests == summary.tracked_guests
            && self.guest_departures_last_tick == summary.guest_departures_last_tick
            && self.reputation_level == summary.reputation_level
            && self.won == summary.won
            && self.critical == summary.critical
    }
}
