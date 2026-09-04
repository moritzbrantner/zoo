use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use wasm_bindgen::prelude::*;

const WIDTH: u32 = 20;
const HEIGHT: u32 = 14;
const ENTRANCE_X: u32 = 0;
const ENTRANCE_Y: u32 = 7;
const PATH_COST: i64 = 1_000;
const HABITAT_COST: i64 = 70_000;
const ADMISSION_PRICE: i64 = 1_200;
const HABITAT_WIDTH: u32 = 4;
const HABITAT_HEIGHT: u32 = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum TileKind {
    Grass,
    Path,
    Entrance,
    Habitat(u32),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
struct Position {
    x: u32,
    y: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum HabitatOrientation {
    Horizontal,
    Vertical,
}

impl HabitatOrientation {
    fn from_code(value: u8) -> Self {
        match value {
            1 => Self::Vertical,
            _ => Self::Horizontal,
        }
    }

    fn dimensions(self) -> (u32, u32) {
        match self {
            Self::Horizontal => (HABITAT_WIDTH, HABITAT_HEIGHT),
            Self::Vertical => (HABITAT_HEIGHT, HABITAT_WIDTH),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WelfareProfile {
    minimum_social_group: u32,
    space_per_animal: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum Species {
    Capybara,
    Flamingo,
}

impl Species {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "capybara" => Some(Self::Capybara),
            "flamingo" => Some(Self::Flamingo),
            _ => None,
        }
    }

    fn purchase_cost(self) -> i64 {
        match self {
            Self::Capybara => 25_000,
            Self::Flamingo => 18_000,
        }
    }

    fn appeal(self) -> u32 {
        match self {
            Self::Capybara => 95,
            Self::Flamingo => 80,
        }
    }

    fn welfare_profile(self) -> WelfareProfile {
        match self {
            Self::Capybara => WelfareProfile {
                minimum_social_group: 2,
                space_per_animal: 4,
            },
            Self::Flamingo => WelfareProfile {
                minimum_social_group: 3,
                space_per_animal: 2,
            },
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Capybara => "Capybara",
            Self::Flamingo => "Flamingo",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
struct Habitat {
    id: u32,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    orientation: HabitatOrientation,
    species: Option<Species>,
    animals: u32,
    welfare: u32,
}

impl Habitat {
    fn capacity(&self) -> u32 {
        4
    }

    fn appeal(&self) -> u32 {
        self.species.map_or(0, |species| {
            species.appeal().saturating_mul(self.animals.max(1))
        })
    }

    fn social_score(&self) -> u32 {
        let Some(species) = self.species else {
            return 100;
        };
        if self.animals == 0 {
            return 100;
        }

        let minimum_group = species.welfare_profile().minimum_social_group.max(1);
        self.animals
            .saturating_mul(100)
            .checked_div(minimum_group)
            .unwrap_or(100)
            .min(100)
    }

    fn space_score(&self) -> u32 {
        let Some(species) = self.species else {
            return 100;
        };
        if self.animals == 0 {
            return 100;
        }

        let available_space = self.width.saturating_mul(self.height);
        let required_space = self
            .animals
            .saturating_mul(species.welfare_profile().space_per_animal);
        if required_space <= available_space {
            100
        } else {
            available_space
                .saturating_mul(100)
                .checked_div(required_space)
                .unwrap_or(0)
                .min(100)
        }
    }

    fn welfare_target(&self) -> u32 {
        let social = self.social_score();
        let space = self.space_score();
        (social.saturating_mul(3) + space.saturating_mul(2)) / 5
    }

    fn welfare_status(&self) -> String {
        let Some(species) = self.species else {
            return "Ready for animals".to_owned();
        };
        let social = self.social_score();
        let space = self.space_score();
        let minimum_group = species.welfare_profile().minimum_social_group;

        match (social < 100, space < 100) {
            (true, true) => "Social group is too small and habitat space is crowded".to_owned(),
            (true, false) => format!("Social group needs at least {minimum_group} animals"),
            (false, true) => "Habitat space is crowded for this group".to_owned(),
            (false, false) => "Social group and space needs are met".to_owned(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum GuestState {
    WalkingToHabitat,
    Viewing,
    WalkingToExit,
}

#[derive(Clone, Debug)]
struct Guest {
    id: u32,
    x: u32,
    y: u32,
    happiness: u32,
    energy: u32,
    hunger: u32,
    thirst: u32,
    value_perception: u32,
    minutes_in_park: u32,
    target_habitat: u32,
    state: GuestState,
    route: Vec<Position>,
    route_index: usize,
    viewing_minutes: u32,
}

impl Guest {
    fn thought(&self) -> &'static str {
        if self.thirst >= 60 {
            "I'm getting thirsty."
        } else if self.hunger >= 60 {
            "I could use something to eat."
        } else if self.energy <= 35 {
            "My feet are getting tired."
        } else if self.value_perception <= 40 {
            "I expected a little more for the price."
        } else {
            match self.state {
                GuestState::WalkingToHabitat => "I want to see the animals.",
                GuestState::Viewing => "The animals are wonderful.",
                GuestState::WalkingToExit => "I'm ready to head home.",
            }
        }
    }
}

#[derive(Clone, Debug, Serialize)]
struct PlacementEvaluation {
    ok: bool,
    message: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    orientation: HabitatOrientation,
    cost_cents: i64,
    occupied_tiles: Vec<Position>,
}

impl PlacementEvaluation {
    fn valid(
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        orientation: HabitatOrientation,
        occupied_tiles: Vec<Position>,
    ) -> Self {
        Self {
            ok: true,
            message: "Habitat can be placed here".to_owned(),
            x,
            y,
            width,
            height,
            orientation,
            cost_cents: HABITAT_COST,
            occupied_tiles,
        }
    }

    fn invalid(
        message: impl Into<String>,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        orientation: HabitatOrientation,
        occupied_tiles: Vec<Position>,
    ) -> Self {
        Self {
            ok: false,
            message: message.into(),
            x,
            y,
            width,
            height,
            orientation,
            cost_cents: HABITAT_COST,
            occupied_tiles,
        }
    }
}

#[derive(Clone, Debug)]
struct GameState {
    width: u32,
    height: u32,
    tiles: Vec<TileKind>,
    habitats: Vec<Habitat>,
    guests: Vec<Guest>,
    cash_cents: i64,
    day: u32,
    minute_of_day: u32,
    rating: u32,
    next_habitat_id: u32,
    next_guest_id: u32,
    spawn_accumulator: u32,
    upkeep_accumulator: u32,
    movement_accumulator: u32,
    income_today_cents: i64,
    expenses_today_cents: i64,
}

impl Default for GameState {
    fn default() -> Self {
        let mut state = Self {
            width: WIDTH,
            height: HEIGHT,
            tiles: vec![TileKind::Grass; (WIDTH * HEIGHT) as usize],
            habitats: Vec::new(),
            guests: Vec::new(),
            cash_cents: 5_000_000,
            day: 1,
            minute_of_day: 9 * 60,
            rating: 400,
            next_habitat_id: 1,
            next_guest_id: 1,
            spawn_accumulator: 0,
            upkeep_accumulator: 0,
            movement_accumulator: 0,
            income_today_cents: 0,
            expenses_today_cents: 0,
        };

        state.set_tile(ENTRANCE_X, ENTRANCE_Y, TileKind::Entrance);
        for x in 1..=4 {
            state.set_tile(x, ENTRANCE_Y, TileKind::Path);
        }
        state
    }
}

impl GameState {
    fn index(&self, x: u32, y: u32) -> Option<usize> {
        (x < self.width && y < self.height).then_some((y * self.width + x) as usize)
    }

    fn tile(&self, x: u32, y: u32) -> Option<TileKind> {
        self.index(x, y).map(|index| self.tiles[index])
    }

    fn set_tile(&mut self, x: u32, y: u32, kind: TileKind) {
        if let Some(index) = self.index(x, y) {
            self.tiles[index] = kind;
        }
    }

    fn spend(&mut self, cents: i64) -> Result<(), &'static str> {
        if self.cash_cents < cents {
            return Err("Not enough cash");
        }
        self.cash_cents -= cents;
        self.expenses_today_cents += cents;
        Ok(())
    }

    fn place_path(&mut self, x: u32, y: u32) -> ActionResult {
        match self.tile(x, y) {
            None => ActionResult::error("That tile is outside the park"),
            Some(TileKind::Path) => ActionResult::ok("Path already exists"),
            Some(TileKind::Entrance) => ActionResult::ok("The entrance already acts as a path"),
            Some(TileKind::Habitat(_)) => ActionResult::error("A habitat occupies that tile"),
            Some(TileKind::Grass) => match self.spend(PATH_COST) {
                Ok(()) => {
                    self.set_tile(x, y, TileKind::Path);
                    ActionResult::ok("Path built")
                }
                Err(message) => ActionResult::error(message),
            },
        }
    }

    fn habitat_footprint(
        &self,
        x: u32,
        y: u32,
        orientation: HabitatOrientation,
    ) -> (u32, u32, Vec<Position>) {
        let (width, height) = orientation.dimensions();
        let mut occupied_tiles = Vec::with_capacity((width * height) as usize);
        for tile_y in y..y.saturating_add(height) {
            for tile_x in x..x.saturating_add(width) {
                occupied_tiles.push(Position {
                    x: tile_x,
                    y: tile_y,
                });
            }
        }
        (width, height, occupied_tiles)
    }

    fn evaluate_habitat(
        &self,
        x: u32,
        y: u32,
        orientation: HabitatOrientation,
    ) -> PlacementEvaluation {
        let (width, height, occupied_tiles) = self.habitat_footprint(x, y, orientation);
        let in_bounds = x
            .checked_add(width)
            .is_some_and(|right| right <= self.width)
            && y.checked_add(height)
                .is_some_and(|bottom| bottom <= self.height);
        if !in_bounds {
            return PlacementEvaluation::invalid(
                "The habitat would extend outside the park",
                x,
                y,
                width,
                height,
                orientation,
                occupied_tiles,
            );
        }

        if occupied_tiles
            .iter()
            .any(|tile| self.tile(tile.x, tile.y) != Some(TileKind::Grass))
        {
            return PlacementEvaluation::invalid(
                "The habitat footprint must be clear grass",
                x,
                y,
                width,
                height,
                orientation,
                occupied_tiles,
            );
        }

        let touches_path = occupied_tiles.iter().any(|tile| {
            self.neighbors(*tile).into_iter().any(|neighbor| {
                matches!(
                    self.tile(neighbor.x, neighbor.y),
                    Some(TileKind::Path | TileKind::Entrance)
                )
            })
        });
        if !touches_path {
            return PlacementEvaluation::invalid(
                "Habitats need at least one path along their edge",
                x,
                y,
                width,
                height,
                orientation,
                occupied_tiles,
            );
        }

        if self.cash_cents < HABITAT_COST {
            return PlacementEvaluation::invalid(
                "Not enough cash",
                x,
                y,
                width,
                height,
                orientation,
                occupied_tiles,
            );
        }

        PlacementEvaluation::valid(x, y, width, height, orientation, occupied_tiles)
    }

    fn place_habitat(&mut self, x: u32, y: u32, orientation: HabitatOrientation) -> ActionResult {
        if let Some(existing) = self
            .habitats
            .iter()
            .find(|habitat| habitat.x == x && habitat.y == y && habitat.orientation == orientation)
        {
            return ActionResult::ok(format!("Habitat #{} already exists here", existing.id));
        }

        let evaluation = self.evaluate_habitat(x, y, orientation);
        if !evaluation.ok {
            return ActionResult::error(evaluation.message);
        }
        if let Err(message) = self.spend(HABITAT_COST) {
            return ActionResult::error(message);
        }

        let id = self.next_habitat_id;
        self.next_habitat_id += 1;
        for tile in &evaluation.occupied_tiles {
            self.set_tile(tile.x, tile.y, TileKind::Habitat(id));
        }
        self.habitats.push(Habitat {
            id,
            x,
            y,
            width: evaluation.width,
            height: evaluation.height,
            orientation,
            species: None,
            animals: 0,
            welfare: 100,
        });

        ActionResult::ok(format!("Habitat #{id} built"))
    }

    fn bulldoze(&mut self, x: u32, y: u32) -> ActionResult {
        match self.tile(x, y) {
            None => ActionResult::error("That tile is outside the park"),
            Some(TileKind::Grass) => ActionResult::ok("Nothing to demolish"),
            Some(TileKind::Entrance) => {
                ActionResult::error("The park entrance cannot be demolished")
            }
            Some(TileKind::Path) => {
                self.set_tile(x, y, TileKind::Grass);
                ActionResult::ok("Path removed")
            }
            Some(TileKind::Habitat(id)) => {
                for tile_y in 0..self.height {
                    for tile_x in 0..self.width {
                        if self.tile(tile_x, tile_y) == Some(TileKind::Habitat(id)) {
                            self.set_tile(tile_x, tile_y, TileKind::Grass);
                        }
                    }
                }
                self.habitats.retain(|habitat| habitat.id != id);
                self.guests.retain(|guest| guest.target_habitat != id);
                ActionResult::ok(format!("Habitat #{id} removed"))
            }
        }
    }

    fn adopt(&mut self, habitat_id: u32, species_name: &str) -> ActionResult {
        let Some(species) = Species::parse(species_name) else {
            return ActionResult::error("Unknown species");
        };
        let Some(index) = self
            .habitats
            .iter()
            .position(|habitat| habitat.id == habitat_id)
        else {
            return ActionResult::error("Select a habitat first");
        };

        let habitat = &self.habitats[index];
        if habitat.animals >= habitat.capacity() {
            return ActionResult::error("That habitat is at its MVP capacity");
        }
        if habitat.species.is_some_and(|current| current != species) {
            return ActionResult::error("The MVP keeps one species per habitat");
        }

        if let Err(message) = self.spend(species.purchase_cost()) {
            return ActionResult::error(message);
        }
        let habitat = &mut self.habitats[index];
        habitat.species = Some(species);
        habitat.animals += 1;
        self.recalculate_rating();
        ActionResult::ok(format!(
            "{} adopted into habitat #{habitat_id}",
            species.label()
        ))
    }

    fn tick(&mut self, minutes: u32) {
        for _ in 0..minutes {
            self.minute_of_day += 1;
            if self.minute_of_day >= 24 * 60 {
                self.minute_of_day = 0;
                self.day += 1;
                self.income_today_cents = 0;
                self.expenses_today_cents = 0;
            }

            self.spawn_accumulator += 1;
            self.upkeep_accumulator += 1;
            self.movement_accumulator += 1;

            if self.spawn_accumulator >= 24 {
                self.spawn_accumulator = 0;
                self.try_spawn_guest();
            }
            if self.upkeep_accumulator >= 60 {
                self.upkeep_accumulator = 0;
                self.charge_upkeep();
            }

            self.advance_animal_welfare();
            self.advance_guest_needs();

            if self.movement_accumulator >= 3 {
                self.movement_accumulator = 0;
                self.advance_guest_movement();
            }

            self.advance_viewing();
            self.recalculate_rating();
        }
    }

    fn advance_animal_welfare(&mut self) {
        for habitat in &mut self.habitats {
            if habitat.animals == 0 {
                continue;
            }
            let target = habitat.welfare_target();
            if habitat.welfare < target {
                habitat.welfare = habitat.welfare.saturating_add(1).min(target);
            } else if habitat.welfare > target {
                habitat.welfare = habitat.welfare.saturating_sub(1).max(target);
            }
        }
    }

    fn try_spawn_guest(&mut self) {
        let candidates: Vec<(u32, Position)> = self
            .habitats
            .iter()
            .filter(|habitat| habitat.animals > 0)
            .filter_map(|habitat| self.viewing_tile(habitat).map(|tile| (habitat.id, tile)))
            .collect();
        if candidates.is_empty() {
            return;
        }

        let choice = (self.next_guest_id as usize) % candidates.len();
        let (target_habitat, target_tile) = candidates[choice];
        let start = Position {
            x: ENTRANCE_X,
            y: ENTRANCE_Y,
        };
        let Some(route) = self.path_between(start, target_tile) else {
            return;
        };

        self.cash_cents += ADMISSION_PRICE;
        self.income_today_cents += ADMISSION_PRICE;
        self.guests.push(Guest {
            id: self.next_guest_id,
            x: start.x,
            y: start.y,
            happiness: 78,
            energy: 90,
            hunger: 10,
            thirst: 8,
            value_perception: 68,
            minutes_in_park: 0,
            target_habitat,
            state: GuestState::WalkingToHabitat,
            route,
            route_index: 0,
            viewing_minutes: 0,
        });
        self.next_guest_id += 1;
    }

    fn advance_guest_needs(&mut self) {
        for guest in &mut self.guests {
            guest.minutes_in_park += 1;
            if guest.minutes_in_park % 4 == 0 {
                guest.energy = guest.energy.saturating_sub(1);
            }
            if guest.minutes_in_park % 3 == 0 {
                guest.hunger = guest.hunger.saturating_add(1).min(100);
            }
            if guest.minutes_in_park % 2 == 0 {
                guest.thirst = guest.thirst.saturating_add(1).min(100);
            }
            if guest.minutes_in_park % 10 == 0 {
                guest.value_perception = guest.value_perception.saturating_sub(1);
            }
            if guest.minutes_in_park % 5 == 0
                && (guest.hunger >= 60 || guest.thirst >= 60 || guest.energy <= 35)
            {
                guest.happiness = guest.happiness.saturating_sub(1);
            }
        }
    }

    fn habitat_experience_bonus(&self, habitat_id: u32) -> u32 {
        self.habitats
            .iter()
            .find(|habitat| habitat.id == habitat_id)
            .map_or(0, |habitat| {
                4 + habitat.welfare / 20 + habitat.appeal().min(240) / 30
            })
    }

    fn advance_guest_movement(&mut self) {
        let mut leave_ids = Vec::new();

        for index in 0..self.guests.len() {
            let state = self.guests[index].state.clone();
            if matches!(state, GuestState::Viewing) {
                continue;
            }

            let next_index = self.guests[index].route_index + 1;
            if next_index < self.guests[index].route.len() {
                let position = self.guests[index].route[next_index];
                self.guests[index].route_index = next_index;
                self.guests[index].x = position.x;
                self.guests[index].y = position.y;
                continue;
            }

            match state {
                GuestState::WalkingToHabitat => {
                    let target_habitat = self.guests[index].target_habitat;
                    let experience_bonus = self.habitat_experience_bonus(target_habitat);
                    let guest = &mut self.guests[index];
                    guest.state = GuestState::Viewing;
                    guest.viewing_minutes = 24;
                    guest.happiness = guest.happiness.saturating_add(experience_bonus).min(100);
                    guest.value_perception = guest
                        .value_perception
                        .saturating_add(experience_bonus / 2)
                        .min(100);
                }
                GuestState::WalkingToExit => leave_ids.push(self.guests[index].id),
                GuestState::Viewing => {}
            }
        }

        if !leave_ids.is_empty() {
            self.guests.retain(|guest| !leave_ids.contains(&guest.id));
        }
    }

    fn advance_viewing(&mut self) {
        let mut returning = Vec::new();
        for (index, guest) in self.guests.iter_mut().enumerate() {
            if matches!(guest.state, GuestState::Viewing) {
                guest.viewing_minutes = guest.viewing_minutes.saturating_sub(1);
                if guest.viewing_minutes == 0 {
                    returning.push((
                        index,
                        Position {
                            x: guest.x,
                            y: guest.y,
                        },
                    ));
                }
            }
        }

        for (index, start) in returning {
            let exit = Position {
                x: ENTRANCE_X,
                y: ENTRANCE_Y,
            };
            if let Some(route) = self.path_between(start, exit) {
                let guest = &mut self.guests[index];
                guest.state = GuestState::WalkingToExit;
                guest.route = route;
                guest.route_index = 0;
            }
        }
    }

    fn charge_upkeep(&mut self) {
        let animal_count: i64 = self
            .habitats
            .iter()
            .map(|habitat| habitat.animals as i64)
            .sum();
        let upkeep = self.habitats.len() as i64 * 250 + animal_count * 125;
        self.cash_cents -= upkeep;
        self.expenses_today_cents += upkeep;
    }

    fn recalculate_rating(&mut self) {
        let appeal: u32 = self.habitats.iter().map(Habitat::appeal).sum();
        let welfare = if self.habitats.iter().any(|habitat| habitat.animals > 0) {
            let total: u32 = self
                .habitats
                .iter()
                .filter(|habitat| habitat.animals > 0)
                .map(|habitat| habitat.welfare)
                .sum();
            let count = self
                .habitats
                .iter()
                .filter(|habitat| habitat.animals > 0)
                .count() as u32;
            total / count.max(1)
        } else {
            50
        };
        let guest_happiness = if self.guests.is_empty() {
            60
        } else {
            self.guests.iter().map(|guest| guest.happiness).sum::<u32>() / self.guests.len() as u32
        };
        self.rating = (250 + appeal / 3 + welfare * 2 + guest_happiness).clamp(0, 999);
    }

    fn neighbors(&self, position: Position) -> Vec<Position> {
        let mut neighbors = Vec::with_capacity(4);
        if position.x > 0 {
            neighbors.push(Position {
                x: position.x - 1,
                y: position.y,
            });
        }
        if position.x + 1 < self.width {
            neighbors.push(Position {
                x: position.x + 1,
                y: position.y,
            });
        }
        if position.y > 0 {
            neighbors.push(Position {
                x: position.x,
                y: position.y - 1,
            });
        }
        if position.y + 1 < self.height {
            neighbors.push(Position {
                x: position.x,
                y: position.y + 1,
            });
        }
        neighbors
    }

    fn is_walkable(&self, position: Position) -> bool {
        matches!(
            self.tile(position.x, position.y),
            Some(TileKind::Path | TileKind::Entrance)
        )
    }

    fn viewing_tile(&self, habitat: &Habitat) -> Option<Position> {
        for y in habitat.y..habitat.y + habitat.height {
            for x in habitat.x..habitat.x + habitat.width {
                for neighbor in self.neighbors(Position { x, y }) {
                    if self.is_walkable(neighbor) {
                        return Some(neighbor);
                    }
                }
            }
        }
        None
    }

    fn path_between(&self, start: Position, goal: Position) -> Option<Vec<Position>> {
        if !self.is_walkable(start) || !self.is_walkable(goal) {
            return None;
        }

        let mut queue = VecDeque::from([start]);
        let mut previous: HashMap<(u32, u32), Option<Position>> =
            HashMap::from([((start.x, start.y), None)]);

        while let Some(current) = queue.pop_front() {
            if current == goal {
                let mut route = vec![current];
                let mut cursor = current;
                while let Some(Some(parent)) = previous.get(&(cursor.x, cursor.y)) {
                    route.push(*parent);
                    cursor = *parent;
                }
                route.reverse();
                return Some(route);
            }

            for next in self.neighbors(current) {
                if !self.is_walkable(next) || previous.contains_key(&(next.x, next.y)) {
                    continue;
                }
                previous.insert((next.x, next.y), Some(current));
                queue.push_back(next);
            }
        }
        None
    }

    fn complaint_summary(&self) -> ComplaintSummary {
        ComplaintSummary {
            hungry: self
                .guests
                .iter()
                .filter(|guest| guest.hunger >= 60)
                .count() as u32,
            thirsty: self
                .guests
                .iter()
                .filter(|guest| guest.thirst >= 60)
                .count() as u32,
            tired: self
                .guests
                .iter()
                .filter(|guest| guest.energy <= 35)
                .count() as u32,
            poor_value: self
                .guests
                .iter()
                .filter(|guest| guest.value_perception <= 40)
                .count() as u32,
        }
    }

    fn snapshot(&self) -> Snapshot {
        let mut tiles = Vec::with_capacity(self.tiles.len());
        for y in 0..self.height {
            for x in 0..self.width {
                let kind = match self.tile(x, y).unwrap_or(TileKind::Grass) {
                    TileKind::Grass => "grass",
                    TileKind::Path => "path",
                    TileKind::Entrance => "entrance",
                    TileKind::Habitat(_) => "habitat",
                };
                let habitat_id = match self.tile(x, y) {
                    Some(TileKind::Habitat(id)) => Some(id),
                    _ => None,
                };
                tiles.push(TileView {
                    x,
                    y,
                    kind: kind.to_owned(),
                    habitat_id,
                });
            }
        }

        let habitats = self
            .habitats
            .iter()
            .map(|habitat| HabitatView {
                id: habitat.id,
                x: habitat.x,
                y: habitat.y,
                width: habitat.width,
                height: habitat.height,
                orientation: habitat.orientation,
                species: habitat.species.map(|species| match species {
                    Species::Capybara => "capybara".to_owned(),
                    Species::Flamingo => "flamingo".to_owned(),
                }),
                animals: habitat.animals,
                capacity: habitat.capacity(),
                welfare: habitat.welfare,
                welfare_target: habitat.welfare_target(),
                social_score: habitat.social_score(),
                space_score: habitat.space_score(),
                welfare_status: habitat.welfare_status(),
                appeal: habitat.appeal(),
            })
            .collect();

        let guests = self
            .guests
            .iter()
            .map(|guest| GuestView {
                id: guest.id,
                x: guest.x,
                y: guest.y,
                happiness: guest.happiness,
                energy: guest.energy,
                hunger: guest.hunger,
                thirst: guest.thirst,
                value_perception: guest.value_perception,
                target_habitat: guest.target_habitat,
                state: guest.state.clone(),
                thought: guest.thought().to_owned(),
            })
            .collect();

        Snapshot {
            width: self.width,
            height: self.height,
            day: self.day,
            minute_of_day: self.minute_of_day,
            cash_cents: self.cash_cents,
            rating: self.rating,
            guest_count: self.guests.len() as u32,
            tiles,
            habitats,
            guests,
            complaints: self.complaint_summary(),
            finance: FinanceView {
                income_today_cents: self.income_today_cents,
                expenses_today_cents: self.expenses_today_cents,
                profit_today_cents: self.income_today_cents - self.expenses_today_cents,
                admission_price_cents: ADMISSION_PRICE,
            },
        }
    }
}

#[derive(Serialize)]
struct TileView {
    x: u32,
    y: u32,
    kind: String,
    habitat_id: Option<u32>,
}

#[derive(Serialize)]
struct HabitatView {
    id: u32,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    orientation: HabitatOrientation,
    species: Option<String>,
    animals: u32,
    capacity: u32,
    welfare: u32,
    welfare_target: u32,
    social_score: u32,
    space_score: u32,
    welfare_status: String,
    appeal: u32,
}

#[derive(Serialize)]
struct GuestView {
    id: u32,
    x: u32,
    y: u32,
    happiness: u32,
    energy: u32,
    hunger: u32,
    thirst: u32,
    value_perception: u32,
    target_habitat: u32,
    state: GuestState,
    thought: String,
}

#[derive(Serialize)]
struct ComplaintSummary {
    hungry: u32,
    thirsty: u32,
    tired: u32,
    poor_value: u32,
}

#[derive(Serialize)]
struct FinanceView {
    income_today_cents: i64,
    expenses_today_cents: i64,
    profit_today_cents: i64,
    admission_price_cents: i64,
}

#[derive(Serialize)]
struct Snapshot {
    width: u32,
    height: u32,
    day: u32,
    minute_of_day: u32,
    cash_cents: i64,
    rating: u32,
    guest_count: u32,
    tiles: Vec<TileView>,
    habitats: Vec<HabitatView>,
    guests: Vec<GuestView>,
    complaints: ComplaintSummary,
    finance: FinanceView,
}

#[derive(Serialize)]
struct ActionResult {
    ok: bool,
    message: String,
}

impl ActionResult {
    fn ok(message: impl Into<String>) -> Self {
        Self {
            ok: true,
            message: message.into(),
        }
    }

    fn error(message: impl Into<String>) -> Self {
        Self {
            ok: false,
            message: message.into(),
        }
    }

    fn json(self) -> String {
        serde_json::to_string(&self).expect("action result serialization is infallible")
    }
}

#[wasm_bindgen]
pub struct ZooGame {
    state: GameState,
}

#[wasm_bindgen]
impl ZooGame {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            state: GameState::default(),
        }
    }

    pub fn reset(&mut self) {
        self.state = GameState::default();
    }

    pub fn snapshot_json(&self) -> String {
        serde_json::to_string(&self.state.snapshot()).expect("snapshot serialization is infallible")
    }

    pub fn place_path(&mut self, x: u32, y: u32) -> String {
        self.state.place_path(x, y).json()
    }

    pub fn evaluate_habitat(&self, x: u32, y: u32, orientation: u8) -> String {
        serde_json::to_string(&self.state.evaluate_habitat(
            x,
            y,
            HabitatOrientation::from_code(orientation),
        ))
        .expect("placement evaluation serialization is infallible")
    }

    pub fn place_habitat(&mut self, x: u32, y: u32, orientation: u8) -> String {
        self.state
            .place_habitat(x, y, HabitatOrientation::from_code(orientation))
            .json()
    }

    pub fn bulldoze(&mut self, x: u32, y: u32) -> String {
        self.state.bulldoze(x, y).json()
    }

    pub fn adopt(&mut self, habitat_id: u32, species: String) -> String {
        self.state.adopt(habitat_id, &species).json()
    }

    pub fn tick(&mut self, minutes: u32) {
        self.state.tick(minutes.min(240));
    }
}

impl Default for ZooGame {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_placement_is_idempotent_and_charges_once() {
        let mut state = GameState::default();
        let before = state.cash_cents;

        assert!(state.place_path(5, ENTRANCE_Y).ok);
        assert_eq!(state.cash_cents, before - PATH_COST);

        assert!(state.place_path(5, ENTRANCE_Y).ok);
        assert_eq!(state.cash_cents, before - PATH_COST);
    }

    #[test]
    fn habitat_evaluation_and_placement_share_rules() {
        let mut state = GameState::default();
        let orientation = HabitatOrientation::Horizontal;

        let disconnected = state.evaluate_habitat(10, 1, orientation);
        assert!(!disconnected.ok);
        assert_eq!(
            disconnected.message,
            "Habitats need at least one path along their edge"
        );

        let valid = state.evaluate_habitat(3, 8, orientation);
        assert!(valid.ok);
        assert_eq!(valid.width, 4);
        assert_eq!(valid.height, 3);
        assert_eq!(valid.occupied_tiles.len(), 12);
        assert!(state.place_habitat(3, 8, orientation).ok);

        let overlap = state.evaluate_habitat(3, 8, orientation);
        assert!(!overlap.ok);
        assert_eq!(overlap.message, "The habitat footprint must be clear grass");
    }

    #[test]
    fn habitat_rotation_changes_footprint() {
        let state = GameState::default();
        let horizontal = state.evaluate_habitat(3, 8, HabitatOrientation::Horizontal);
        let vertical = state.evaluate_habitat(3, 8, HabitatOrientation::Vertical);

        assert!(horizontal.ok);
        assert!(vertical.ok);
        assert_eq!((horizontal.width, horizontal.height), (4, 3));
        assert_eq!((vertical.width, vertical.height), (3, 4));
        assert_eq!(
            horizontal.occupied_tiles.last(),
            Some(&Position { x: 6, y: 10 })
        );
        assert_eq!(
            vertical.occupied_tiles.last(),
            Some(&Position { x: 5, y: 11 })
        );
    }

    #[test]
    fn habitat_evaluation_reports_bounds_and_cash() {
        let mut state = GameState::default();
        let out_of_bounds = state.evaluate_habitat(18, 12, HabitatOrientation::Horizontal);
        assert!(!out_of_bounds.ok);
        assert_eq!(
            out_of_bounds.message,
            "The habitat would extend outside the park"
        );

        state.cash_cents = HABITAT_COST - 1;
        let unaffordable = state.evaluate_habitat(3, 8, HabitatOrientation::Vertical);
        assert!(!unaffordable.ok);
        assert_eq!(unaffordable.message, "Not enough cash");
    }

    #[test]
    fn species_have_distinct_social_welfare_requirements() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 4, HabitatOrientation::Horizontal).ok);
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let capybara_habitat = state.habitats[0].id;
        let flamingo_habitat = state.habitats[1].id;

        assert!(state.adopt(capybara_habitat, "capybara").ok);
        assert!(state.adopt(flamingo_habitat, "flamingo").ok);

        let capybara = state
            .habitats
            .iter()
            .find(|habitat| habitat.id == capybara_habitat)
            .expect("capybara habitat exists");
        let flamingo = state
            .habitats
            .iter()
            .find(|habitat| habitat.id == flamingo_habitat)
            .expect("flamingo habitat exists");
        assert_eq!(capybara.social_score(), 50);
        assert_eq!(flamingo.social_score(), 33);
        assert!(capybara.welfare_target() > flamingo.welfare_target());
    }

    #[test]
    fn grouping_improves_social_welfare_until_space_becomes_a_tradeoff() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;

        assert!(state.adopt(habitat_id, "capybara").ok);
        assert_eq!(state.habitats[0].social_score(), 50);
        assert_eq!(state.habitats[0].space_score(), 100);

        assert!(state.adopt(habitat_id, "capybara").ok);
        assert_eq!(state.habitats[0].social_score(), 100);
        assert_eq!(state.habitats[0].space_score(), 100);

        assert!(state.adopt(habitat_id, "capybara").ok);
        assert!(state.adopt(habitat_id, "capybara").ok);
        assert_eq!(state.habitats[0].social_score(), 100);
        assert_eq!(state.habitats[0].space_score(), 75);
        assert_eq!(state.habitats[0].welfare_target(), 90);
    }

    #[test]
    fn welfare_converges_gradually_toward_species_target() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;
        assert!(state.adopt(habitat_id, "flamingo").ok);

        let target = state.habitats[0].welfare_target();
        assert_eq!(state.habitats[0].welfare, 100);
        assert!(target < 100);

        state.tick(1);
        assert_eq!(state.habitats[0].welfare, 99);
        assert!(state.habitats[0].welfare > target);

        state.tick(60);
        assert_eq!(state.habitats[0].welfare, target);
    }

    #[test]
    fn animal_adoption_drives_appeal_and_guest_revenue() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;
        assert!(state.adopt(habitat_id, "capybara").ok);

        let cash_after_building = state.cash_cents;
        state.tick(24);

        assert_eq!(state.guests.len(), 1);
        assert_eq!(state.cash_cents, cash_after_building + ADMISSION_PRICE);
        assert!(state.rating > 400);
    }

    #[test]
    fn upkeep_is_deterministic() {
        let mut first = GameState::default();
        let mut second = GameState::default();

        assert!(first.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        assert!(
            second
                .place_habitat(3, 8, HabitatOrientation::Horizontal)
                .ok
        );
        let first_id = first.habitats[0].id;
        let second_id = second.habitats[0].id;
        assert!(first.adopt(first_id, "flamingo").ok);
        assert!(second.adopt(second_id, "flamingo").ok);

        first.tick(180);
        second.tick(180);

        assert_eq!(first.cash_cents, second.cash_cents);
        assert_eq!(first.rating, second.rating);
        assert_eq!(first.guests.len(), second.guests.len());
        assert_eq!(first.habitats[0].welfare, second.habitats[0].welfare);
    }

    #[test]
    fn guest_needs_decay_deterministically() {
        let mut first = GameState::default();
        let mut second = GameState::default();
        assert!(first.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        assert!(
            second
                .place_habitat(3, 8, HabitatOrientation::Horizontal)
                .ok
        );
        let first_id = first.habitats[0].id;
        let second_id = second.habitats[0].id;
        assert!(first.adopt(first_id, "capybara").ok);
        assert!(second.adopt(second_id, "capybara").ok);

        first.tick(30);
        second.tick(30);

        let first_guest = &first.guests[0];
        let second_guest = &second.guests[0];
        assert_eq!(
            (
                first_guest.happiness,
                first_guest.energy,
                first_guest.hunger,
                first_guest.thirst,
                first_guest.value_perception,
            ),
            (
                second_guest.happiness,
                second_guest.energy,
                second_guest.hunger,
                second_guest.thirst,
                second_guest.value_perception,
            )
        );
        assert!(first_guest.energy < 90);
        assert!(first_guest.hunger > 10);
        assert!(first_guest.thirst > 8);
    }

    #[test]
    fn healthy_habitat_viewing_improves_guest_experience() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;
        assert!(state.adopt(habitat_id, "capybara").ok);

        state.tick(24);
        assert_eq!(state.guests[0].happiness, 78);
        assert_eq!(state.guests[0].value_perception, 68);

        state.tick(9);
        let guest = &state.guests[0];
        assert!(matches!(guest.state, GuestState::Viewing));
        assert!(guest.happiness > 78);
        assert!(guest.value_perception > 68);
        assert_eq!(guest.thought(), "The animals are wonderful.");
    }

    #[test]
    fn unreachable_habitat_does_not_charge_admission_or_spawn_guest() {
        let mut state = GameState::default();
        assert!(state.place_path(10, 7).ok);
        assert!(
            state
                .place_habitat(10, 8, HabitatOrientation::Horizontal)
                .ok
        );
        let habitat_id = state.habitats[0].id;
        assert!(state.adopt(habitat_id, "flamingo").ok);
        let cash_before_tick = state.cash_cents;

        state.tick(24);

        assert!(state.guests.is_empty());
        assert_eq!(state.cash_cents, cash_before_tick);
    }
}
