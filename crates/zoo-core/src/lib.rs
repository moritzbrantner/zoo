use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use wasm_bindgen::prelude::*;

const WIDTH: u32 = 20;
const HEIGHT: u32 = 14;
const ENTRANCE_X: u32 = 0;
const ENTRANCE_Y: u32 = 7;
const PATH_COST: i64 = 1_000;
const LEGACY_HABITAT_WIDTH: u32 = 4;
const LEGACY_HABITAT_HEIGHT: u32 = 3;
const HABITAT_BASE_COST: i64 = 10_000;
const HABITAT_TILE_COST: i64 = 3_000;
const FENCE_SEGMENT_COST: i64 = 1_500;
const MIN_HABITAT_DIMENSION: u32 = 3;
const MAX_HABITAT_AREA: u64 = 100;
const ADMISSION_PRICE: i64 = 1_200;
const FOOD_RESTOCK_COST: i64 = 1_500;
const WATER_REFILL_COST: i64 = 800;
const CLEAN_HABITAT_COST: i64 = 2_000;
const SHELTER_COST: i64 = 12_000;
const CARE_DECAY_INTERVAL_MINUTES: u32 = 15;

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
            Self::Horizontal => (LEGACY_HABITAT_WIDTH, LEGACY_HABITAT_HEIGHT),
            Self::Vertical => (LEGACY_HABITAT_HEIGHT, LEGACY_HABITAT_WIDTH),
        }
    }

    fn for_dimensions(width: u32, height: u32) -> Self {
        if height > width {
            Self::Vertical
        } else {
            Self::Horizontal
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum FenceSide {
    North,
    East,
    South,
    West,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
struct FenceSegment {
    x: u32,
    y: u32,
    side: FenceSide,
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
    Zebra,
    Giraffe,
    Elephant,
    Penguin,
}

const ALL_SPECIES: [Species; 6] = [
    Species::Capybara,
    Species::Flamingo,
    Species::Zebra,
    Species::Giraffe,
    Species::Elephant,
    Species::Penguin,
];

impl Species {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "capybara" => Some(Self::Capybara),
            "flamingo" => Some(Self::Flamingo),
            "zebra" => Some(Self::Zebra),
            "giraffe" => Some(Self::Giraffe),
            "elephant" => Some(Self::Elephant),
            "penguin" => Some(Self::Penguin),
            _ => None,
        }
    }

    fn key(self) -> &'static str {
        match self {
            Self::Capybara => "capybara",
            Self::Flamingo => "flamingo",
            Self::Zebra => "zebra",
            Self::Giraffe => "giraffe",
            Self::Elephant => "elephant",
            Self::Penguin => "penguin",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Capybara => "Capybara",
            Self::Flamingo => "Flamingo",
            Self::Zebra => "Zebra",
            Self::Giraffe => "Giraffe",
            Self::Elephant => "Elephant",
            Self::Penguin => "Penguin",
        }
    }

    fn purchase_cost(self) -> i64 {
        match self {
            Self::Capybara => 25_000,
            Self::Flamingo => 18_000,
            Self::Zebra => 40_000,
            Self::Giraffe => 65_000,
            Self::Elephant => 90_000,
            Self::Penguin => 30_000,
        }
    }

    fn appeal(self) -> u32 {
        match self {
            Self::Capybara => 95,
            Self::Flamingo => 80,
            Self::Zebra => 125,
            Self::Giraffe => 160,
            Self::Elephant => 190,
            Self::Penguin => 110,
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
            Self::Zebra => WelfareProfile {
                minimum_social_group: 3,
                space_per_animal: 5,
            },
            Self::Giraffe => WelfareProfile {
                minimum_social_group: 2,
                space_per_animal: 8,
            },
            Self::Elephant => WelfareProfile {
                minimum_social_group: 2,
                space_per_animal: 12,
            },
            Self::Penguin => WelfareProfile {
                minimum_social_group: 4,
                space_per_animal: 3,
            },
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
    food: u32,
    water: u32,
    cleanliness: u32,
    has_shelter: bool,
}

impl Habitat {
    fn area(&self) -> u32 {
        self.width.saturating_mul(self.height)
    }

    fn capacity(&self) -> u32 {
        (self.area() / 3).clamp(2, 12)
    }

    fn fence_length(&self) -> u32 {
        self.width.saturating_add(self.height).saturating_mul(2)
    }

    fn fence_segments(&self) -> Vec<FenceSegment> {
        fence_segments(self.x, self.y, self.width, self.height)
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

        let available_space = self.area();
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

    fn food_score(&self) -> u32 {
        if self.animals == 0 { 100 } else { self.food }
    }

    fn water_score(&self) -> u32 {
        if self.animals == 0 { 100 } else { self.water }
    }

    fn cleanliness_score(&self) -> u32 {
        if self.animals == 0 {
            100
        } else {
            self.cleanliness
        }
    }

    fn shelter_score(&self) -> u32 {
        if self.animals == 0 || self.has_shelter {
            100
        } else {
            40
        }
    }

    fn welfare_target(&self) -> u32 {
        let social = self.social_score();
        let space = self.space_score();
        let food = self.food_score();
        let water = self.water_score();
        let cleanliness = self.cleanliness_score();
        let shelter = self.shelter_score();
        (social.saturating_mul(2) + space.saturating_mul(2) + food + water + cleanliness + shelter)
            / 8
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
            (false, false) => self.care_status(),
        }
    }

    fn care_status(&self) -> String {
        if self.animals == 0 {
            return "Care supplies are ready".to_owned();
        }
        if self.food < 40 {
            return "Food is running low".to_owned();
        }
        if self.water < 40 {
            return "Water is running low".to_owned();
        }
        if self.cleanliness < 50 {
            return "Habitat needs cleaning".to_owned();
        }
        if !self.has_shelter {
            return "Animals need basic shelter".to_owned();
        }
        "Food, water, shelter, and cleanliness are healthy".to_owned()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum GuestState {
    Arriving,
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
    arrival_steps: u8,
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
                GuestState::Arriving => "I'm entering the zoo.",
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
    fence_segments: Vec<FenceSegment>,
}

impl PlacementEvaluation {
    fn valid(
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        occupied_tiles: Vec<Position>,
        fence_segments: Vec<FenceSegment>,
    ) -> Self {
        Self {
            ok: true,
            message: "Fence loop can be built here".to_owned(),
            x,
            y,
            width,
            height,
            orientation: HabitatOrientation::for_dimensions(width, height),
            cost_cents: habitat_cost(width, height),
            occupied_tiles,
            fence_segments,
        }
    }

    fn invalid(message: impl Into<String>, x: u32, y: u32, width: u32, height: u32) -> Self {
        Self {
            ok: false,
            message: message.into(),
            x,
            y,
            width,
            height,
            orientation: HabitatOrientation::for_dimensions(width, height),
            cost_cents: habitat_cost(width, height),
            occupied_tiles: Vec::new(),
            fence_segments: Vec::new(),
        }
    }
}

fn habitat_cost(width: u32, height: u32) -> i64 {
    let area = i64::from(width).saturating_mul(i64::from(height));
    let perimeter = i64::from(width.saturating_add(height).saturating_mul(2));
    HABITAT_BASE_COST
        .saturating_add(area.saturating_mul(HABITAT_TILE_COST))
        .saturating_add(perimeter.saturating_mul(FENCE_SEGMENT_COST))
}

fn normalized_rect(ax: u32, ay: u32, bx: u32, by: u32) -> (u32, u32, u32, u32) {
    let x = ax.min(bx);
    let y = ay.min(by);
    let width = ax.abs_diff(bx).saturating_add(1);
    let height = ay.abs_diff(by).saturating_add(1);
    (x, y, width, height)
}

fn fence_segments(x: u32, y: u32, width: u32, height: u32) -> Vec<FenceSegment> {
    let mut segments = Vec::with_capacity(
        usize::try_from(width.saturating_add(height).saturating_mul(2)).unwrap_or(0),
    );
    let right = x + width - 1;
    let bottom = y + height - 1;

    for tile_x in x..=right {
        segments.push(FenceSegment {
            x: tile_x,
            y,
            side: FenceSide::North,
        });
        segments.push(FenceSegment {
            x: tile_x,
            y: bottom,
            side: FenceSide::South,
        });
    }
    for tile_y in y..=bottom {
        segments.push(FenceSegment {
            x,
            y: tile_y,
            side: FenceSide::West,
        });
        segments.push(FenceSegment {
            x: right,
            y: tile_y,
            side: FenceSide::East,
        });
    }
    segments
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

    fn evaluate_habitat_rect(&self, ax: u32, ay: u32, bx: u32, by: u32) -> PlacementEvaluation {
        let (x, y, width, height) = normalized_rect(ax, ay, bx, by);
        if width < MIN_HABITAT_DIMENSION || height < MIN_HABITAT_DIMENSION {
            return PlacementEvaluation::invalid(
                format!(
                    "Draw at least a {MIN_HABITAT_DIMENSION}×{MIN_HABITAT_DIMENSION} fence loop"
                ),
                x,
                y,
                width,
                height,
            );
        }

        let area = u64::from(width).saturating_mul(u64::from(height));
        if area > MAX_HABITAT_AREA {
            return PlacementEvaluation::invalid(
                format!(
                    "This fence encloses {area} tiles; the current limit is {MAX_HABITAT_AREA}"
                ),
                x,
                y,
                width,
                height,
            );
        }

        let in_bounds = x
            .checked_add(width)
            .is_some_and(|right| right <= self.width)
            && y.checked_add(height)
                .is_some_and(|bottom| bottom <= self.height);
        if !in_bounds {
            return PlacementEvaluation::invalid(
                "The fence would extend outside the park",
                x,
                y,
                width,
                height,
            );
        }

        let mut occupied_tiles = Vec::with_capacity((width * height) as usize);
        for tile_y in y..y + height {
            for tile_x in x..x + width {
                occupied_tiles.push(Position {
                    x: tile_x,
                    y: tile_y,
                });
            }
        }

        if occupied_tiles
            .iter()
            .any(|tile| self.tile(tile.x, tile.y) != Some(TileKind::Grass))
        {
            return PlacementEvaluation::invalid(
                "The enclosed area must be clear grass",
                x,
                y,
                width,
                height,
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
                "The fence needs at least one path along its outside edge",
                x,
                y,
                width,
                height,
            );
        }

        let cost = habitat_cost(width, height);
        if self.cash_cents < cost {
            return PlacementEvaluation::invalid("Not enough cash", x, y, width, height);
        }

        PlacementEvaluation::valid(
            x,
            y,
            width,
            height,
            occupied_tiles,
            fence_segments(x, y, width, height),
        )
    }

    fn evaluate_habitat(
        &self,
        x: u32,
        y: u32,
        orientation: HabitatOrientation,
    ) -> PlacementEvaluation {
        let (width, height) = orientation.dimensions();
        self.evaluate_habitat_rect(
            x,
            y,
            x.saturating_add(width - 1),
            y.saturating_add(height - 1),
        )
    }

    fn place_habitat_rect(&mut self, ax: u32, ay: u32, bx: u32, by: u32) -> ActionResult {
        let (x, y, width, height) = normalized_rect(ax, ay, bx, by);
        if let Some(existing) = self.habitats.iter().find(|habitat| {
            habitat.x == x && habitat.y == y && habitat.width == width && habitat.height == height
        }) {
            return ActionResult::ok(format!("Habitat #{} already uses this fence", existing.id));
        }

        let evaluation = self.evaluate_habitat_rect(ax, ay, bx, by);
        if !evaluation.ok {
            return ActionResult::error(evaluation.message);
        }
        if let Err(message) = self.spend(evaluation.cost_cents) {
            return ActionResult::error(message);
        }

        let id = self.next_habitat_id;
        self.next_habitat_id += 1;
        for tile in &evaluation.occupied_tiles {
            self.set_tile(tile.x, tile.y, TileKind::Habitat(id));
        }
        self.habitats.push(Habitat {
            id,
            x: evaluation.x,
            y: evaluation.y,
            width: evaluation.width,
            height: evaluation.height,
            orientation: evaluation.orientation,
            species: None,
            animals: 0,
            welfare: 100,
            food: 100,
            water: 100,
            cleanliness: 100,
            has_shelter: false,
        });

        ActionResult::ok(format!(
            "Habitat #{id} fenced · {}×{} · {} tiles",
            evaluation.width,
            evaluation.height,
            evaluation.width.saturating_mul(evaluation.height)
        ))
    }

    fn place_habitat(&mut self, x: u32, y: u32, orientation: HabitatOrientation) -> ActionResult {
        let (width, height) = orientation.dimensions();
        self.place_habitat_rect(
            x,
            y,
            x.saturating_add(width - 1),
            y.saturating_add(height - 1),
        )
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
            return ActionResult::error("That habitat is at capacity");
        }
        if habitat.species.is_some_and(|current| current != species) {
            return ActionResult::error("Each habitat currently keeps one species");
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

    fn feed_habitat(&mut self, habitat_id: u32) -> ActionResult {
        let Some(index) = self
            .habitats
            .iter()
            .position(|habitat| habitat.id == habitat_id)
        else {
            return ActionResult::error("Select a habitat first");
        };
        if self.habitats[index].food >= 100 {
            return ActionResult::ok("Food is already fully stocked");
        }
        if let Err(message) = self.spend(FOOD_RESTOCK_COST) {
            return ActionResult::error(message);
        }
        self.habitats[index].food = 100;
        ActionResult::ok(format!("Habitat #{habitat_id} food restocked"))
    }

    fn refill_water(&mut self, habitat_id: u32) -> ActionResult {
        let Some(index) = self
            .habitats
            .iter()
            .position(|habitat| habitat.id == habitat_id)
        else {
            return ActionResult::error("Select a habitat first");
        };
        if self.habitats[index].water >= 100 {
            return ActionResult::ok("Water is already full");
        }
        if let Err(message) = self.spend(WATER_REFILL_COST) {
            return ActionResult::error(message);
        }
        self.habitats[index].water = 100;
        ActionResult::ok(format!("Habitat #{habitat_id} water refilled"))
    }

    fn clean_habitat(&mut self, habitat_id: u32) -> ActionResult {
        let Some(index) = self
            .habitats
            .iter()
            .position(|habitat| habitat.id == habitat_id)
        else {
            return ActionResult::error("Select a habitat first");
        };
        if self.habitats[index].cleanliness >= 100 {
            return ActionResult::ok("Habitat is already clean");
        }
        if let Err(message) = self.spend(CLEAN_HABITAT_COST) {
            return ActionResult::error(message);
        }
        self.habitats[index].cleanliness = 100;
        ActionResult::ok(format!("Habitat #{habitat_id} cleaned"))
    }

    fn add_shelter(&mut self, habitat_id: u32) -> ActionResult {
        let Some(index) = self
            .habitats
            .iter()
            .position(|habitat| habitat.id == habitat_id)
        else {
            return ActionResult::error("Select a habitat first");
        };
        if self.habitats[index].has_shelter {
            return ActionResult::ok("Basic shelter is already installed");
        }
        if let Err(message) = self.spend(SHELTER_COST) {
            return ActionResult::error(message);
        }
        self.habitats[index].has_shelter = true;
        ActionResult::ok(format!("Basic shelter added to habitat #{habitat_id}"))
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
            if self
                .minute_of_day
                .is_multiple_of(CARE_DECAY_INTERVAL_MINUTES)
            {
                self.advance_habitat_care();
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

    fn advance_habitat_care(&mut self) {
        for habitat in &mut self.habitats {
            if habitat.animals == 0 {
                continue;
            }
            habitat.food = habitat.food.saturating_sub(habitat.animals);
            habitat.water = habitat.water.saturating_sub(habitat.animals);
            let waste = habitat.animals.saturating_add(1) / 2;
            habitat.cleanliness = habitat.cleanliness.saturating_sub(waste.max(1));
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
            state: GuestState::Arriving,
            route,
            route_index: 0,
            viewing_minutes: 0,
            arrival_steps: 2,
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
                4 + habitat.welfare / 20 + habitat.appeal().min(300) / 30
            })
    }

    fn advance_guest_movement(&mut self) {
        let mut leave_ids = Vec::new();

        for index in 0..self.guests.len() {
            let state = self.guests[index].state;
            if matches!(state, GuestState::Viewing) {
                continue;
            }
            if matches!(state, GuestState::Arriving) {
                if self.guests[index].arrival_steps > 0 {
                    self.guests[index].arrival_steps -= 1;
                } else {
                    self.guests[index].state = GuestState::WalkingToHabitat;
                }
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
                GuestState::Arriving | GuestState::Viewing => {}
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
            .map(|habitat| i64::from(habitat.animals))
            .sum();
        let fence_count: i64 = self
            .habitats
            .iter()
            .map(|habitat| i64::from(habitat.fence_length()))
            .sum();
        let upkeep = self.habitats.len() as i64 * 250 + animal_count * 125 + fence_count * 8;
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

    fn species_catalog(&self) -> Vec<SpeciesOfferView> {
        ALL_SPECIES
            .into_iter()
            .map(|species| {
                let profile = species.welfare_profile();
                SpeciesOfferView {
                    key: species.key().to_owned(),
                    label: species.label().to_owned(),
                    purchase_cost_cents: species.purchase_cost(),
                    appeal: species.appeal(),
                    minimum_social_group: profile.minimum_social_group,
                    space_per_animal: profile.space_per_animal,
                }
            })
            .collect()
    }

    fn animal_views(&self) -> Vec<AnimalView> {
        let mut animals = Vec::new();
        for habitat in &self.habitats {
            let Some(species) = habitat.species else {
                continue;
            };

            let inner_width = habitat.width.saturating_sub(2).max(1);
            let inner_height = habitat.height.saturating_sub(2).max(1);
            let inner_area = inner_width.saturating_mul(inner_height).max(1);
            let time_step = self.minute_of_day / 2;

            for slot in 0..habitat.animals {
                let index = time_step
                    .saturating_add(slot.saturating_mul(3))
                    .saturating_add(habitat.id.saturating_mul(5))
                    % inner_area;
                let local_x = index % inner_width;
                let local_y = index / inner_width;
                animals.push(AnimalView {
                    id: habitat.id.saturating_mul(100).saturating_add(slot + 1),
                    habitat_id: habitat.id,
                    species: species.key().to_owned(),
                    x: habitat.x.saturating_add(1).saturating_add(local_x),
                    y: habitat.y.saturating_add(1).saturating_add(local_y),
                    slot,
                    animation_phase: (slot
                        .saturating_mul(17)
                        .saturating_add(habitat.id.saturating_mul(7)))
                        % 100,
                });
            }
        }
        animals
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
                footprint_area: habitat.area(),
                fence_length: habitat.fence_length(),
                fence_segments: habitat.fence_segments(),
                species: habitat.species.map(|species| species.key().to_owned()),
                animals: habitat.animals,
                capacity: habitat.capacity(),
                welfare: habitat.welfare,
                welfare_target: habitat.welfare_target(),
                social_score: habitat.social_score(),
                space_score: habitat.space_score(),
                welfare_status: habitat.welfare_status(),
                food: habitat.food,
                water: habitat.water,
                cleanliness: habitat.cleanliness,
                has_shelter: habitat.has_shelter,
                care_status: habitat.care_status(),
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
                state: guest.state,
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
            entrance: EntranceView {
                x: ENTRANCE_X,
                y: ENTRANCE_Y,
                arrivals_total: self.next_guest_id.saturating_sub(1),
            },
            tiles,
            habitats,
            animals: self.animal_views(),
            guests,
            species_catalog: self.species_catalog(),
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
    footprint_area: u32,
    fence_length: u32,
    fence_segments: Vec<FenceSegment>,
    species: Option<String>,
    animals: u32,
    capacity: u32,
    welfare: u32,
    welfare_target: u32,
    social_score: u32,
    space_score: u32,
    welfare_status: String,
    food: u32,
    water: u32,
    cleanliness: u32,
    has_shelter: bool,
    care_status: String,
    appeal: u32,
}

#[derive(Serialize)]
struct AnimalView {
    id: u32,
    habitat_id: u32,
    species: String,
    x: u32,
    y: u32,
    slot: u32,
    animation_phase: u32,
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
struct EntranceView {
    x: u32,
    y: u32,
    arrivals_total: u32,
}

#[derive(Serialize)]
struct SpeciesOfferView {
    key: String,
    label: String,
    purchase_cost_cents: i64,
    appeal: u32,
    minimum_social_group: u32,
    space_per_animal: u32,
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
    entrance: EntranceView,
    tiles: Vec<TileView>,
    habitats: Vec<HabitatView>,
    animals: Vec<AnimalView>,
    guests: Vec<GuestView>,
    species_catalog: Vec<SpeciesOfferView>,
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

    pub fn evaluate_habitat_rect(&self, ax: u32, ay: u32, bx: u32, by: u32) -> String {
        serde_json::to_string(&self.state.evaluate_habitat_rect(ax, ay, bx, by))
            .expect("placement evaluation serialization is infallible")
    }

    pub fn place_habitat_rect(&mut self, ax: u32, ay: u32, bx: u32, by: u32) -> String {
        self.state.place_habitat_rect(ax, ay, bx, by).json()
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

    pub fn feed_habitat(&mut self, habitat_id: u32) -> String {
        self.state.feed_habitat(habitat_id).json()
    }

    pub fn refill_water(&mut self, habitat_id: u32) -> String {
        self.state.refill_water(habitat_id).json()
    }

    pub fn clean_habitat(&mut self, habitat_id: u32) -> String {
        self.state.clean_habitat(habitat_id).json()
    }

    pub fn add_shelter(&mut self, habitat_id: u32) -> String {
        self.state.add_shelter(habitat_id).json()
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
    fn drawn_habitat_uses_variable_fence_and_shared_validation() {
        let mut state = GameState::default();
        let evaluation = state.evaluate_habitat_rect(3, 8, 7, 11);

        assert!(evaluation.ok);
        assert_eq!((evaluation.width, evaluation.height), (5, 4));
        assert_eq!(evaluation.occupied_tiles.len(), 20);
        assert_eq!(evaluation.fence_segments.len(), 18);
        assert_eq!(evaluation.cost_cents, habitat_cost(5, 4));

        let before = state.cash_cents;
        assert!(state.place_habitat_rect(7, 11, 3, 8).ok);
        assert_eq!(state.habitats[0].capacity(), 6);
        assert_eq!(state.cash_cents, before - evaluation.cost_cents);

        let repeated = state.place_habitat_rect(3, 8, 7, 11);
        assert!(repeated.ok);
        assert_eq!(state.cash_cents, before - evaluation.cost_cents);
    }

    #[test]
    fn drawn_habitat_rejects_small_disconnected_and_overlapping_loops() {
        let mut state = GameState::default();

        let too_small = state.evaluate_habitat_rect(3, 8, 4, 9);
        assert!(!too_small.ok);
        assert!(too_small.message.contains("3×3"));

        let disconnected = state.evaluate_habitat_rect(10, 1, 13, 4);
        assert!(!disconnected.ok);
        assert_eq!(
            disconnected.message,
            "The fence needs at least one path along its outside edge"
        );

        assert!(state.place_habitat_rect(3, 8, 6, 10).ok);
        let overlap = state.evaluate_habitat_rect(4, 9, 8, 12);
        assert!(!overlap.ok);
        assert_eq!(overlap.message, "The enclosed area must be clear grass");
    }

    #[test]
    fn legacy_habitat_api_remains_compatible() {
        let mut state = GameState::default();
        let preview = state.evaluate_habitat(3, 8, HabitatOrientation::Horizontal);
        assert!(preview.ok);
        assert_eq!((preview.width, preview.height), (4, 3));
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
    }

    #[test]
    fn expanded_species_catalog_has_distinct_requirements() {
        let state = GameState::default();
        let catalog = state.species_catalog();
        assert_eq!(catalog.len(), 6);

        let elephant = Species::parse("elephant").expect("elephant exists");
        let penguin = Species::parse("penguin").expect("penguin exists");
        assert!(elephant.purchase_cost() > penguin.purchase_cost());
        assert!(
            elephant.welfare_profile().space_per_animal
                > penguin.welfare_profile().space_per_animal
        );
        assert!(
            penguin.welfare_profile().minimum_social_group
                > elephant.welfare_profile().minimum_social_group
        );
    }

    #[test]
    fn large_drawn_habitats_support_more_animals() {
        let mut state = GameState::default();
        for x in 5..=9 {
            assert!(state.place_path(x, ENTRANCE_Y).ok);
        }
        assert!(state.place_habitat_rect(5, 8, 9, 12).ok);
        let habitat_id = state.habitats[0].id;
        assert_eq!(state.habitats[0].capacity(), 8);

        for _ in 0..6 {
            assert!(state.adopt(habitat_id, "zebra").ok);
        }
        assert_eq!(state.habitats[0].animals, 6);
        assert!(state.habitats[0].space_score() < 100);
    }

    #[test]
    fn animal_positions_roam_deterministically_inside_the_fence() {
        let mut first = GameState::default();
        let mut second = GameState::default();
        for state in [&mut first, &mut second] {
            assert!(state.place_habitat_rect(3, 8, 6, 11).ok);
            let id = state.habitats[0].id;
            assert!(state.adopt(id, "capybara").ok);
            assert!(state.adopt(id, "capybara").ok);
        }

        assert_eq!(
            serde_json::to_string(&first.animal_views()).unwrap(),
            serde_json::to_string(&second.animal_views()).unwrap()
        );
        let before = serde_json::to_string(&first.animal_views()).unwrap();
        first.tick(2);
        let after = serde_json::to_string(&first.animal_views()).unwrap();
        assert_ne!(before, after);
        for animal in first.animal_views() {
            let habitat = &first.habitats[0];
            assert!((habitat.x + 1..habitat.x + habitat.width - 1).contains(&animal.x));
            assert!((habitat.y + 1..habitat.y + habitat.height - 1).contains(&animal.y));
        }
    }

    #[test]
    fn guests_visibly_arrive_through_the_entrance() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;
        assert!(state.adopt(habitat_id, "flamingo").ok);

        state.tick(24);
        assert_eq!(state.guests.len(), 1);
        assert_eq!(
            (state.guests[0].x, state.guests[0].y),
            (ENTRANCE_X, ENTRANCE_Y)
        );
        assert_eq!(state.guests[0].state, GuestState::Arriving);

        state.tick(6);
        assert!(matches!(
            state.guests[0].state,
            GuestState::Arriving | GuestState::WalkingToHabitat
        ));
    }

    #[test]
    fn habitat_care_actions_remain_idempotent() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;
        assert!(state.adopt(habitat_id, "capybara").ok);
        state.tick(CARE_DECAY_INTERVAL_MINUTES);
        assert!(state.habitats[0].food < 100);

        let before = state.cash_cents;
        assert!(state.feed_habitat(habitat_id).ok);
        let after_first = state.cash_cents;
        assert_eq!(after_first, before - FOOD_RESTOCK_COST);
        assert!(state.feed_habitat(habitat_id).ok);
        assert_eq!(state.cash_cents, after_first);
    }

    #[test]
    fn simulation_remains_deterministic() {
        let mut first = GameState::default();
        let mut second = GameState::default();

        for state in [&mut first, &mut second] {
            assert!(state.place_habitat_rect(3, 8, 7, 11).ok);
            let habitat_id = state.habitats[0].id;
            assert!(state.adopt(habitat_id, "penguin").ok);
            assert!(state.adopt(habitat_id, "penguin").ok);
            state.tick(120);
        }

        assert_eq!(
            serde_json::to_string(&first.snapshot()).unwrap(),
            serde_json::to_string(&second.snapshot()).unwrap()
        );
    }
}
