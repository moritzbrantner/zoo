from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path} for {old[:80]!r}, found {count}")
    path.write_text(text.replace(old, new, 1))


def replace_count(path: Path, old: str, new: str, expected: int) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"Expected {expected} matches in {path} for {old[:80]!r}, found {count}")
    path.write_text(text.replace(old, new))


root = Path(__file__).resolve().parents[2]
rust = root / "crates/zoo-core/src/lib.rs"
app = root / "apps/web/src/App.tsx"
css = root / "apps/web/src/concessions.css"
verify = root / ".github/workflows/verify.yml"
concession_proof = root / "apps/web/scripts/capture-concessions-proof.mjs"

replace_once(
    rust,
    """const ADMISSION_PRICE: i64 = 1_200;\nconst FOOD_RESTOCK_COST: i64 = 1_500;\nconst WATER_REFILL_COST: i64 = 800;\nconst CLEAN_HABITAT_COST: i64 = 2_000;\nconst SHELTER_COST: i64 = 12_000;\nconst CARE_DECAY_INTERVAL_MINUTES: u32 = 15;\nconst FOOD_STAND_BUILD_COST: i64 = 18_000;\nconst DRINK_STAND_BUILD_COST: i64 = 14_000;\nconst FOOD_PRICE: i64 = 500;\nconst DRINK_PRICE: i64 = 350;\nconst FOOD_BUY_THRESHOLD: u32 = 20;\nconst DRINK_BUY_THRESHOLD: u32 = 20;\n""",
    """const ADMISSION_PRICE: i64 = 1_200;\nconst WATER_REFILL_COST: i64 = 800;\nconst CLEAN_HABITAT_COST: i64 = 2_000;\nconst SHELTER_COST: i64 = 12_000;\nconst CARE_DECAY_INTERVAL_MINUTES: u32 = 15;\nconst FOOD_STAND_BUILD_COST: i64 = 18_000;\nconst DRINK_STAND_BUILD_COST: i64 = 14_000;\nconst FOOD_PRICE: i64 = 500;\nconst DRINK_PRICE: i64 = 350;\nconst FOOD_BUY_THRESHOLD: u32 = 20;\nconst DRINK_BUY_THRESHOLD: u32 = 20;\nconst ANIMAL_CARE_DEPOT_X: u32 = 2;\nconst ANIMAL_CARE_DEPOT_Y: u32 = ENTRANCE_Y - 1;\nconst FEED_BATCH_COST: i64 = 6_000;\nconst FEED_BATCH_CRATES: u32 = 10;\nconst KEEPER_HIRE_COST: i64 = 25_000;\nconst KEEPER_HOURLY_WAGE: i64 = 1_200;\nconst FEED_DELIVERY_INTERVAL_MINUTES: u32 = 60;\nconst FEED_DELIVERY_RETRY_MINUTES: u32 = 15;\nconst FEED_DELIVERY_THRESHOLD: u32 = 90;\n""",
)

replace_once(
    rust,
    """    Habitat(u32),\n    Concession(u32),\n}\n""",
    """    Habitat(u32),\n    Concession(u32),\n    AnimalCareDepot,\n}\n""",
)

replace_once(
    rust,
    """struct Concession {\n    id: u32,\n    x: u32,\n    y: u32,\n    kind: ConcessionKind,\n    sales_today: u32,\n    total_sales: u32,\n    total_revenue_cents: i64,\n}\n\n""",
    """struct Concession {\n    id: u32,\n    x: u32,\n    y: u32,\n    kind: ConcessionKind,\n    sales_today: u32,\n    total_sales: u32,\n    total_revenue_cents: i64,\n}\n\n#[derive(Clone, Debug)]\nstruct Keeper {\n    id: u32,\n    assigned_habitat_id: Option<u32>,\n    deliveries_completed: u32,\n}\n\n""",
)

replace_once(
    rust,
    """    cleanliness: u32,\n    has_shelter: bool,\n}\n""",
    """    cleanliness: u32,\n    has_shelter: bool,\n    keeper_id: Option<u32>,\n    next_feed_delivery_minute: Option<u64>,\n}\n""",
)

replace_once(
    rust,
    """    fn care_status(&self) -> String {\n        if self.animals == 0 {\n            return \"Care supplies are ready\".to_owned();\n        }\n        if self.food < 40 {\n""",
    """    fn care_status(&self) -> String {\n        if self.keeper_id.is_none() {\n            return \"No keeper is scheduled for food deliveries\".to_owned();\n        }\n        if self.animals == 0 {\n            return \"Keeper scheduled; care supplies are ready\".to_owned();\n        }\n        if self.food < 40 {\n""",
)

replace_once(
    rust,
    """    habitats: Vec<Habitat>,\n    concessions: Vec<Concession>,\n    guests: Vec<Guest>,\n    cash_cents: i64,\n""",
    """    habitats: Vec<Habitat>,\n    concessions: Vec<Concession>,\n    keepers: Vec<Keeper>,\n    guests: Vec<Guest>,\n    cash_cents: i64,\n    feed_crates: u32,\n""",
)

replace_once(
    rust,
    """    next_habitat_id: u32,\n    next_concession_id: u32,\n    next_guest_id: u32,\n""",
    """    next_habitat_id: u32,\n    next_concession_id: u32,\n    next_keeper_id: u32,\n    next_guest_id: u32,\n""",
)

replace_once(
    rust,
    """            habitats: Vec::new(),\n            concessions: Vec::new(),\n            guests: Vec::new(),\n            cash_cents: 5_000_000,\n""",
    """            habitats: Vec::new(),\n            concessions: Vec::new(),\n            keepers: Vec::new(),\n            guests: Vec::new(),\n            cash_cents: 5_000_000,\n            feed_crates: 0,\n""",
)

replace_once(
    rust,
    """            next_habitat_id: 1,\n            next_concession_id: 1,\n            next_guest_id: 1,\n""",
    """            next_habitat_id: 1,\n            next_concession_id: 1,\n            next_keeper_id: 1,\n            next_guest_id: 1,\n""",
)

