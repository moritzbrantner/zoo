use super::*;

mod guests;

pub(crate) use self::guests::{active_habitats, guest_should_leave};
use self::guests::{sync_tracked_guests, update_guest_satisfaction_and_departures};

const ANIMAL_FEED_INTERVAL_SECONDS: u64 = 30;
const ANIMAL_HUNGER_RELIEF_PER_MEAL: i64 = 16;
const ANIMAL_HUNGER_PENALTY_PER_MISSED_MEAL: i64 = 12;
const FEED_DELIVERY_COST: u64 = 5;
const FEED_DELIVERY_BUFFER_MEALS: u64 = 3;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct ZooRevenueTick {
    ticket_revenue: u64,
    guest_spend: u64,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct FeedDeliveryTick {
    events: Vec<GameEvent>,
    cost: u64,
}

#[derive(Default)]
pub struct ZooLogic;

impl GameLogic for ZooLogic {
    fn after_advance_time(
        &mut self,
        state: &mut GameState,
        delta_seconds: u64,
        _completions: &[JobCompletion],
    ) -> Result<Vec<GameEvent>, EngineError> {
        backfill_species_unlocks(state)?;
        update_building_stats(state, delta_seconds)?;
        sync_tracked_guests(state)?;
        let guest_outcome = update_guest_satisfaction_and_departures(state, delta_seconds)?;
        let revenue = apply_guest_arrivals_and_revenue(state, delta_seconds, &guest_outcome)?;
        sync_tracked_guests(state)?;
        let mut events = guest_outcome.events;
        let feed = deliver_animal_feed(state, delta_seconds)?;
        events.extend(feed.events);
        record_economy_tick(state, delta_seconds, revenue, feed.cost)?;
        update_animal_welfare(state, delta_seconds)?;
        events.extend(unlock_species_for_current_visitors(state));
        update_progression(state)?;
        events.push(GameEvent::DomainEvent {
            kind: "zoo.logic_tick".to_owned(),
        });
        Ok(events)
    }
}

pub fn apply_zoo_command(
    state: &mut GameState,
    command: impl Into<ZooCommand>,
) -> Result<CommandOutcome, ZooError> {
    match command.into() {
        ZooCommand::Engine(command) => apply_zoo_engine_command(state, command),
        ZooCommand::SetEntryFee { building, value } => state.transact(|state| {
            let value = set_park_entry_fee(state, building, value)?;
            Ok(CommandOutcome {
                events: vec![GameEvent::BuildingStatChanged {
                    building,
                    stat: ENTRY_FEE.into(),
                    value,
                }],
            })
        }),
        ZooCommand::BuyAnimal {
            kind,
            name,
            location,
        } => state.transact(|state| {
            let animal_area = animal_area_at_location(state, location).ok_or_else(|| {
                AnimalPurchaseError::NoAnimalAreaAtLocation {
                    animal_kind: kind.to_string(),
                    location,
                }
            })?;
            let animal = match name {
                Some(name) => buy_named_animal_group(state, kind, name, animal_area)?,
                None => buy_animal_group(state, kind, animal_area)?,
            };
            Ok(CommandOutcome {
                events: vec![GameEvent::EntityCreated(animal)],
            })
        }),
        ZooCommand::MoveAnimal { entity, location } => {
            let kind = state
                .entity(entity)
                .and_then(npc_kind_for_entity)
                .ok_or(EngineError::UnknownEntity(entity))?;
            state.transact(|state| {
                let animal_area = animal_area_at_location(state, location).ok_or_else(|| {
                    AnimalPurchaseError::NoAnimalAreaAtLocation {
                        animal_kind: kind.to_string(),
                        location,
                    }
                })?;
                validate_animal_area_for_kind(state, &kind, animal_area, Some(entity))?;
                state.move_entity(entity, location)?;
                state.set_entity_stat(entity, HABITAT_ID, animal_area.get() as i64)?;
                Ok(CommandOutcome {
                    events: vec![GameEvent::EntityMoved(entity)],
                })
            })
        }
    }
}

fn apply_zoo_engine_command(
    state: &mut GameState,
    command: GameCommand,
) -> Result<CommandOutcome, ZooError> {
    match command {
        GameCommand::SetBuildingStat {
            building,
            stat,
            value,
        } if stat.as_str() == ENTRY_FEE => {
            apply_zoo_command(state, ZooCommand::SetEntryFee { building, value })
        }
        GameCommand::SpawnEntity {
            blueprint: EntityBlueprintRef::Npc(kind),
            name,
            location,
        } if is_animal_kind(kind.as_str()) => apply_zoo_command(
            state,
            ZooCommand::BuyAnimal {
                kind,
                name,
                location,
            },
        ),
        GameCommand::MoveEntity { entity, location } => {
            if let Some(kind) = state.entity(entity).and_then(npc_kind_for_entity) {
                if is_animal_kind(kind.as_str()) {
                    return apply_zoo_command(state, ZooCommand::MoveAnimal { entity, location });
                }
            }
            state
                .apply(GameCommand::MoveEntity { entity, location })
                .map_err(ZooError::from)
        }
        command => state.apply(command).map_err(ZooError::from),
    }
}

pub fn buy_animal_group(
    state: &mut GameState,
    kind: impl Into<NpcKind>,
    animal_area: BuildingId,
) -> Result<EntityId, ZooError> {
    let kind = kind.into();
    let name = state
        .catalog()
        .npc(kind.clone())
        .ok_or_else(|| EngineError::UnknownEntityBlueprint(EntityBlueprintRef::Npc(kind.clone())))?
        .name
        .clone();
    buy_named_animal_group(state, kind, name, animal_area)
}

pub fn buy_named_animal_group(
    state: &mut GameState,
    kind: impl Into<NpcKind>,
    name: impl Into<String>,
    animal_area: BuildingId,
) -> Result<EntityId, ZooError> {
    let kind = kind.into();
    require_species_unlocked(state, kind.as_str())?;
    validate_animal_area_for_kind(state, &kind, animal_area, None)?;
    let requirements =
        animal_area_requirements(kind.as_str()).expect("validated animal kind has requirements");

    state
        .inventory_mut()
        .spend(&requirements.purchase_cost)
        .map_err(EngineError::from)?;
    let location = state
        .building(animal_area)
        .ok_or(EngineError::UnknownBuilding(animal_area))?
        .location;
    let animal = state.spawn_entity(EntityBlueprintRef::Npc(kind), Some(name.into()), location)?;
    state.set_entity_stat(animal, HUNGER, 20)?;
    state.set_entity_stat(animal, HEALTH, 85)?;
    state.set_entity_stat(animal, WELFARE, 75)?;
    state.set_entity_stat(animal, HABITAT_ID, animal_area.get() as i64)?;
    state.set_entity_stat(animal, FEED_PROGRESS, 0)?;
    Ok(animal)
}

fn update_building_stats(state: &mut GameState, delta_seconds: u64) -> Result<(), EngineError> {
    if delta_seconds == 0 {
        return Ok(());
    }
    let maintenance_staff = assigned_staff_count(state, MECHANIC, None);
    let building_ids = state
        .buildings()
        .map(|building| building.id)
        .collect::<Vec<_>>();
    for building in building_ids {
        let clean = state.building_stat(building, CLEANLINESS)?;
        let wear = state.building_stat(building, WEAR)?;
        state.set_building_stat(building, CLEANLINESS, (clean - 1).max(35))?;
        state.set_building_stat(
            building,
            WEAR,
            if maintenance_staff > 0 {
                (wear - 1).max(0)
            } else {
                (wear + 1).min(100)
            },
        )?;
        if state.building_stat(building, APPEAL)? == 0 {
            state.set_building_stat(building, APPEAL, 50)?;
        }
    }
    Ok(())
}

fn update_animal_welfare(state: &mut GameState, delta_seconds: u64) -> Result<(), EngineError> {
    if delta_seconds == 0 {
        return Ok(());
    }
    let veterinarian_count = assigned_staff_count(state, VETERINARIAN, None);
    let keeper_count = assigned_staff_count(state, ZOOKEEPER, None);
    let animal_ids = state
        .entities()
        .filter(|entity| is_animal_kind(entity.kind()))
        .map(|entity| entity.id)
        .collect::<Vec<_>>();

    for animal in animal_ids {
        let habitat = habitat_for_animal(state, animal)?;
        let (fed_meals, missed_meals, feed_progress) =
            resolve_animal_meals(state, animal, habitat, delta_seconds)?;
        let hunger = (state.entity_stat(animal, HUNGER)?
            + i64::try_from(delta_seconds / 10).unwrap_or(0)
            + 1
            + i64::try_from(missed_meals).unwrap_or(i64::MAX)
                * ANIMAL_HUNGER_PENALTY_PER_MISSED_MEAL
            - i64::try_from(fed_meals).unwrap_or(i64::MAX) * ANIMAL_HUNGER_RELIEF_PER_MEAL)
            .clamp(0, 100);
        let mut health = state.entity_stat(animal, HEALTH)?;
        if missed_meals > 0 || hunger > 80 {
            health -= 4;
        } else if veterinarian_count > 0 {
            health += 2;
        }
        health = health.clamp(0, 100);
        let care_bonus =
            i64::from(keeper_count.min(3)) * 4 + i64::from(veterinarian_count.min(2)) * 3;
        let welfare = (100 - hunger / 2 + health / 3 + care_bonus).clamp(0, 100);
        state.set_entity_stat(animal, HUNGER, hunger)?;
        state.set_entity_stat(animal, HEALTH, health)?;
        state.set_entity_stat(animal, WELFARE, welfare)?;
        state.set_entity_stat(
            animal,
            FEED_PROGRESS,
            i64::try_from(feed_progress).unwrap_or(i64::MAX),
        )?;
    }
    Ok(())
}

fn deliver_animal_feed(
    state: &mut GameState,
    delta_seconds: u64,
) -> Result<FeedDeliveryTick, EngineError> {
    if delta_seconds == 0 {
        return Ok(FeedDeliveryTick::default());
    }

    let Some(main_building) = main_zookeeper_house(state) else {
        return Ok(FeedDeliveryTick::default());
    };
    let now = state.now_seconds();
    let mut animal_counts_by_habitat = BTreeMap::<BuildingId, u64>::new();
    for animal in state
        .entities()
        .filter(|entity| is_animal_kind(entity.kind()))
    {
        let habitat_id = state.entity_stat(animal.id, HABITAT_ID)?;
        let Ok(habitat_raw) = u64::try_from(habitat_id) else {
            continue;
        };
        let Some(habitat_key) = std::num::NonZeroU64::new(habitat_raw).map(BuildingId::new) else {
            continue;
        };
        *animal_counts_by_habitat.entry(habitat_key).or_default() += 1;
    }

    let mut events = Vec::new();
    let mut cost = 0_u64;
    for (habitat, animal_count) in animal_counts_by_habitat {
        if assigned_staff_count(state, ZOOKEEPER, Some(habitat)) == 0 {
            continue;
        }
        let current_feed = state.building_inventory(habitat)?.amount(ANIMAL_FEED);
        let target_feed = animal_count.saturating_mul(FEED_DELIVERY_BUFFER_MEALS);
        if current_feed >= target_feed {
            continue;
        }

        let last_delivery =
            u64::try_from(state.building_stat(habitat, LAST_FEED_DELIVERY_AT)?.max(0)).unwrap_or(0);
        if now < last_delivery.saturating_add(ANIMAL_FEED_INTERVAL_SECONDS) {
            continue;
        }
        if state.inventory().amount(COINS) < FEED_DELIVERY_COST {
            continue;
        }

        let available_main_feed = state.building_inventory(main_building)?.amount(ANIMAL_FEED);
        if available_main_feed == 0 {
            continue;
        }

        let habitat_capacity = state
            .building_inventory(habitat)?
            .capacity(ANIMAL_FEED)
            .unwrap_or(u64::MAX);
        let capacity_remaining = habitat_capacity.saturating_sub(current_feed);
        let delivery_amount = target_feed
            .saturating_sub(current_feed)
            .min(available_main_feed)
            .min(capacity_remaining);
        if delivery_amount == 0 {
            continue;
        }

        state
            .building_inventory_mut(main_building)?
            .remove(ANIMAL_FEED, delivery_amount)
            .map_err(EngineError::from)?;
        state
            .building_inventory_mut(habitat)?
            .add(ANIMAL_FEED, delivery_amount)
            .map_err(EngineError::from)?;
        state
            .inventory_mut()
            .remove(COINS, FEED_DELIVERY_COST)
            .map_err(EngineError::from)?;
        cost = cost.saturating_add(FEED_DELIVERY_COST);
        state.set_building_stat(
            habitat,
            LAST_FEED_DELIVERY_AT,
            i64::try_from(now).unwrap_or(i64::MAX),
        )?;
        events.push(GameEvent::DomainEvent {
            kind: format!("zoo.feed_delivery.{}", habitat.get()),
        });
    }

    Ok(FeedDeliveryTick { events, cost })
}

fn resolve_animal_meals(
    state: &mut GameState,
    animal: EntityId,
    habitat: Option<BuildingId>,
    delta_seconds: u64,
) -> Result<(u64, u64, u64), EngineError> {
    let current_progress =
        u64::try_from(state.entity_stat(animal, FEED_PROGRESS)?.max(0)).unwrap_or(0);
    let total_progress = current_progress.saturating_add(delta_seconds);
    let meals_due = total_progress / ANIMAL_FEED_INTERVAL_SECONDS;
    let remaining_progress = total_progress % ANIMAL_FEED_INTERVAL_SECONDS;
    let fed_meals = consume_habitat_feed(state, habitat, meals_due)?;
    let missed_meals = meals_due.saturating_sub(fed_meals);
    Ok((fed_meals, missed_meals, remaining_progress))
}

fn consume_habitat_feed(
    state: &mut GameState,
    habitat: Option<BuildingId>,
    requested_meals: u64,
) -> Result<u64, EngineError> {
    if requested_meals == 0 {
        return Ok(0);
    }
    let Some(habitat) = habitat else {
        return Ok(0);
    };

    let available = state.building_inventory(habitat)?.amount(ANIMAL_FEED);
    let consumed = requested_meals.min(available);
    if consumed > 0 {
        state
            .building_inventory_mut(habitat)?
            .remove(ANIMAL_FEED, consumed)
            .map_err(EngineError::from)?;
    }
    Ok(consumed)
}

fn habitat_for_animal(
    state: &GameState,
    animal: EntityId,
) -> Result<Option<BuildingId>, EngineError> {
    let habitat_id = state.entity_stat(animal, HABITAT_ID)?;
    let Ok(habitat_raw) = u64::try_from(habitat_id) else {
        return Ok(None);
    };
    let Some(habitat) = std::num::NonZeroU64::new(habitat_raw).map(BuildingId::new) else {
        return Ok(None);
    };
    Ok(state.building(habitat).map(|_| habitat))
}

fn update_progression(state: &mut GameState) -> Result<(), EngineError> {
    let reputation = state.inventory().amount(REPUTATION);
    let conservation = state.inventory().amount(CONSERVATION_POINTS);
    let xp = reputation
        .saturating_mul(20)
        .saturating_add(conservation.saturating_mul(5));
    if xp > state.player_xp() {
        state.grant_xp(xp - state.player_xp())?;
    }
    Ok(())
}

fn apply_guest_arrivals_and_revenue(
    state: &mut GameState,
    delta_seconds: u64,
    outcome: &guests::GuestTickOutcome,
) -> Result<ZooRevenueTick, EngineError> {
    let mut revenue = ZooRevenueTick::default();
    if delta_seconds >= 5 && outcome.excited_guest_count > 0 {
        revenue.guest_spend = outcome.excited_guest_count * (delta_seconds / 5);
        add_capped(state.inventory_mut(), COINS, revenue.guest_spend)?;
        add_capped(
            state.inventory_mut(),
            REPUTATION,
            outcome.excited_guest_count / 3,
        )?;
    }

    if outcome.arrivals > 0 {
        let pricing = pricing_snapshot(state);
        add_capped(state.inventory_mut(), VISITORS, outcome.arrivals)?;
        if pricing.entry_fee > 0 {
            revenue.ticket_revenue = outcome
                .arrivals
                .saturating_mul(u64::try_from(pricing.entry_fee).unwrap_or(0));
            add_capped(state.inventory_mut(), COINS, revenue.ticket_revenue)?;
        }
        add_capped(state.inventory_mut(), REPUTATION, outcome.arrivals / 10)?;
    }

    state.set_stat(
        GUEST_DEPARTURES_LAST_TICK,
        i64::try_from(outcome.departures).unwrap_or(i64::MAX),
    );
    Ok(revenue)
}

fn record_economy_tick(
    state: &mut GameState,
    delta_seconds: u64,
    revenue: ZooRevenueTick,
    feed_delivery_cost: u64,
) -> Result<(), EngineError> {
    let total_revenue = revenue.ticket_revenue.saturating_add(revenue.guest_spend);
    let net_cashflow = i64::try_from(total_revenue).unwrap_or(i64::MAX)
        - i64::try_from(feed_delivery_cost).unwrap_or(i64::MAX);
    let projected_cashflow_per_minute = if delta_seconds == 0 {
        0
    } else {
        net_cashflow.saturating_mul(60) / i64::try_from(delta_seconds).unwrap_or(1)
    };

    state.set_stat(
        TICKET_REVENUE_LAST_TICK,
        i64::try_from(revenue.ticket_revenue).unwrap_or(i64::MAX),
    );
    state.set_stat(
        GUEST_SPEND_LAST_TICK,
        i64::try_from(revenue.guest_spend).unwrap_or(i64::MAX),
    );
    state.set_stat(
        FEED_DELIVERY_COST_LAST_TICK,
        i64::try_from(feed_delivery_cost).unwrap_or(i64::MAX),
    );
    state.set_stat(
        REVENUE_LAST_TICK,
        i64::try_from(total_revenue).unwrap_or(i64::MAX),
    );
    state.set_stat(
        EXPENSES_LAST_TICK,
        i64::try_from(feed_delivery_cost).unwrap_or(i64::MAX),
    );
    state.set_stat(NET_CASHFLOW_LAST_TICK, net_cashflow);
    state.set_stat(PROJECTED_CASHFLOW_PER_MINUTE, projected_cashflow_per_minute);
    Ok(())
}

fn require_species_unlocked(state: &GameState, kind: &str) -> Result<(), AnimalPurchaseError> {
    let species = animal_species(kind)
        .ok_or_else(|| AnimalPurchaseError::UnknownAnimalKind(kind.to_owned()))?;
    if is_species_unlocked(state, kind) {
        return Ok(());
    }

    Err(AnimalPurchaseError::SpeciesLocked {
        animal_kind: species.label.to_owned(),
        required_visitors: species.required_visitors,
        current_visitors: state.inventory().amount(VISITORS),
    })
}

fn add_capped(
    inventory: &mut ResourceStorage,
    resource: impl Into<ResourceId>,
    amount: u64,
) -> Result<(), EngineError> {
    let resource = resource.into();
    if amount == 0 {
        return Ok(());
    }
    let current = inventory.amount(resource.clone());
    let available = inventory
        .capacity(resource.clone())
        .map(|capacity| capacity.saturating_sub(current))
        .unwrap_or(amount);
    let to_add = amount.min(available);
    if to_add > 0 {
        inventory.add(resource, to_add)?;
    }
    Ok(())
}

fn validate_animal_area_for_kind(
    state: &GameState,
    kind: &NpcKind,
    animal_area: BuildingId,
    ignored_animal: Option<EntityId>,
) -> Result<(), AnimalPurchaseError> {
    let requirements = animal_area_requirements(kind.as_str())
        .ok_or_else(|| AnimalPurchaseError::UnknownAnimalKind(kind.to_string()))?;
    let building =
        state
            .building(animal_area)
            .ok_or_else(|| AnimalPurchaseError::AnimalAreaUnavailable {
                animal_kind: kind.to_string(),
                animal_area,
            })?;

    if building.kind.as_str() != requirements.animal_area_kind
        || building.status != BuildingStatus::Active
        || building.level < requirements.min_level
    {
        return Err(AnimalPurchaseError::AnimalAreaUnavailable {
            animal_kind: kind.to_string(),
            animal_area,
        });
    }

    if attached_fence_count(state, building.location, requirements.fence_kind)
        < requirements.min_fence_count
    {
        return Err(AnimalPurchaseError::AnimalAreaRequirementsNotMet {
            animal_kind: kind.to_string(),
            animal_area,
            requirements,
        });
    }

    let habitat_stat = StatId::from(HABITAT_ID);
    if let Some(existing) = state.entities().find(|animal| {
        Some(animal.id) != ignored_animal
            && is_animal_kind(animal.kind())
            && animal.stats.get(&habitat_stat).copied() == Some(animal_area.get() as i64)
            && npc_kind_for_entity_record(animal) != Some(kind.clone())
    }) {
        return Err(AnimalPurchaseError::MixedAnimalKinds {
            animal_area,
            existing_kind: existing.kind().to_owned(),
            requested_kind: kind.to_string(),
        });
    }

    Ok(())
}

fn animal_area_at_location(state: &GameState, location: MapLocation) -> Option<BuildingId> {
    state
        .buildings()
        .find(|building| building.kind.as_str() == ANIMAL_AREA && building.location == location)
        .map(|building| building.id)
}

fn main_zookeeper_house(state: &GameState) -> Option<BuildingId> {
    state
        .buildings()
        .find(|building| {
            building.kind.as_str() == ZOOKEEPER_HOUSE
                && matches!(building.status, BuildingStatus::Active)
        })
        .map(|building| building.id)
}

fn attached_fence_count(state: &GameState, location: MapLocation, fence_kind: &str) -> u32 {
    state
        .fences()
        .filter(|fence| {
            fence.kind.as_str() == fence_kind
                && (fence.start.is_adjacent_to(location, state.map_topology())
                    || fence.end.is_adjacent_to(location, state.map_topology()))
        })
        .count() as u32
}

pub(super) fn assigned_staff_count(
    state: &GameState,
    kind: &str,
    building: Option<BuildingId>,
) -> u32 {
    state
        .entity_ids_of_blueprint(EntityBlueprintRef::Unit(kind.into()))
        .into_iter()
        .filter(|entity| {
            building.is_none_or(|building| {
                state
                    .entity(*entity)
                    .and_then(|entity| entity.assignment)
                    .is_some_and(|assignment| assignment.assigned_building == Some(building))
            })
        })
        .count() as u32
}

fn npc_kind_for_entity(entity: EntityRecord) -> Option<NpcKind> {
    npc_kind_for_entity_record(&entity)
}

fn npc_kind_for_entity_record(entity: &EntityRecord) -> Option<NpcKind> {
    match &entity.blueprint {
        EntityBlueprintRef::Npc(kind) => Some(kind.clone()),
        EntityBlueprintRef::Unit(_) => None,
    }
}
