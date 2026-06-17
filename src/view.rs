use super::*;

pub fn zoo_view(state: &GameState) -> ZooView {
    let resources = resource_ids()
        .into_iter()
        .map(|id| {
            resource_view(
                id,
                state.inventory().amount(id),
                state.inventory().capacity(id),
            )
        })
        .collect::<Vec<_>>();

    let buildings = state
        .buildings()
        .map(|building| building_view(state, building))
        .collect::<Vec<_>>();
    let jobs = state.jobs().map(job_view).collect::<Vec<_>>();
    let paths = state
        .paths()
        .map(|path| PathView {
            id: path.id.get(),
            kind: path.kind.to_string(),
            waypoints: path.waypoints.clone(),
        })
        .collect();
    let areas = state
        .areas()
        .map(|area| AreaView {
            id: area.id.get(),
            kind: area.kind.to_string(),
            tiles: area.tiles.clone(),
        })
        .collect();
    let fences = state
        .fences()
        .map(|fence| FenceView {
            id: fence.id.get(),
            kind: fence.kind.to_string(),
            start: fence.start,
            end: fence.end,
            height: fence.height,
        })
        .collect();
    let entities = state.entities().map(entity_view).collect::<Vec<_>>();
    let animals = entities
        .iter()
        .filter(|entity| is_animal_kind(entity.kind.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    let animal_species = animal_species_views(state, &animals);

    let summary = zoo_summary(state, &animals);
    let alerts = zoo_alerts(state, &summary);
    let economy = zoo_economy(state);
    let objectives = zoo_objectives(state, &summary);

    ZooView {
        now_seconds: state.now_seconds(),
        resources,
        buildings,
        jobs,
        paths,
        areas,
        fences,
        entities,
        animal_species,
        tech_nodes: state
            .tech_nodes()
            .map(|node| node.kind.to_string())
            .collect::<Vec<_>>(),
        available_tech_nodes: state
            .available_tech_nodes()
            .into_iter()
            .map(|node| node.kind.to_string())
            .collect::<Vec<_>>(),
        upgrades: state
            .upgrades()
            .map(|upgrade| upgrade.kind.to_string())
            .collect::<Vec<_>>(),
        alerts,
        objectives,
        summary,
        economy,
    }
}

fn building_view(state: &GameState, building: &Building) -> BuildingView {
    let required_workers = state
        .catalog()
        .building_level(building.kind.clone(), building.level)
        .map(|level| {
            let production_workers = level
                .production_rules
                .values()
                .map(|rule| rule.required_workers)
                .max()
                .unwrap_or(0);
            level.required_workers.max(production_workers)
        })
        .unwrap_or(0);
    let assigned_workers = state.entity_ids_assigned_to_building(building.id).len() as u32;

    BuildingView {
        id: building.id.get(),
        kind: building.kind.to_string(),
        label: label_for(building.kind.as_str()).to_owned(),
        location: building.location,
        height: building.height,
        level: building.level,
        required_workers,
        assigned_workers,
        manned: assigned_workers >= required_workers,
        status: building_status_label(&building.status),
        production: production_status_label(&building.production_status),
        inventory: resource_ids()
            .into_iter()
            .filter_map(|id| {
                let amount = building.inventory.amount(id);
                let capacity = building.inventory.capacity(id);
                (amount > 0 || capacity.is_some()).then(|| resource_view(id, amount, capacity))
            })
            .collect(),
        stats: stringify_stats(&building.stats),
    }
}

fn job_view(job: &Job) -> JobView {
    JobView {
        id: job.id.get(),
        kind: format!("{:?}", job.kind),
        completes_at_seconds: job.completes_at_seconds,
        assigned_entities: job.assigned_entities.iter().map(|id| id.get()).collect(),
    }
}

fn entity_view(entity: EntityRecord) -> EntityView {
    EntityView {
        id: entity.id.get(),
        blueprint: entity.blueprint.clone(),
        kind: entity.blueprint.kind().to_owned(),
        label: entity
            .name
            .unwrap_or_else(|| label_for(entity.blueprint.kind()).to_owned()),
        location: entity.location,
        assigned_building: entity
            .assignment
            .as_ref()
            .and_then(|assignment| assignment.assigned_building.map(|id| id.get())),
        assigned_job: entity
            .assignment
            .as_ref()
            .and_then(|assignment| assignment.assigned_job.map(|id| id.get())),
        stats: stringify_stats(&entity.stats),
    }
}

fn resource_view(id: &str, amount: u64, capacity: Option<u64>) -> ResourceView {
    ResourceView {
        id: id.to_owned(),
        label: label_for(id).to_owned(),
        amount,
        capacity,
    }
}

fn animal_species_views(state: &GameState, animals: &[EntityView]) -> Vec<AnimalSpeciesView> {
    animal_species_definitions()
        .iter()
        .map(|species| AnimalSpeciesView {
            kind: species.kind.to_owned(),
            label: species.label.to_owned(),
            required_visitors: species.required_visitors,
            unlocked: is_species_unlocked(state, species.kind),
            placed_count: animals
                .iter()
                .filter(|animal| animal.kind == species.kind)
                .count() as u32,
            appeal: species.appeal,
            purchase_cost: species
                .purchase_cost
                .iter()
                .map(|(resource_id, amount)| AnimalSpeciesCostView {
                    resource_id: (*resource_id).to_owned(),
                    label: label_for(resource_id).to_owned(),
                    amount: *amount,
                })
                .collect(),
            animal_area_kind: species.animal_area_kind.to_owned(),
            min_level: species.min_level,
            fence_kind: species.fence_kind.to_owned(),
            min_fence_count: species.min_fence_count,
        })
        .collect()
}

fn zoo_summary(state: &GameState, animals: &[EntityView]) -> ZooSummary {
    let active_habitats = active_habitats(state).len() as u32;
    let animal_count = animals.len() as u32;
    let total_welfare = animals
        .iter()
        .map(|animal| *animal.stats.get(WELFARE).unwrap_or(&0))
        .sum::<i64>();
    let average_welfare = if animal_count == 0 {
        0
    } else {
        total_welfare / i64::from(animal_count)
    };
    let pricing = pricing_snapshot(state);
    let reputation_level = state.player_level();
    let tracked_guests = state
        .entities()
        .filter(|entity| entity.kind() == GUEST)
        .count() as u32;
    let won = active_habitats >= 3
        && reputation_level >= 3
        && state.inventory().amount(CONSERVATION_POINTS) >= 25
        && average_welfare >= 70;
    let critical = state.inventory().amount(COINS) < 10
        || animals
            .iter()
            .any(|animal| *animal.stats.get(WELFARE).unwrap_or(&100) < 25);
    ZooSummary {
        active_habitats,
        animal_count,
        average_welfare,
        animal_appeal: pricing.animal_appeal,
        current_visitors: state.inventory().amount(VISITORS),
        entry_fee: pricing.entry_fee,
        customer_willingness: pricing.customer_willingness,
        customer_demand_percent: pricing.customer_demand_percent,
        expected_customers_per_minute: pricing.expected_customers_per_minute,
        tracked_guests,
        guest_departures_last_tick: u32::try_from(state.stat(GUEST_DEPARTURES_LAST_TICK))
            .unwrap_or(u32::MAX),
        reputation_level,
        won,
        critical,
    }
}

fn zoo_alerts(state: &GameState, summary: &ZooSummary) -> Vec<AlertView> {
    let mut alerts = Vec::new();
    if state.inventory().amount(COINS) < 25 {
        alerts.push(AlertView {
            severity: "warning".to_owned(),
            message: "Coin reserve is low.".to_owned(),
        });
    }
    if summary.animal_count == 0 {
        alerts.push(AlertView {
            severity: "info".to_owned(),
            message: "Add animal groups to habitats to attract conservation value.".to_owned(),
        });
    }
    if summary.average_welfare > 0 && summary.average_welfare < 50 {
        alerts.push(AlertView {
            severity: "critical".to_owned(),
            message: "Animal welfare needs immediate staff or supply support.".to_owned(),
        });
    }
    let animals_need_food_support = state
        .entities()
        .filter(|entity| is_animal_kind(entity.kind()))
        .any(|animal| {
            let habitat_id = animal
                .stats
                .get(&StatId::from(HABITAT_ID))
                .copied()
                .and_then(|id| u64::try_from(id).ok())
                .and_then(std::num::NonZeroU64::new)
                .map(BuildingId::new);
            let Some(habitat) = habitat_id else {
                return true;
            };
            state.entity_ids_assigned_to_building(habitat).is_empty()
                || state
                    .building_inventory(habitat)
                    .map(|inventory| inventory.amount(ANIMAL_FEED) == 0)
                    .unwrap_or(true)
        });
    if animals_need_food_support {
        alerts.push(AlertView {
            severity: "warning".to_owned(),
            message: "Animals need a staffed habitat and regular food deliveries from the zookeeper house.".to_owned(),
        });
    }
    let main_building_feed_empty = state
        .buildings()
        .find(|building| building.kind.as_str() == ZOOKEEPER_HOUSE)
        .is_some_and(|building| building.inventory.amount(ANIMAL_FEED) == 0);
    if summary.animal_count > 0 && main_building_feed_empty {
        alerts.push(AlertView {
            severity: "warning".to_owned(),
            message: "The zookeeper house is out of animal feed for delivery runs.".to_owned(),
        });
    }
    if state.inventory().amount(VISITORS)
        >= state.inventory().capacity(VISITORS).unwrap_or(u64::MAX)
    {
        alerts.push(AlertView {
            severity: "warning".to_owned(),
            message: "Visitor capacity is full; build guest services.".to_owned(),
        });
    }
    let leaving_guests = state
        .entities()
        .filter(|entity| entity.kind() == GUEST)
        .filter(|entity| {
            guest_should_leave(
                entity
                    .stats
                    .get(&StatId::from(EXCITEMENT))
                    .copied()
                    .unwrap_or(0),
                entity
                    .stats
                    .get(&StatId::from(PATIENCE))
                    .copied()
                    .unwrap_or(0),
            )
        })
        .count() as u32;
    if summary.tracked_guests > 0 && leaving_guests * 2 > summary.tracked_guests {
        alerts.push(AlertView {
            severity: "warning".to_owned(),
            message: "Guests are leaving because they cannot find enough animals.".to_owned(),
        });
    }
    alerts
}

fn zoo_economy(state: &GameState) -> ZooEconomyView {
    ZooEconomyView {
        revenue_last_tick: state.stat(REVENUE_LAST_TICK),
        expenses_last_tick: state.stat(EXPENSES_LAST_TICK),
        net_cashflow_last_tick: state.stat(NET_CASHFLOW_LAST_TICK),
        projected_cashflow_per_minute: state.stat(PROJECTED_CASHFLOW_PER_MINUTE),
        ticket_revenue_last_tick: state.stat(TICKET_REVENUE_LAST_TICK),
        guest_spend_last_tick: state.stat(GUEST_SPEND_LAST_TICK),
        feed_delivery_cost_last_tick: state.stat(FEED_DELIVERY_COST_LAST_TICK),
    }
}

fn zoo_objectives(state: &GameState, summary: &ZooSummary) -> Vec<ObjectiveView> {
    let species_variety = state
        .entities()
        .filter_map(|entity| is_animal_kind(entity.kind()).then(|| entity.kind().to_owned()))
        .collect::<std::collections::BTreeSet<_>>()
        .len();

    vec![
        objective(
            "positive_cashflow",
            "Positive cashflow",
            state.stat(PROJECTED_CASHFLOW_PER_MINUTE),
            0,
        ),
        objective(
            "first_habitat",
            "Open first habitat",
            i64::from(summary.active_habitats),
            1,
        ),
        objective(
            "visitor_growth",
            "Reach 25 visitors",
            i64::try_from(summary.current_visitors).unwrap_or(i64::MAX),
            25,
        ),
        objective(
            "stable_welfare",
            "Average animal welfare 70",
            summary.average_welfare,
            70,
        ),
        objective(
            "service_revenue",
            "Earn guest-service revenue",
            state.stat(GUEST_SPEND_LAST_TICK),
            1,
        ),
        objective(
            "species_variety",
            "Place 2 animal species",
            i64::try_from(species_variety).unwrap_or(i64::MAX),
            2,
        ),
    ]
}

fn objective(id: &str, label: &str, current: i64, target: i64) -> ObjectiveView {
    ObjectiveView {
        id: id.to_owned(),
        label: label.to_owned(),
        current,
        target,
        complete: current >= target,
    }
}

fn resource_ids() -> Vec<&'static str> {
    vec![
        COINS,
        LUMBER,
        VEGETABLES,
        MEAT,
        FISH,
        ANIMAL_FEED,
        MEDICINE,
        WATER,
        VISITORS,
        RESEARCH_POINTS,
        REPUTATION,
        CONSERVATION_POINTS,
    ]
}

fn stringify_stats(stats: &BTreeMap<StatId, i64>) -> BTreeMap<String, i64> {
    stats
        .iter()
        .map(|(key, value)| (key.to_string(), *value))
        .collect()
}

fn building_status_label(status: &BuildingStatus) -> String {
    match status {
        BuildingStatus::Constructing { .. } => "Constructing",
        BuildingStatus::Active => "Active",
        BuildingStatus::Upgrading { .. } => "Upgrading",
    }
    .to_owned()
}

fn production_status_label(status: &ProductionStatus) -> String {
    match status {
        ProductionStatus::Idle => "Idle".to_owned(),
        ProductionStatus::InProgress {
            completes_at_seconds,
        } => format!("In progress until {completes_at_seconds}s"),
    }
}

pub(crate) fn is_habitat_kind(kind: &str) -> bool {
    matches!(
        kind,
        ANIMAL_AREA | SAVANNA_HABITAT | WETLANDS_HABITAT | AVIARY | REPTILE_HOUSE
    )
}

pub(crate) fn is_animal_kind(kind: &str) -> bool {
    super::is_animal_kind(kind)
}

fn label_for(id: &str) -> &str {
    match id {
        COINS => "Coins",
        LUMBER => "Lumber",
        VEGETABLES => "Vegetables",
        MEAT => "Meat",
        FISH => "Fish",
        ANIMAL_FEED => "Animal Feed",
        MEDICINE => "Medicine",
        WATER => "Water",
        VISITORS => "Visitors",
        RESEARCH_POINTS => "Research",
        REPUTATION => "Reputation",
        CONSERVATION_POINTS => "Conservation",
        CUSTOMER_ENTRY => "Customer Entry",
        TICKET_BOOTH => "Ticket Booth",
        GUEST_PLAZA => "Guest Plaza",
        RESTROOM => "Restroom",
        SNACK_KIOSK => "Food Store",
        SOUVENIR_STALL => "Gift Shop",
        ZOOKEEPER_HOUSE => "Zookeeper House",
        KEEPER_KITCHEN => "Keeper Kitchen",
        FEED_SHED => "Feed Shed",
        VET_CLINIC => "Vet Clinic",
        MAINTENANCE_SHED => "Maintenance Shed",
        RESEARCH_OFFICE => "Research Office",
        ANIMAL_AREA => "Animal Area",
        SAVANNA_HABITAT => "Savanna Habitat",
        WETLANDS_HABITAT => "Wetlands Habitat",
        AVIARY => "Aviary",
        REPTILE_HOUSE => "Reptile House",
        ZOOKEEPER => "Zookeeper",
        VETERINARIAN => "Veterinarian",
        MECHANIC => "Mechanic",
        EDUCATOR => "Educator",
        _ => animal_kind_label(id).unwrap_or(id),
    }
}