replace_once(
    rust,
    """        for x in 1..=4 {\n            state.set_tile(x, ENTRANCE_Y, TileKind::Path);\n        }\n        state\n""",
    """        for x in 1..=4 {\n            state.set_tile(x, ENTRANCE_Y, TileKind::Path);\n        }\n        state.set_tile(\n            ANIMAL_CARE_DEPOT_X,\n            ANIMAL_CARE_DEPOT_Y,\n            TileKind::AnimalCareDepot,\n        );\n        state\n""",
)

replace_once(
    rust,
    """            Some(TileKind::Concession(_)) => {\n                ActionResult::error(\"A concession stand occupies that tile\")\n            }\n            Some(TileKind::Grass) => match self.spend(PATH_COST) {\n""",
    """            Some(TileKind::Concession(_)) => {\n                ActionResult::error(\"A concession stand occupies that tile\")\n            }\n            Some(TileKind::AnimalCareDepot) => {\n                ActionResult::error(\"The central animal-care depot occupies that tile\")\n            }\n            Some(TileKind::Grass) => match self.spend(PATH_COST) {\n""",
)

replace_once(
    rust,
    """            Some(TileKind::Habitat(_)) => {\n                return ActionResult::error(\"A habitat occupies that tile\");\n            }\n            Some(TileKind::Grass) => {}\n        }\n""",
    """            Some(TileKind::Habitat(_)) => {\n                return ActionResult::error(\"A habitat occupies that tile\");\n            }\n            Some(TileKind::AnimalCareDepot) => {\n                return ActionResult::error(\"The central animal-care depot occupies that tile\");\n            }\n            Some(TileKind::Grass) => {}\n        }\n""",
)

replace_once(
    rust,
    """            cleanliness: 100,\n            has_shelter: false,\n        });\n""",
    """            cleanliness: 100,\n            has_shelter: false,\n            keeper_id: None,\n            next_feed_delivery_minute: None,\n        });\n""",
)

replace_once(
    rust,
    """            Some(TileKind::Concession(id)) => {\n                self.set_tile(x, y, TileKind::Grass);\n                self.concessions.retain(|stand| stand.id != id);\n                ActionResult::ok(format!(\"Concession stand #{id} removed\"))\n            }\n            Some(TileKind::Habitat(id)) => {\n""",
    """            Some(TileKind::Concession(id)) => {\n                self.set_tile(x, y, TileKind::Grass);\n                self.concessions.retain(|stand| stand.id != id);\n                ActionResult::ok(format!(\"Concession stand #{id} removed\"))\n            }\n            Some(TileKind::AnimalCareDepot) => {\n                ActionResult::error(\"The central animal-care depot cannot be demolished\")\n            }\n            Some(TileKind::Habitat(id)) => {\n""",
)

replace_once(
    rust,
    """                self.habitats.retain(|habitat| habitat.id != id);\n                self.guests.retain(|guest| guest.target_habitat != id);\n                ActionResult::ok(format!(\"Habitat #{id} removed\"))\n""",
    """                self.habitats.retain(|habitat| habitat.id != id);\n                for keeper in &mut self.keepers {\n                    if keeper.assigned_habitat_id == Some(id) {\n                        keeper.assigned_habitat_id = None;\n                    }\n                }\n                self.guests.retain(|guest| guest.target_habitat != id);\n                ActionResult::ok(format!(\"Habitat #{id} removed and its keeper released\"))\n""",
)

replace_once(
    rust,
    """        if habitat.species.is_some_and(|current| current != species) {\n            return ActionResult::error(\"Each habitat currently keeps one species\");\n        }\n\n        if let Err(message) = self.spend(species.purchase_cost()) {\n""",
    """        if habitat.species.is_some_and(|current| current != species) {\n            return ActionResult::error(\"Each habitat currently keeps one species\");\n        }\n        if habitat.keeper_id.is_none() {\n            return ActionResult::error(\"Schedule a keeper before adopting animals\");\n        }\n\n        if let Err(message) = self.spend(species.purchase_cost()) {\n""",
)

replace_once(
    rust,
    """    fn feed_habitat(&mut self, habitat_id: u32) -> ActionResult {\n        let Some(index) = self\n            .habitats\n            .iter()\n            .position(|habitat| habitat.id == habitat_id)\n        else {\n            return ActionResult::error(\"Select a habitat first\");\n        };\n        if self.habitats[index].food >= 100 {\n            return ActionResult::ok(\"Food is already fully stocked\");\n        }\n        if let Err(message) = self.spend(FOOD_RESTOCK_COST) {\n            return ActionResult::error(message);\n        }\n        self.habitats[index].food = 100;\n        ActionResult::ok(format!(\"Habitat #{habitat_id} food restocked\"))\n    }\n\n""",
    """    fn absolute_minute(&self) -> u64 {\n        u64::from(self.day.saturating_sub(1))\n            .saturating_mul(24 * 60)\n            .saturating_add(u64::from(self.minute_of_day))\n    }\n\n    fn buy_animal_feed(&mut self) -> ActionResult {\n        if let Err(message) = self.spend(FEED_BATCH_COST) {\n            return ActionResult::error(message);\n        }\n        self.feed_crates = self.feed_crates.saturating_add(FEED_BATCH_CRATES);\n        ActionResult::ok(format!(\n            \"Bought {FEED_BATCH_CRATES} feed crates for the animal-care depot\"\n        ))\n    }\n\n    fn hire_keeper(&mut self) -> ActionResult {\n        if let Err(message) = self.spend(KEEPER_HIRE_COST) {\n            return ActionResult::error(message);\n        }\n        let id = self.next_keeper_id;\n        self.next_keeper_id = self.next_keeper_id.saturating_add(1);\n        self.keepers.push(Keeper {\n            id,\n            assigned_habitat_id: None,\n            deliveries_completed: 0,\n        });\n        ActionResult::ok(format!(\"Keeper #{id} hired at the animal-care depot\"))\n    }\n\n    fn schedule_keeper(&mut self, habitat_id: u32) -> ActionResult {\n        let Some(habitat_index) = self\n            .habitats\n            .iter()\n            .position(|habitat| habitat.id == habitat_id)\n        else {\n            return ActionResult::error(\"Select a habitat first\");\n        };\n        if let Some(keeper_id) = self.habitats[habitat_index].keeper_id {\n            return ActionResult::ok(format!(\n                \"Keeper #{keeper_id} is already scheduled for habitat #{habitat_id}\"\n            ));\n        }\n        let Some(keeper_index) = self\n            .keepers\n            .iter()\n            .position(|keeper| keeper.assigned_habitat_id.is_none())\n        else {\n            return ActionResult::error(\n                \"No keeper is available; hire another at the animal-care depot\",\n            );\n        };\n\n        let keeper_id = self.keepers[keeper_index].id;\n        let next_delivery = self\n            .absolute_minute()\n            .saturating_add(u64::from(FEED_DELIVERY_INTERVAL_MINUTES));\n        self.keepers[keeper_index].assigned_habitat_id = Some(habitat_id);\n        self.habitats[habitat_index].keeper_id = Some(keeper_id);\n        self.habitats[habitat_index].next_feed_delivery_minute = Some(next_delivery);\n        ActionResult::ok(format!(\n            \"Keeper #{keeper_id} scheduled for habitat #{habitat_id}\"\n        ))\n    }\n\n    fn feed_habitat(&mut self, habitat_id: u32) -> ActionResult {\n        let Some(index) = self\n            .habitats\n            .iter()\n            .position(|habitat| habitat.id == habitat_id)\n        else {\n            return ActionResult::error(\"Select a habitat first\");\n        };\n        if self.habitats[index].food >= 100 {\n            return ActionResult::ok(\"Food is already fully stocked\");\n        }\n        let Some(keeper_id) = self.habitats[index].keeper_id else {\n            return ActionResult::error(\"Schedule a keeper before delivering food\");\n        };\n        if self.feed_crates == 0 {\n            return ActionResult::error(\"The animal-care depot is out of feed crates\");\n        }\n\n        self.feed_crates -= 1;\n        self.habitats[index].food = 100;\n        self.habitats[index].next_feed_delivery_minute = Some(\n            self.absolute_minute()\n                .saturating_add(u64::from(FEED_DELIVERY_INTERVAL_MINUTES)),\n        );\n        if let Some(keeper) = self.keepers.iter_mut().find(|keeper| keeper.id == keeper_id) {\n            keeper.deliveries_completed = keeper.deliveries_completed.saturating_add(1);\n        }\n        ActionResult::ok(format!(\n            \"Keeper #{keeper_id} delivered feed to habitat #{habitat_id}\"\n        ))\n    }\n\n""",
)

