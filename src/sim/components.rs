use crate::*;
use bevy_ecs::prelude::Component;
use farm_engine::{BuildingKind, JobId};
use std::collections::BTreeMap;

#[derive(Component, Clone, Debug, Eq, PartialEq)]
pub(crate) struct LegacyBuildingId(pub(crate) BuildingId);

#[derive(Component, Clone, Debug, Eq, PartialEq)]
pub(crate) struct LegacyEntityId(pub(crate) EntityId);

#[derive(Component, Clone, Debug, Eq, PartialEq)]
pub(crate) struct Location(pub(crate) MapLocation);

#[derive(Component, Clone, Debug, Eq, PartialEq)]
pub(crate) struct BuildingKindComponent(pub(crate) BuildingKind);

#[derive(Component, Clone, Debug, Eq, PartialEq)]
pub(crate) struct BuildingStatusComponent(pub(crate) BuildingStatus);

#[derive(Component, Clone, Debug, Eq, PartialEq)]
pub(crate) struct BuildingStats(pub(crate) BTreeMap<StatId, i64>);

#[derive(Component, Clone, Debug, Eq, PartialEq)]
pub(crate) struct InventoryComponent(pub(crate) ResourceStorage);

#[derive(Component, Clone, Debug, Eq, PartialEq)]
pub(crate) struct EntityKindComponent {
    pub(crate) blueprint: EntityBlueprintRef,
    pub(crate) kind: String,
}

#[derive(Component, Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct AnimalStats {
    pub(crate) hunger: i64,
    pub(crate) health: i64,
    pub(crate) welfare: i64,
    pub(crate) habitat_id: i64,
    pub(crate) feed_progress: i64,
}

#[derive(Component, Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct GuestStats {
    pub(crate) excitement: i64,
    pub(crate) patience: i64,
    pub(crate) spend_chance: i64,
}

#[derive(Component, Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct Assignment {
    pub(crate) building: Option<BuildingId>,
    pub(crate) job: Option<JobId>,
}
