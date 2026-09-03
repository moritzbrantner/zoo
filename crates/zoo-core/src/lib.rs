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
    target_habitat: u32,
    state: GuestState,
    route: Vec<Position>,
    route_index: usize,
    viewing_minutes: u32,
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

    fn can_place_habitat(&self, x: u32, y: u32) -> Result<(), &'static str> {
        if x + HABITAT_WIDTH > self.width || y + HABITAT_HEIGHT > self.height {
            return Err("The habitat would extend outside the park");
        }

        for tile_y in y..y + HABITAT_HEIGHT {
            for tile_x in x..x + HABITAT_WIDTH {
                if self.tile(tile_x, tile_y) != Some(TileKind::Grass) {
                    return Err("The habitat footprint must be clear grass");
                }
            }
        }

        let mut touches_path = false;
        for tile_y in y..y + HABITAT_HEIGHT {
            for tile_x in x..x + HABITAT_WIDTH {
                for neighbor in self.neighbors(Position {
                    x: tile_x,
                    y: tile_y,
                }) {
                    if matches!(
                        self.tile(neighbor.x, neighbor.y),
                        Some(TileKind::Path | TileKind::Entrance)
                    ) {
                        touches_path = true;
                    }
                }
            }
        }

        if !touches_path {
            return Err("Habitats need at least one path along their edge");
        }
        Ok(())
    }

    fn place_habitat(&mut self, x: u32, y: u32) -> ActionResult {
        if let Some(existing) = self
            .habitats
            .iter()
            .find(|habitat| habitat.x == x && habitat.y == y)
        {
            return ActionResult::ok(format!("Habitat #{} already exists here", existing.id));
        }

        if let Err(message) = self.can_place_habitat(x, y) {
            return ActionResult::error(message);
        }
        if let Err(message) = self.spend(HABITAT_COST) {
            return ActionResult::error(message);
        }

        let id = self.next_habitat_id;
        self.next_habitat_id += 1;
        for tile_y in y..y + HABITAT_HEIGHT {
            for tile_x in x..x + HABITAT_WIDTH {
                self.set_tile(tile_x, tile_y, TileKind::Habitat(id));
            }
        }
        self.habitats.push(Habitat {
            id,
            x,
            y,
            width: HABITAT_WIDTH,
            height: HABITAT_HEIGHT,
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
        habitat.welfare = 96_u32.saturating_sub(habitat.animals.saturating_sub(2) * 4);
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
            if self.movement_accumulator >= 3 {
                self.movement_accumulator = 0;
                self.advance_guest_movement();
            }

            self.advance_viewing();
            self.recalculate_rating();
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
            target_habitat,
            state: GuestState::WalkingToHabitat,
            route,
            route_index: 0,
            viewing_minutes: 0,
        });
        self.next_guest_id += 1;
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
                    self.guests[index].state = GuestState::Viewing;
                    self.guests[index].viewing_minutes = 24;
                    self.guests[index].happiness = 92;
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
                species: habitat.species.map(|species| match species {
                    Species::Capybara => "capybara".to_owned(),
                    Species::Flamingo => "flamingo".to_owned(),
                }),
                animals: habitat.animals,
                capacity: habitat.capacity(),
                welfare: habitat.welfare,
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
                target_habitat: guest.target_habitat,
                state: guest.state.clone(),
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
    species: Option<String>,
    animals: u32,
    capacity: u32,
    welfare: u32,
    appeal: u32,
}

#[derive(Serialize)]
struct GuestView {
    id: u32,
    x: u32,
    y: u32,
    happiness: u32,
    target_habitat: u32,
    state: GuestState,
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

    pub fn place_habitat(&mut self, x: u32, y: u32) -> String {
        self.state.place_habitat(x, y).json()
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
    fn habitat_needs_a_path_and_clear_footprint() {
        let mut state = GameState::default();

        assert!(!state.place_habitat(10, 1).ok);
        assert!(state.place_habitat(3, 8).ok);
        assert_eq!(state.habitats.len(), 1);
    }

    #[test]
    fn animal_adoption_drives_appeal_and_guest_revenue() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8).ok);
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

        assert!(first.place_habitat(3, 8).ok);
        assert!(second.place_habitat(3, 8).ok);
        let first_id = first.habitats[0].id;
        let second_id = second.habitats[0].id;
        assert!(first.adopt(first_id, "flamingo").ok);
        assert!(second.adopt(second_id, "flamingo").ok);

        first.tick(180);
        second.tick(180);

        assert_eq!(first.cash_cents, second.cash_cents);
        assert_eq!(first.rating, second.rating);
        assert_eq!(first.guests.len(), second.guests.len());
    }
}