replace_once(
    rust,
    """            if self\n                .minute_of_day\n                .is_multiple_of(CARE_DECAY_INTERVAL_MINUTES)\n            {\n                self.advance_habitat_care();\n            }\n\n            self.advance_animal_welfare();\n""",
    """            if self\n                .minute_of_day\n                .is_multiple_of(CARE_DECAY_INTERVAL_MINUTES)\n            {\n                self.advance_habitat_care();\n            }\n            self.advance_keeper_deliveries();\n\n            self.advance_animal_welfare();\n""",
)

replace_once(
    rust,
    """    fn advance_animal_welfare(&mut self) {\n""",
    """    fn advance_keeper_deliveries(&mut self) {\n        let now = self.absolute_minute();\n        let due: Vec<(usize, u32)> = self\n            .habitats\n            .iter()\n            .enumerate()\n            .filter_map(|(index, habitat)| {\n                let keeper_id = habitat.keeper_id?;\n                let delivery_minute = habitat.next_feed_delivery_minute?;\n                (delivery_minute <= now).then_some((index, keeper_id))\n            })\n            .collect();\n\n        for (habitat_index, keeper_id) in due {\n            let needs_feed = self.habitats[habitat_index].animals > 0\n                && self.habitats[habitat_index].food < FEED_DELIVERY_THRESHOLD;\n            let retry_minutes = if needs_feed && self.feed_crates == 0 {\n                FEED_DELIVERY_RETRY_MINUTES\n            } else {\n                FEED_DELIVERY_INTERVAL_MINUTES\n            };\n\n            if needs_feed && self.feed_crates > 0 {\n                self.feed_crates -= 1;\n                self.habitats[habitat_index].food = 100;\n                if let Some(keeper) = self.keepers.iter_mut().find(|keeper| keeper.id == keeper_id) {\n                    keeper.deliveries_completed = keeper.deliveries_completed.saturating_add(1);\n                }\n            }\n\n            self.habitats[habitat_index].next_feed_delivery_minute =\n                Some(now.saturating_add(u64::from(retry_minutes)));\n        }\n    }\n\n    fn advance_animal_welfare(&mut self) {\n""",
)

replace_once(
    rust,
    """            + fence_count * 8\n            + self.concessions.len() as i64 * 50;\n""",
    """            + fence_count * 8\n            + self.concessions.len() as i64 * 50\n            + self.keepers.len() as i64 * KEEPER_HOURLY_WAGE;\n""",
)

replace_once(
    rust,
    """                    TileKind::Habitat(_) => \"habitat\",\n                    TileKind::Concession(_) => \"concession\",\n                };\n""",
    """                    TileKind::Habitat(_) => \"habitat\",\n                    TileKind::Concession(_) => \"concession\",\n                    TileKind::AnimalCareDepot => \"grass\",\n                };\n""",
)

replace_once(
    rust,
    """    fn snapshot(&self) -> Snapshot {\n""",
    """    fn feeding_status(&self, habitat: &Habitat) -> String {\n        let Some(keeper_id) = habitat.keeper_id else {\n            return \"No keeper scheduled; hire staff at the animal-care depot\".to_owned();\n        };\n        if self.feed_crates == 0 {\n            return format!(\"Keeper #{keeper_id} is waiting for depot feed stock\");\n        }\n        let minutes = habitat\n            .next_feed_delivery_minute\n            .map(|due| due.saturating_sub(self.absolute_minute()))\n            .unwrap_or(0);\n        format!(\"Keeper #{keeper_id} scheduled · next food run in {minutes} min\")\n    }\n\n    fn animal_care_depot_view(&self) -> AnimalCareDepotView {\n        AnimalCareDepotView {\n            x: ANIMAL_CARE_DEPOT_X,\n            y: ANIMAL_CARE_DEPOT_Y,\n            feed_crates: self.feed_crates,\n            feed_batch_crates: FEED_BATCH_CRATES,\n            feed_batch_cost_cents: FEED_BATCH_COST,\n            keeper_hire_cost_cents: KEEPER_HIRE_COST,\n            keeper_hourly_wage_cents: KEEPER_HOURLY_WAGE,\n            keepers: self\n                .keepers\n                .iter()\n                .map(|keeper| KeeperView {\n                    id: keeper.id,\n                    assigned_habitat_id: keeper.assigned_habitat_id,\n                    deliveries_completed: keeper.deliveries_completed,\n                    status: keeper.assigned_habitat_id.map_or_else(\n                        || \"Available for assignment\".to_owned(),\n                        |habitat_id| format!(\"Scheduled for habitat #{habitat_id}\"),\n                    ),\n                })\n                .collect(),\n        }\n    }\n\n    fn snapshot(&self) -> Snapshot {\n""",
)

replace_once(
    rust,
    """                has_shelter: habitat.has_shelter,\n                care_status: habitat.care_status(),\n                appeal: habitat.appeal(),\n""",
    """                has_shelter: habitat.has_shelter,\n                keeper_id: habitat.keeper_id,\n                next_feed_delivery_in_minutes: habitat\n                    .next_feed_delivery_minute\n                    .map(|due| due.saturating_sub(self.absolute_minute())),\n                feeding_status: self.feeding_status(habitat),\n                care_status: habitat.care_status(),\n                appeal: habitat.appeal(),\n""",
)

replace_once(
    rust,
    """            habitats,\n            concessions,\n            animals: self.animal_views(),\n""",
    """            habitats,\n            concessions,\n            animal_care_depot: self.animal_care_depot_view(),\n            animals: self.animal_views(),\n""",
)

replace_once(
    rust,
    """struct HabitatView {\n""",
    """struct KeeperView {\n    id: u32,\n    assigned_habitat_id: Option<u32>,\n    deliveries_completed: u32,\n    status: String,\n}\n\n#[derive(Serialize)]\nstruct AnimalCareDepotView {\n    x: u32,\n    y: u32,\n    feed_crates: u32,\n    feed_batch_crates: u32,\n    feed_batch_cost_cents: i64,\n    keeper_hire_cost_cents: i64,\n    keeper_hourly_wage_cents: i64,\n    keepers: Vec<KeeperView>,\n}\n\n#[derive(Serialize)]\nstruct HabitatView {\n""",
)

replace_once(
    rust,
    """    cleanliness: u32,\n    has_shelter: bool,\n    care_status: String,\n""",
    """    cleanliness: u32,\n    has_shelter: bool,\n    keeper_id: Option<u32>,\n    next_feed_delivery_in_minutes: Option<u64>,\n    feeding_status: String,\n    care_status: String,\n""",
)

replace_once(
    rust,
    """    habitats: Vec<HabitatView>,\n    concessions: Vec<ConcessionView>,\n    animals: Vec<AnimalView>,\n""",
    """    habitats: Vec<HabitatView>,\n    concessions: Vec<ConcessionView>,\n    animal_care_depot: AnimalCareDepotView,\n    animals: Vec<AnimalView>,\n""",
)

replace_once(
    rust,
    """    pub fn feed_habitat(&mut self, habitat_id: u32) -> String {\n        self.state.feed_habitat(habitat_id).json()\n    }\n\n""",
    """    pub fn buy_animal_feed(&mut self) -> String {\n        self.state.buy_animal_feed().json()\n    }\n\n    pub fn hire_keeper(&mut self) -> String {\n        self.state.hire_keeper().json()\n    }\n\n    pub fn schedule_keeper(&mut self, habitat_id: u32) -> String {\n        self.state.schedule_keeper(habitat_id).json()\n    }\n\n    pub fn feed_habitat(&mut self, habitat_id: u32) -> String {\n        self.state.feed_habitat(habitat_id).json()\n    }\n\n""",
)

replace_once(
    rust,
    """mod tests {\n    use super::*;\n\n""",
    """mod tests {\n    use super::*;\n\n    fn staff_habitat(state: &mut GameState, habitat_id: u32) {\n        assert!(state.buy_animal_feed().ok);\n        assert!(state.hire_keeper().ok);\n        assert!(state.schedule_keeper(habitat_id).ok);\n    }\n\n""",
)

replace_count(
    rust,
    """        let habitat_id = state.habitats[0].id;\n        assert!(state.adopt(""",
    """        let habitat_id = state.habitats[0].id;\n        staff_habitat(state, habitat_id);\n        assert!(state.adopt(""",
    4,
)

replace_once(
    rust,
    """        let habitat_id = state.habitats[0].id;\n        assert_eq!(state.habitats[0].capacity(), 8);\n\n        for _ in 0..6 {\n""",
    """        let habitat_id = state.habitats[0].id;\n        staff_habitat(&mut state, habitat_id);\n        assert_eq!(state.habitats[0].capacity(), 8);\n\n        for _ in 0..6 {\n""",
)

replace_once(
    rust,
    """            let id = state.habitats[0].id;\n            assert!(state.adopt(id, \"capybara\").ok);\n""",
    """            let id = state.habitats[0].id;\n            staff_habitat(state, id);\n            assert!(state.adopt(id, \"capybara\").ok);\n""",
)

replace_once(
    rust,
    """        let before = state.cash_cents;\n        assert!(state.feed_habitat(habitat_id).ok);\n        let after_first = state.cash_cents;\n        assert_eq!(after_first, before - FOOD_RESTOCK_COST);\n        assert!(state.feed_habitat(habitat_id).ok);\n        assert_eq!(state.cash_cents, after_first);\n""",
    """        let before = state.feed_crates;\n        assert!(state.feed_habitat(habitat_id).ok);\n        let after_first = state.feed_crates;\n        assert_eq!(after_first, before - 1);\n        assert!(state.feed_habitat(habitat_id).ok);\n        assert_eq!(state.feed_crates, after_first);\n""",
)

replace_once(
    rust,
    """    #[test]\n    fn simulation_remains_deterministic() {\n""",
    """    #[test]\n    fn adoption_requires_a_scheduled_keeper() {\n        let mut state = GameState::default();\n        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);\n        let habitat_id = state.habitats[0].id;\n\n        let unstaffed = state.adopt(habitat_id, \"capybara\");\n        assert!(!unstaffed.ok);\n        assert_eq!(unstaffed.message, \"Schedule a keeper before adopting animals\");\n\n        assert!(state.hire_keeper().ok);\n        assert!(state.schedule_keeper(habitat_id).ok);\n        assert!(state.adopt(habitat_id, \"capybara\").ok);\n    }\n\n    #[test]\n    fn keeper_assignment_is_idempotent_and_one_keeper_cannot_cover_two_habitats() {\n        let mut state = GameState::default();\n        for x in 5..=11 {\n            assert!(state.place_path(x, ENTRANCE_Y).ok);\n        }\n        assert!(state.place_habitat_rect(3, 8, 5, 10).ok);\n        assert!(state.place_habitat_rect(7, 8, 9, 10).ok);\n        let first_id = state.habitats[0].id;\n        let second_id = state.habitats[1].id;\n\n        assert!(state.hire_keeper().ok);\n        assert!(state.schedule_keeper(first_id).ok);\n        assert!(state.schedule_keeper(first_id).ok);\n        assert_eq!(state.keepers.len(), 1);\n        assert_eq!(state.keepers[0].assigned_habitat_id, Some(first_id));\n\n        let unavailable = state.schedule_keeper(second_id);\n        assert!(!unavailable.ok);\n        assert!(unavailable.message.contains(\"hire another\"));\n\n        assert!(state.hire_keeper().ok);\n        assert!(state.schedule_keeper(second_id).ok);\n        assert_eq!(state.habitats[1].keeper_id, Some(2));\n    }\n\n    #[test]\n    fn scheduled_delivery_consumes_depot_stock_and_refills_food() {\n        let mut state = GameState::default();\n        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);\n        let habitat_id = state.habitats[0].id;\n        staff_habitat(&mut state, habitat_id);\n        assert!(state.adopt(habitat_id, \"capybara\").ok);\n        state.habitats[0].food = 40;\n        state.habitats[0].next_feed_delivery_minute = Some(state.absolute_minute() + 1);\n        let before = state.feed_crates;\n\n        state.tick(1);\n\n        assert_eq!(state.habitats[0].food, 100);\n        assert_eq!(state.feed_crates, before - 1);\n        assert_eq!(state.keepers[0].deliveries_completed, 1);\n    }\n\n    #[test]\n    fn empty_depot_retries_without_creating_free_feed() {\n        let mut state = GameState::default();\n        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);\n        let habitat_id = state.habitats[0].id;\n        assert!(state.hire_keeper().ok);\n        assert!(state.schedule_keeper(habitat_id).ok);\n        assert!(state.adopt(habitat_id, \"capybara\").ok);\n        state.habitats[0].food = 40;\n        state.habitats[0].next_feed_delivery_minute = Some(state.absolute_minute() + 1);\n\n        state.tick(1);\n\n        assert_eq!(state.feed_crates, 0);\n        assert!(state.habitats[0].food < 100);\n        assert_eq!(\n            state.habitats[0].next_feed_delivery_minute,\n            Some(state.absolute_minute() + u64::from(FEED_DELIVERY_RETRY_MINUTES))\n        );\n    }\n\n    #[test]\n    fn bulldozing_habitat_releases_its_keeper() {\n        let mut state = GameState::default();\n        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);\n        let habitat_id = state.habitats[0].id;\n        assert!(state.hire_keeper().ok);\n        assert!(state.schedule_keeper(habitat_id).ok);\n\n        assert!(state.bulldoze(3, 8).ok);\n        assert!(state.habitats.is_empty());\n        assert_eq!(state.keepers[0].assigned_habitat_id, None);\n    }\n\n    #[test]\n    fn keeper_wages_are_charged_by_hourly_upkeep() {\n        let mut state = GameState::default();\n        assert!(state.hire_keeper().ok);\n        let before = state.cash_cents;\n\n        state.charge_upkeep();\n\n        assert_eq!(state.cash_cents, before - KEEPER_HOURLY_WAGE);\n    }\n\n    #[test]\n    fn simulation_remains_deterministic() {\n""",
)

# Browser presentation and interaction.
replace_once(
    app,
    """  cleanliness: number\n  has_shelter: boolean\n  care_status: string\n""",
    """  cleanliness: number\n  has_shelter: boolean\n  keeper_id: number | null\n  next_feed_delivery_in_minutes: number | null\n  feeding_status: string\n  care_status: string\n""",
)

replace_once(
    app,
    """type Guest = Point & {\n""",
    """type Keeper = {\n  id: number\n  assigned_habitat_id: number | null\n  deliveries_completed: number\n  status: string\n}\n\ntype AnimalCareDepot = Point & {\n  feed_crates: number\n  feed_batch_crates: number\n  feed_batch_cost_cents: number\n  keeper_hire_cost_cents: number\n  keeper_hourly_wage_cents: number\n  keepers: Keeper[]\n}\n\ntype Guest = Point & {\n""",
)

replace_once(
    app,
    """  habitats: Habitat[]\n  concessions: Concession[]\n  animals: Animal[]\n""",
    """  habitats: Habitat[]\n  concessions: Concession[]\n  animal_care_depot: AnimalCareDepot\n  animals: Animal[]\n""",
)

replace_once(
    app,
    """  const [message, setMessage] = useState(\n    \"Extend the entrance path, draw a fenced habitat, then adopt animals.\",\n  )\n""",
    """  const [message, setMessage] = useState(\n    \"Extend the entrance path, draw a habitat, then stock and staff it through the care depot.\",\n  )\n""",
)

replace_once(
    app,
    """  const [selectedHabitatId, setSelectedHabitatId] = useState<number | null>(null)\n  const [selectedGuestId, setSelectedGuestId] = useState<number | null>(null)\n""",
    """  const [selectedHabitatId, setSelectedHabitatId] = useState<number | null>(null)\n  const [selectedGuestId, setSelectedGuestId] = useState<number | null>(null)\n  const [selectedDepot, setSelectedDepot] = useState(false)\n""",
)

replace_once(
    app,
    """    if (tool === \"select\") {\n      setSelectedGuestId(null)\n      setSelectedHabitatId(tile.habitat_id)\n""",
    """    if (tool === \"select\") {\n      setSelectedGuestId(null)\n      setSelectedDepot(false)\n      setSelectedHabitatId(tile.habitat_id)\n""",
)

replace_once(
    app,
    """  const careForHabitat = (action: \"feed\" | \"water\" | \"clean\" | \"shelter\") => {\n    const game = gameRef.current\n    if (!game || selectedHabitatId === null) return\n    if (action === \"feed\") perform(() => game.feed_habitat(selectedHabitatId))\n    if (action === \"water\") perform(() => game.refill_water(selectedHabitatId))\n    if (action === \"clean\") perform(() => game.clean_habitat(selectedHabitatId))\n    if (action === \"shelter\") perform(() => game.add_shelter(selectedHabitatId))\n  }\n\n""",
    """  const careForHabitat = (action: \"water\" | \"clean\" | \"shelter\") => {\n    const game = gameRef.current\n    if (!game || selectedHabitatId === null) return\n    if (action === \"water\") perform(() => game.refill_water(selectedHabitatId))\n    if (action === \"clean\") perform(() => game.clean_habitat(selectedHabitatId))\n    if (action === \"shelter\") perform(() => game.add_shelter(selectedHabitatId))\n  }\n\n  const scheduleKeeper = () => {\n    const game = gameRef.current\n    if (!game || selectedHabitatId === null) return\n    perform(() => game.schedule_keeper(selectedHabitatId))\n  }\n\n  const buyAnimalFeed = () => {\n    const game = gameRef.current\n    if (!game) return\n    perform(() => game.buy_animal_feed())\n  }\n\n  const hireKeeper = () => {\n    const game = gameRef.current\n    if (!game) return\n    perform(() => game.hire_keeper())\n  }\n\n""",
)

replace_once(
    app,
    """    setSelectedHabitatId(null)\n    setSelectedGuestId(null)\n    setHoveredTile(null)\n""",
    """    setSelectedHabitatId(null)\n    setSelectedGuestId(null)\n    setSelectedDepot(false)\n    setHoveredTile(null)\n""",
)

replace_once(
    app,
    """            {snapshot.concessions.map((stand) => {\n""",
    """            {(() => {\n              const depot = snapshot.animal_care_depot\n              const position = isoPosition(depot.x, depot.y)\n              return (\n                <button\n                  type=\"button\"\n                  className=\"care-depot\"\n                  style={{\n                    left: position.left + 4,\n                    top: position.top - 54,\n                    zIndex: 640 + depot.x + depot.y,\n                  }}\n                  title={`${depot.feed_crates} animal-feed crates · ${depot.keepers.length} keepers`}\n                  aria-label=\"Animal care depot\"\n                  onClick={(event) => {\n                    event.stopPropagation()\n                    if (tool === \"pan\") return\n                    if (tool === \"bulldoze\") {\n                      setMessage(\"The central animal-care depot cannot be demolished.\")\n                      setMessageKind(\"error\")\n                      return\n                    }\n                    setSelectedGuestId(null)\n                    setSelectedHabitatId(null)\n                    setSelectedDepot(true)\n                    setTool(\"select\")\n                    setMessage(\"Animal care depot selected · buy feed and hire keepers here.\")\n                    setMessageKind(\"info\")\n                  }}\n                >\n                  <span className=\"concession-awning\" />\n                  <strong>Care</strong>\n                  <small>DEPOT</small>\n                  <span className=\"concession-counter\" />\n                </button>\n              )\n            })()}\n\n            {snapshot.concessions.map((stand) => {\n""",
)

replace_count(
    app,
    """                    setSelectedGuestId(null)\n                    setSelectedHabitatId(null)\n                    setTool(\"select\")\n""",
    """                    setSelectedGuestId(null)\n                    setSelectedHabitatId(null)\n                    setSelectedDepot(false)\n                    setTool(\"select\")\n""",
    1,
)

replace_count(
    app,
    """                    setSelectedGuestId(null)\n                    setSelectedHabitatId(animal.habitat_id)\n                    setTool(\"select\")\n""",
    """                    setSelectedGuestId(null)\n                    setSelectedHabitatId(animal.habitat_id)\n                    setSelectedDepot(false)\n                    setTool(\"select\")\n""",
    1,
)

replace_count(
    app,
    """                      setSelectedGuestId(null)\n                      setSelectedHabitatId(habitat.id)\n                      setTool(\"select\")\n""",
    """                      setSelectedGuestId(null)\n                      setSelectedHabitatId(habitat.id)\n                      setSelectedDepot(false)\n                      setTool(\"select\")\n""",
    1,
)

replace_count(
    app,
    """                    setSelectedGuestId(guest.id)\n                    setSelectedHabitatId(null)\n                    setTool(\"select\")\n""",
    """                    setSelectedGuestId(guest.id)\n                    setSelectedHabitatId(null)\n                    setSelectedDepot(false)\n                    setTool(\"select\")\n""",
    1,
)

replace_once(
    app,
    """        <aside className=\"side-panel bevel\">\n          {selectedGuest ? (\n""",
    """        <aside className=\"side-panel bevel\">\n          {selectedDepot ? (\n            <>\n              <div className=\"window-title\">\n                <span>Animal care depot</span>\n                <button onClick={() => setSelectedDepot(false)}>×</button>\n              </div>\n              <div className=\"manager-card\">\n                <div className=\"guest-thought\">\n                  Animal feed and keeper staffing are dispatched from this central facility.\n                </div>\n                <dl>\n                  <div>\n                    <dt>Feed stock</dt>\n                    <dd>{snapshot.animal_care_depot.feed_crates} crates</dd>\n                  </div>\n                  <div>\n                    <dt>Keepers</dt>\n                    <dd>{snapshot.animal_care_depot.keepers.length}</dd>\n                  </div>\n                  <div>\n                    <dt>Wage / keeper</dt>\n                    <dd>{money(snapshot.animal_care_depot.keeper_hourly_wage_cents)}/hr</dd>\n                  </div>\n                </dl>\n                <button className=\"shop-row\" onClick={buyAnimalFeed}>\n                  <span>\n                    <b>Buy {snapshot.animal_care_depot.feed_batch_crates} feed crates</b>\n                    <small>Stock used by scheduled habitat food runs</small>\n                  </span>\n                  <strong>{money(snapshot.animal_care_depot.feed_batch_cost_cents)}</strong>\n                </button>\n                <button className=\"shop-row\" onClick={hireKeeper}>\n                  <span>\n                    <b>Hire keeper</b>\n                    <small>One keeper can currently serve one habitat</small>\n                  </span>\n                  <strong>{money(snapshot.animal_care_depot.keeper_hire_cost_cents)}</strong>\n                </button>\n                <h3>Keeper schedule</h3>\n                {snapshot.animal_care_depot.keepers.length === 0 ? (\n                  <div className=\"guest-thought\">No keepers hired yet.</div>\n                ) : (\n                  snapshot.animal_care_depot.keepers.map((keeper) => (\n                    <dl key={keeper.id}>\n                      <div>\n                        <dt>Keeper #{keeper.id}</dt>\n                        <dd>{keeper.status}</dd>\n                      </div>\n                      <div>\n                        <dt>Food deliveries</dt>\n                        <dd>{keeper.deliveries_completed}</dd>\n                      </div>\n                    </dl>\n                  ))\n                )}\n              </div>\n            </>\n          ) : selectedGuest ? (\n""",
)

replace_once(
    app,
    """                <h3>Care</h3>\n                <div className=\"guest-thought\">{selectedHabitat.care_status}</div>\n                <NeedBar label=\"Food\" value={selectedHabitat.food} />\n""",
    """                <h3>Care</h3>\n                <div className=\"guest-thought\">{selectedHabitat.care_status}</div>\n                <dl>\n                  <div>\n                    <dt>Food keeper</dt>\n                    <dd>\n                      {selectedHabitat.keeper_id === null\n                        ? \"Not scheduled\"\n                        : `Keeper #${selectedHabitat.keeper_id}`}\n                    </dd>\n                  </div>\n                  <div>\n                    <dt>Next food run</dt>\n                    <dd>\n                      {selectedHabitat.next_feed_delivery_in_minutes === null\n                        ? \"Not scheduled\"\n                        : `${selectedHabitat.next_feed_delivery_in_minutes} min`}\n                    </dd>\n                  </div>\n                </dl>\n                <div className=\"guest-thought\">{selectedHabitat.feeding_status}</div>\n                {selectedHabitat.keeper_id === null && (\n                  <button className=\"shop-row\" onClick={scheduleKeeper}>\n                    <span>\n                      <b>Schedule available keeper</b>\n                      <small>Hire keepers at the central care depot first</small>\n                    </span>\n                  </button>\n                )}\n                <NeedBar label=\"Food\" value={selectedHabitat.food} />\n""",
)

replace_once(
    app,
    """                <button className=\"shop-row\" onClick={() => careForHabitat(\"feed\")}>\n                  <span>\n                    <b>Restock food</b>\n                    <small>Fill habitat food stores</small>\n                  </span>\n                </button>\n""",
    "",
)

replace_once(
    app,
    """                <h3>Adopt animal</h3>\n                {snapshot.species_catalog.map((offer) => {\n                  const wrongSpecies =\n""",
    """                <h3>Adopt animal</h3>\n                {selectedHabitat.keeper_id === null && (\n                  <div className=\"guest-thought\">\n                    Schedule a keeper before animals can move into this habitat.\n                  </div>\n                )}\n                {snapshot.species_catalog.map((offer) => {\n                  const wrongSpecies =\n""",
)

replace_once(
    app,
    """                  const full = selectedHabitat.animals >= selectedHabitat.capacity\n                  return (\n""",
    """                  const full = selectedHabitat.animals >= selectedHabitat.capacity\n                  const unstaffed = selectedHabitat.keeper_id === null\n                  return (\n""",
)

replace_once(
    app,
    """                      disabled={wrongSpecies || full}\n""",
    """                      disabled={wrongSpecies || full || unstaffed}\n""",
)

replace_once(
    app,
    """                  <li>Select the enclosure and adopt one of the available species.</li>\n                  <li>Place food and drink stands on clear grass beside busy paths.</li>\n                  <li>Watch guests buy refreshments while they move through the zoo.</li>\n""",
    """                  <li>Open the care depot, buy animal feed, and hire a keeper.</li>\n                  <li>Select the enclosure and schedule an available keeper.</li>\n                  <li>Adopt animals after the habitat has a food-delivery schedule.</li>\n                  <li>Place guest food and drink stands on clear grass beside busy paths.</li>\n                  <li>Watch keepers maintain feed stock while guests buy refreshments.</li>\n""",
)

# Dedicated care-depot building visuals without making it part of the guest concession selector.
with css.open("a") as handle:
    handle.write(
        """\n\n.care-depot {\n  position: absolute;\n  width: 62px;\n  min-width: 62px;\n  height: 58px;\n  padding: 0;\n  border: 2px solid #493722;\n  border-radius: 4px 4px 6px 6px;\n  background: #9ca86a;\n  color: #2d2419;\n  cursor: pointer;\n  box-shadow:\n    0 7px 0 rgb(56 48 31 / 30%),\n    inset 0 2px 0 rgb(255 255 255 / 35%);\n  transform: skewY(-3deg);\n}\n\n.care-depot:hover {\n  filter: brightness(1.08);\n  transform: translateY(-2px) skewY(-3deg);\n}\n\n.care-depot .concession-awning {\n  width: 68px;\n  background: repeating-linear-gradient(90deg, #f4efe2 0 8px, #6d7f45 8px 16px);\n}\n\n.care-depot strong,\n.care-depot small {\n  position: absolute;\n  left: 4px;\n  right: 4px;\n  text-align: center;\n  line-height: 1;\n}\n\n.care-depot strong {\n  top: 11px;\n  font-size: 10px;\n  text-transform: uppercase;\n}\n\n.care-depot small {\n  top: 27px;\n  font-size: 8px;\n  font-weight: 900;\n  letter-spacing: 0.8px;\n}\n"""
    )

replace_once(
    concession_proof,
    """  await clickTool(\"Food stand\")\n  await clickGrassTile(2, 6)\n""",
    """  await clickTool(\"Food stand\")\n  await clickGrassTile(3, 6)\n""",
)

animal_care_proof = root / "apps/web/scripts/capture-animal-care-proof.mjs"
animal_care_proof.write_text(
    '''import {spawn} from "node:child_process"\nimport {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs"\n\nconst previewUrl = "http://127.0.0.1:4173/"\nconst debuggingPort = 9225\nconst chromeCandidates = [\n  process.env.CHROME_PATH,\n  "/usr/bin/google-chrome",\n  "/usr/bin/google-chrome-stable",\n  "/usr/bin/chromium",\n  "/usr/bin/chromium-browser",\n].filter(Boolean)\nconst chromePath = chromeCandidates.find((candidate) => existsSync(candidate))\n\nif (!chromePath) {\n  throw new Error(`No Chrome/Chromium binary found. Checked: ${chromeCandidates.join(", ")}`)\n}\n\nconst profileDir = `/tmp/zoo-animal-care-proof-${process.pid}`\nrmSync(profileDir, {recursive: true, force: true})\nconst chrome = spawn(\n  chromePath,\n  [\n    "--headless=new",\n    "--no-sandbox",\n    "--disable-gpu",\n    `--remote-debugging-port=${debuggingPort}`,\n    `--user-data-dir=${profileDir}`,\n    "--window-size=1280,850",\n    previewUrl,\n  ],\n  {stdio: "ignore"},\n)\n\nconst sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))\n\nasync function waitForPageTarget() {\n  let lastError = null\n  for (let attempt = 0; attempt < 60; attempt += 1) {\n    try {\n      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json`)\n      if (response.ok) {\n        const targets = await response.json()\n        const target = targets.find(\n          (candidate) => candidate.type === "page" && candidate.url.startsWith(previewUrl),\n        )\n        if (target?.webSocketDebuggerUrl) return target\n      }\n    } catch (error) {\n      lastError = error\n    }\n    await sleep(250)\n  }\n  throw new Error(`Chrome did not expose the Zoo page target: ${lastError ?? "timed out"}`)\n}\n\nfunction connectCdp(webSocketDebuggerUrl) {\n  const socket = new WebSocket(webSocketDebuggerUrl)\n  const pending = new Map()\n  let nextId = 1\n  const opened = new Promise((resolve, reject) => {\n    socket.addEventListener("open", resolve, {once: true})\n    socket.addEventListener("error", reject, {once: true})\n  })\n  socket.addEventListener("message", (event) => {\n    const message = JSON.parse(String(event.data))\n    if (!message.id) return\n    const request = pending.get(message.id)\n    if (!request) return\n    pending.delete(message.id)\n    if (message.error) request.reject(new Error(`${message.error.code}: ${message.error.message}`))\n    else request.resolve(message.result)\n  })\n  return {\n    opened,\n    close: () => socket.close(),\n    send(method, params = {}) {\n      const id = nextId\n      nextId += 1\n      return new Promise((resolve, reject) => {\n        pending.set(id, {resolve, reject})\n        socket.send(JSON.stringify({id, method, params}))\n      })\n    },\n  }\n}\n\nlet cdp = null\ntry {\n  const target = await waitForPageTarget()\n  cdp = connectCdp(target.webSocketDebuggerUrl)\n  await cdp.opened\n  await cdp.send("Page.enable")\n  await cdp.send("Runtime.enable")\n\n  const evaluate = async (expression) => {\n    const response = await cdp.send("Runtime.evaluate", {\n      expression,\n      awaitPromise: true,\n      returnByValue: true,\n    })\n    if (response.exceptionDetails) {\n      throw new Error(response.exceptionDetails.text ?? "Browser evaluation failed")\n    }\n    return response.result.value\n  }\n\n  for (let attempt = 0; attempt < 80; attempt += 1) {\n    if (await evaluate("Boolean(document.querySelector('.care-depot'))")) break\n    if (attempt === 79) throw new Error("Animal care depot did not render")\n    await sleep(250)\n  }\n\n  await evaluate("document.querySelector('.care-depot').click(); true")\n  for (let attempt = 0; attempt < 40; attempt += 1) {\n    if (await evaluate("document.body.textContent.includes('Animal care depot')")) break\n    if (attempt === 39) throw new Error("Animal care depot panel did not open")\n    await sleep(100)\n  }\n\n  const clickPanelButton = async (label) => {\n    const clicked = await evaluate(`(() => {\n      const button = [...document.querySelectorAll('.side-panel button')].find((candidate) =>\n        candidate.textContent.includes(${JSON.stringify(label)}),\n      )\n      if (!button) return false\n      button.click()\n      return true\n    })()`)\n    if (!clicked) throw new Error(`Missing animal-care action: ${label}`)\n    await sleep(100)\n  }\n\n  await clickPanelButton("Buy 10 feed crates")\n  await clickPanelButton("Hire keeper")\n\n  const finalState = JSON.parse(\n    await evaluate(`JSON.stringify({\n      hasDepot: Boolean(document.querySelector('.care-depot')),\n      hasFeed: document.body.textContent.includes('10 crates'),\n      hasKeeper: document.body.textContent.includes('Keeper #1'),\n      hasAvailable: document.body.textContent.includes('Available for assignment'),\n    })`),\n  )\n  if (!finalState.hasDepot || !finalState.hasFeed || !finalState.hasKeeper || !finalState.hasAvailable) {\n    throw new Error(`Animal-care depot did not reach expected state: ${JSON.stringify(finalState)}`)\n  }\n\n  mkdirSync("test-results", {recursive: true})\n  const screenshot = await cdp.send("Page.captureScreenshot", {format: "png", fromSurface: true})\n  writeFileSync("test-results/animal-care-depot.png", Buffer.from(screenshot.data, "base64"))\n  console.log("Animal-care dogfood passed: feed purchased and keeper hired from the central depot")\n} finally {\n  cdp?.close()\n  chrome.kill("SIGTERM")\n  rmSync(profileDir, {recursive: true, force: true})\n}\n'''
)

replace_once(
    verify,
    """          bun scripts/capture-concessions-proof.mjs\n""",
    """          bun scripts/capture-concessions-proof.mjs\n          bun scripts/capture-animal-care-proof.mjs\n""",
)

replace_once(
    verify,
    """      - name: Upload playable web preview\n""",
    """      - name: Upload animal-care visual proof\n        if: always() && github.event_name == 'pull_request'\n        uses: actions/upload-artifact@v4\n        with:\n          name: zoo-animal-care-visual-proof\n          path: apps/web/test-results/animal-care-depot.png\n          if-no-files-found: error\n          retention-days: 7\n      - name: Upload playable web preview\n""",
)

print("Animal-care depot slice materialized")
