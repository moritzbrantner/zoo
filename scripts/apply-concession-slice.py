from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


# Rust simulation authority.
RUST = "crates/zoo-core/src/lib.rs"
replace_once(
    RUST,
    "const CARE_DECAY_INTERVAL_MINUTES: u32 = 15;\n",
    """const CARE_DECAY_INTERVAL_MINUTES: u32 = 15;
const FOOD_STAND_BUILD_COST: i64 = 18_000;
const DRINK_STAND_BUILD_COST: i64 = 14_000;
const FOOD_PRICE: i64 = 500;
const DRINK_PRICE: i64 = 350;
const FOOD_BUY_THRESHOLD: u32 = 20;
const DRINK_BUY_THRESHOLD: u32 = 20;
""",
)
replace_once(
    RUST,
    """enum TileKind {
    Grass,
    Path,
    Entrance,
    Habitat(u32),
}
""",
    """enum TileKind {
    Grass,
    Path,
    Entrance,
    Habitat(u32),
    Concession(u32),
}
""",
)
replace_once(
    RUST,
    """struct Position {
    x: u32,
    y: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = \"snake_case\")]
enum HabitatOrientation {
""",
    """struct Position {
    x: u32,
    y: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = \"snake_case\")]
enum ConcessionKind {
    Food,
    Drink,
}

impl ConcessionKind {
    fn parse(value: &str) -> Option<Self> {
        match value {
            \"food\" => Some(Self::Food),
            \"drink\" => Some(Self::Drink),
            _ => None,
        }
    }

    fn key(self) -> &'static str {
        match self {
            Self::Food => \"food\",
            Self::Drink => \"drink\",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Food => \"Food stand\",
            Self::Drink => \"Drink stand\",
        }
    }

    fn build_cost(self) -> i64 {
        match self {
            Self::Food => FOOD_STAND_BUILD_COST,
            Self::Drink => DRINK_STAND_BUILD_COST,
        }
    }

    fn price_cents(self) -> i64 {
        match self {
            Self::Food => FOOD_PRICE,
            Self::Drink => DRINK_PRICE,
        }
    }
}

#[derive(Clone, Debug)]
struct Concession {
    id: u32,
    x: u32,
    y: u32,
    kind: ConcessionKind,
    sales_today: u32,
    total_sales: u32,
    total_revenue_cents: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = \"snake_case\")]
enum HabitatOrientation {
""",
)
replace_once(
    RUST,
    """    viewing_minutes: u32,
    arrival_steps: u8,
}
""",
    """    viewing_minutes: u32,
    arrival_steps: u8,
    bought_food: bool,
    bought_drink: bool,
}
""",
)
replace_once(
    RUST,
    """    tiles: Vec<TileKind>,
    habitats: Vec<Habitat>,
    guests: Vec<Guest>,
""",
    """    tiles: Vec<TileKind>,
    habitats: Vec<Habitat>,
    concessions: Vec<Concession>,
    guests: Vec<Guest>,
""",
)
replace_once(
    RUST,
    """    next_habitat_id: u32,
    next_guest_id: u32,
""",
    """    next_habitat_id: u32,
    next_concession_id: u32,
    next_guest_id: u32,
""",
)
replace_once(
    RUST,
    """    income_today_cents: i64,
    expenses_today_cents: i64,
}
""",
    """    income_today_cents: i64,
    expenses_today_cents: i64,
    concession_revenue_today_cents: i64,
}
""",
)
replace_once(
    RUST,
    """            tiles: vec![TileKind::Grass; (WIDTH * HEIGHT) as usize],
            habitats: Vec::new(),
            guests: Vec::new(),
""",
    """            tiles: vec![TileKind::Grass; (WIDTH * HEIGHT) as usize],
            habitats: Vec::new(),
            concessions: Vec::new(),
            guests: Vec::new(),
""",
)
replace_once(
    RUST,
    """            next_habitat_id: 1,
            next_guest_id: 1,
""",
    """            next_habitat_id: 1,
            next_concession_id: 1,
            next_guest_id: 1,
""",
)
replace_once(
    RUST,
    """            income_today_cents: 0,
            expenses_today_cents: 0,
""",
    """            income_today_cents: 0,
            expenses_today_cents: 0,
            concession_revenue_today_cents: 0,
""",
)
replace_once(
    RUST,
    """            Some(TileKind::Entrance) => ActionResult::ok(\"The entrance already acts as a path\"),
            Some(TileKind::Habitat(_)) => ActionResult::error(\"A habitat occupies that tile\"),
            Some(TileKind::Grass) => match self.spend(PATH_COST) {
""",
    """            Some(TileKind::Entrance) => ActionResult::ok(\"The entrance already acts as a path\"),
            Some(TileKind::Habitat(_)) => ActionResult::error(\"A habitat occupies that tile\"),
            Some(TileKind::Concession(_)) => {
                ActionResult::error(\"A concession stand occupies that tile\")
            }
            Some(TileKind::Grass) => match self.spend(PATH_COST) {
""",
)
replace_once(
    RUST,
    """    fn evaluate_habitat_rect(&self, ax: u32, ay: u32, bx: u32, by: u32) -> PlacementEvaluation {
""",
    """    fn place_concession(&mut self, x: u32, y: u32, kind_name: &str) -> ActionResult {
        let Some(kind) = ConcessionKind::parse(kind_name) else {
            return ActionResult::error(\"Unknown concession type\");
        };

        match self.tile(x, y) {
            None => return ActionResult::error(\"That tile is outside the park\"),
            Some(TileKind::Concession(id)) => {
                let Some(existing) = self.concessions.iter().find(|stand| stand.id == id) else {
                    return ActionResult::error(\"The concession tile is inconsistent\");
                };
                if existing.kind == kind {
                    return ActionResult::ok(format!(\"{} already stands here\", kind.label()));
                }
                return ActionResult::error(\"A different concession stand already occupies that tile\");
            }
            Some(TileKind::Path) | Some(TileKind::Entrance) => {
                return ActionResult::error(\"Build the stand on grass beside the path\");
            }
            Some(TileKind::Habitat(_)) => {
                return ActionResult::error(\"A habitat occupies that tile\");
            }
            Some(TileKind::Grass) => {}
        }

        let position = Position { x, y };
        let touches_path = self
            .neighbors(position)
            .into_iter()
            .any(|neighbor| self.is_walkable(neighbor));
        if !touches_path {
            return ActionResult::error(\"Concession stands must touch a guest path\");
        }

        if let Err(message) = self.spend(kind.build_cost()) {
            return ActionResult::error(message);
        }

        let id = self.next_concession_id;
        self.next_concession_id += 1;
        self.set_tile(x, y, TileKind::Concession(id));
        self.concessions.push(Concession {
            id,
            x,
            y,
            kind,
            sales_today: 0,
            total_sales: 0,
            total_revenue_cents: 0,
        });

        ActionResult::ok(format!(\"{} #{id} built beside the path\", kind.label()))
    }

    fn evaluate_habitat_rect(&self, ax: u32, ay: u32, bx: u32, by: u32) -> PlacementEvaluation {
""",
)
replace_once(
    RUST,
    """            Some(TileKind::Path) => {
                self.set_tile(x, y, TileKind::Grass);
                ActionResult::ok(\"Path removed\")
            }
            Some(TileKind::Habitat(id)) => {
""",
    """            Some(TileKind::Path) => {
                self.set_tile(x, y, TileKind::Grass);
                ActionResult::ok(\"Path removed\")
            }
            Some(TileKind::Concession(id)) => {
                self.set_tile(x, y, TileKind::Grass);
                self.concessions.retain(|stand| stand.id != id);
                ActionResult::ok(format!(\"Concession stand #{id} removed\"))
            }
            Some(TileKind::Habitat(id)) => {
""",
)
replace_once(
    RUST,
    """                self.income_today_cents = 0;
                self.expenses_today_cents = 0;
""",
    """                self.income_today_cents = 0;
                self.expenses_today_cents = 0;
                self.concession_revenue_today_cents = 0;
                for stand in &mut self.concessions {
                    stand.sales_today = 0;
                }
""",
)
replace_once(
    RUST,
    """            hunger: 10,
            thirst: 8,
""",
    """            hunger: 18,
            thirst: 16,
""",
)
replace_once(
    RUST,
    """            viewing_minutes: 0,
            arrival_steps: 2,
        });
""",
    """            viewing_minutes: 0,
            arrival_steps: 2,
            bought_food: false,
            bought_drink: false,
        });
""",
)
replace_once(
    RUST,
    """        if !leave_ids.is_empty() {
            self.guests.retain(|guest| !leave_ids.contains(&guest.id));
        }
    }

    fn advance_viewing(&mut self) {
""",
    """        if !leave_ids.is_empty() {
            self.guests.retain(|guest| !leave_ids.contains(&guest.id));
        }
        self.serve_concessions();
    }

    fn serve_concessions(&mut self) {
        for guest_index in 0..self.guests.len() {
            let (position, state, hunger, thirst, bought_food, bought_drink) = {
                let guest = &self.guests[guest_index];
                (
                    Position {
                        x: guest.x,
                        y: guest.y,
                    },
                    guest.state,
                    guest.hunger,
                    guest.thirst,
                    guest.bought_food,
                    guest.bought_drink,
                )
            };

            if !matches!(
                state,
                GuestState::WalkingToHabitat | GuestState::WalkingToExit
            ) {
                continue;
            }

            let adjacent_ids: Vec<u32> = self
                .neighbors(position)
                .into_iter()
                .filter_map(|neighbor| match self.tile(neighbor.x, neighbor.y) {
                    Some(TileKind::Concession(id)) => Some(id),
                    _ => None,
                })
                .collect();
            if adjacent_ids.is_empty() {
                continue;
            }

            let drink_choice = (!bought_drink && thirst >= DRINK_BUY_THRESHOLD)
                .then(|| {
                    adjacent_ids.iter().find_map(|id| {
                        self.concessions.iter().position(|stand| {
                            stand.id == *id && stand.kind == ConcessionKind::Drink
                        })
                    })
                })
                .flatten();
            let food_choice = (!bought_food && hunger >= FOOD_BUY_THRESHOLD)
                .then(|| {
                    adjacent_ids.iter().find_map(|id| {
                        self.concessions.iter().position(|stand| {
                            stand.id == *id && stand.kind == ConcessionKind::Food
                        })
                    })
                })
                .flatten();
            let Some(concession_index) = drink_choice.or(food_choice) else {
                continue;
            };

            let kind = self.concessions[concession_index].kind;
            let price = kind.price_cents();
            self.cash_cents += price;
            self.income_today_cents += price;
            self.concession_revenue_today_cents += price;
            {
                let stand = &mut self.concessions[concession_index];
                stand.sales_today += 1;
                stand.total_sales += 1;
                stand.total_revenue_cents += price;
            }
            {
                let guest = &mut self.guests[guest_index];
                match kind {
                    ConcessionKind::Food => {
                        guest.hunger = guest.hunger.saturating_sub(55);
                        guest.bought_food = true;
                    }
                    ConcessionKind::Drink => {
                        guest.thirst = guest.thirst.saturating_sub(55);
                        guest.bought_drink = true;
                    }
                }
                guest.happiness = guest.happiness.saturating_add(3).min(100);
                guest.value_perception = guest.value_perception.saturating_add(2).min(100);
            }
        }
    }

    fn advance_viewing(&mut self) {
""",
)
replace_once(
    RUST,
    """        let upkeep = self.habitats.len() as i64 * 250 + animal_count * 125 + fence_count * 8;
""",
    """        let upkeep = self.habitats.len() as i64 * 250
            + animal_count * 125
            + fence_count * 8
            + self.concessions.len() as i64 * 50;
""",
)
replace_once(
    RUST,
    """                    TileKind::Entrance => \"entrance\",
                    TileKind::Habitat(_) => \"habitat\",
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
""",
    """                    TileKind::Entrance => \"entrance\",
                    TileKind::Habitat(_) => \"habitat\",
                    TileKind::Concession(_) => \"concession\",
                };
                let habitat_id = match self.tile(x, y) {
                    Some(TileKind::Habitat(id)) => Some(id),
                    _ => None,
                };
                let concession_id = match self.tile(x, y) {
                    Some(TileKind::Concession(id)) => Some(id),
                    _ => None,
                };
                tiles.push(TileView {
                    x,
                    y,
                    kind: kind.to_owned(),
                    habitat_id,
                    concession_id,
                });
""",
)
replace_once(
    RUST,
    """        let guests = self
            .guests
""",
    """        let concessions = self
            .concessions
            .iter()
            .map(|stand| ConcessionView {
                id: stand.id,
                x: stand.x,
                y: stand.y,
                kind: stand.kind.key().to_owned(),
                build_cost_cents: stand.kind.build_cost(),
                price_cents: stand.kind.price_cents(),
                sales_today: stand.sales_today,
                total_sales: stand.total_sales,
                total_revenue_cents: stand.total_revenue_cents,
            })
            .collect();

        let guests = self
            .guests
""",
)
replace_once(
    RUST,
    """            tiles,
            habitats,
            animals: self.animal_views(),
""",
    """            tiles,
            habitats,
            concessions,
            animals: self.animal_views(),
""",
)
replace_once(
    RUST,
    """                expenses_today_cents: self.expenses_today_cents,
                profit_today_cents: self.income_today_cents - self.expenses_today_cents,
                admission_price_cents: ADMISSION_PRICE,
""",
    """                expenses_today_cents: self.expenses_today_cents,
                profit_today_cents: self.income_today_cents - self.expenses_today_cents,
                admission_price_cents: ADMISSION_PRICE,
                concession_revenue_today_cents: self.concession_revenue_today_cents,
""",
)
replace_once(
    RUST,
    """struct TileView {
    x: u32,
    y: u32,
    kind: String,
    habitat_id: Option<u32>,
}

#[derive(Serialize)]
struct HabitatView {
""",
    """struct TileView {
    x: u32,
    y: u32,
    kind: String,
    habitat_id: Option<u32>,
    concession_id: Option<u32>,
}

#[derive(Serialize)]
struct ConcessionView {
    id: u32,
    x: u32,
    y: u32,
    kind: String,
    build_cost_cents: i64,
    price_cents: i64,
    sales_today: u32,
    total_sales: u32,
    total_revenue_cents: i64,
}

#[derive(Serialize)]
struct HabitatView {
""",
)
replace_once(
    RUST,
    """struct FinanceView {
    income_today_cents: i64,
    expenses_today_cents: i64,
    profit_today_cents: i64,
    admission_price_cents: i64,
}
""",
    """struct FinanceView {
    income_today_cents: i64,
    expenses_today_cents: i64,
    profit_today_cents: i64,
    admission_price_cents: i64,
    concession_revenue_today_cents: i64,
}
""",
)
replace_once(
    RUST,
    """    tiles: Vec<TileView>,
    habitats: Vec<HabitatView>,
    animals: Vec<AnimalView>,
""",
    """    tiles: Vec<TileView>,
    habitats: Vec<HabitatView>,
    concessions: Vec<ConcessionView>,
    animals: Vec<AnimalView>,
""",
)
replace_once(
    RUST,
    """    pub fn place_path(&mut self, x: u32, y: u32) -> String {
        self.state.place_path(x, y).json()
    }

    pub fn evaluate_habitat_rect(&self, ax: u32, ay: u32, bx: u32, by: u32) -> String {
""",
    """    pub fn place_path(&mut self, x: u32, y: u32) -> String {
        self.state.place_path(x, y).json()
    }

    pub fn place_concession(&mut self, x: u32, y: u32, kind: String) -> String {
        self.state.place_concession(x, y, &kind).json()
    }

    pub fn evaluate_habitat_rect(&self, ax: u32, ay: u32, bx: u32, by: u32) -> String {
""",
)
replace_once(
    RUST,
    """    #[test]
    fn simulation_remains_deterministic() {
""",
    """    #[test]
    fn concession_placement_requires_path_and_is_idempotent() {
        let mut state = GameState::default();
        let before = state.cash_cents;

        assert!(state.place_concession(1, ENTRANCE_Y - 1, \"food\").ok);
        assert_eq!(state.cash_cents, before - FOOD_STAND_BUILD_COST);
        assert_eq!(state.concessions.len(), 1);

        assert!(state.place_concession(1, ENTRANCE_Y - 1, \"food\").ok);
        assert_eq!(state.cash_cents, before - FOOD_STAND_BUILD_COST);
        assert_eq!(state.concessions.len(), 1);

        let disconnected = state.place_concession(12, 2, \"drink\");
        assert!(!disconnected.ok);
        assert_eq!(disconnected.message, \"Concession stands must touch a guest path\");
    }

    #[test]
    fn guests_buy_food_and_drinks_from_pathside_stands() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;
        assert!(state.adopt(habitat_id, \"capybara\").ok);
        assert!(state.place_concession(1, ENTRANCE_Y - 1, \"drink\").ok);
        assert!(state.place_concession(2, ENTRANCE_Y - 1, \"food\").ok);

        state.tick(40);

        let drink = state
            .concessions
            .iter()
            .find(|stand| stand.kind == ConcessionKind::Drink)
            .unwrap();
        let food = state
            .concessions
            .iter()
            .find(|stand| stand.kind == ConcessionKind::Food)
            .unwrap();
        assert_eq!(drink.total_sales, 1);
        assert_eq!(food.total_sales, 1);
        assert_eq!(
            state.concession_revenue_today_cents,
            DRINK_PRICE + FOOD_PRICE
        );
        assert!(state.guests[0].bought_drink);
        assert!(state.guests[0].bought_food);
        assert!(state.guests[0].hunger < FOOD_BUY_THRESHOLD);
        assert!(state.guests[0].thirst < DRINK_BUY_THRESHOLD);
    }

    #[test]
    fn simulation_remains_deterministic() {
""",
)

# React interaction and presentation.
APP = "apps/web/src/App.tsx"
replace_once(
    APP,
    'type Tool = "select" | "pan" | "path" | "habitat" | "bulldoze"\n',
    'type Tool = "select" | "pan" | "path" | "habitat" | "food" | "drink" | "bulldoze"\n',
)
replace_once(
    APP,
    'type SpeciesKey = "capybara" | "flamingo" | "zebra" | "giraffe" | "elephant" | "penguin"\n',
    'type SpeciesKey = "capybara" | "flamingo" | "zebra" | "giraffe" | "elephant" | "penguin"\ntype ConcessionKind = "food" | "drink"\n',
)
replace_once(
    APP,
    """type Tile = Point & {
  kind: \"grass\" | \"path\" | \"entrance\" | \"habitat\"
  habitat_id: number | null
}
""",
    """type Tile = Point & {
  kind: \"grass\" | \"path\" | \"entrance\" | \"habitat\" | \"concession\"
  habitat_id: number | null
  concession_id: number | null
}
""",
)
replace_once(
    APP,
    """type Animal = Point & {
  id: number
  habitat_id: number
  species: SpeciesKey
  slot: number
  animation_phase: number
}

""",
    """type Animal = Point & {
  id: number
  habitat_id: number
  species: SpeciesKey
  slot: number
  animation_phase: number
}

type Concession = Point & {
  id: number
  kind: ConcessionKind
  build_cost_cents: number
  price_cents: number
  sales_today: number
  total_sales: number
  total_revenue_cents: number
}

""",
)
replace_once(
    APP,
    """  tiles: Tile[]
  habitats: Habitat[]
  animals: Animal[]
""",
    """  tiles: Tile[]
  habitats: Habitat[]
  concessions: Concession[]
  animals: Animal[]
""",
)
replace_once(
    APP,
    """    profit_today_cents: number
    admission_price_cents: number
  }
""",
    """    profit_today_cents: number
    admission_price_cents: number
    concession_revenue_today_cents: number
  }
""",
)
replace_once(
    APP,
    """    case \"habitat\":
      return \"Press on one corner, drag to the opposite corner, and release to close the fence.\"
    case \"bulldoze\":
""",
    """    case \"habitat\":
      return \"Press on one corner, drag to the opposite corner, and release to close the fence.\"
    case \"food\":
      return \"Click clear grass beside a path to build a food stand · $180.\"
    case \"drink\":
      return \"Click clear grass beside a path to build a drink stand · $140.\"
    case \"bulldoze\":
""",
)
replace_once(
    APP,
    """    if (tool === \"select\") {
      setSelectedGuestId(null)
      setSelectedHabitatId(tile.habitat_id)
      setMessage(tile.habitat_id ? `Habitat #${tile.habitat_id} selected` : \"Ground selected\")
      setMessageKind(\"info\")
      return
    }

    perform(() => game.bulldoze(tile.x, tile.y))
""",
    """    if (tool === \"select\") {
      setSelectedGuestId(null)
      setSelectedHabitatId(tile.habitat_id)
      const stand = snapshot?.concessions.find((candidate) => candidate.id === tile.concession_id)
      setMessage(
        tile.habitat_id
          ? `Habitat #${tile.habitat_id} selected`
          : stand
            ? `${stand.kind === \"food\" ? \"Food\" : \"Drink\"} stand #${stand.id} · ${stand.sales_today} sales today`
            : \"Ground selected\",
      )
      setMessageKind(\"info\")
      return
    }

    if (tool === \"food\" || tool === \"drink\") {
      perform(() => game.place_concession(tile.x, tile.y, tool))
      return
    }

    perform(() => game.bulldoze(tile.x, tile.y))
""",
)
replace_once(
    APP,
    """            {snapshot.animals.map((animal) => {
""",
    """            {snapshot.concessions.map((stand) => {
              const position = isoPosition(stand.x, stand.y)
              const label = stand.kind === \"food\" ? \"Food\" : \"Drink\"
              return (
                <button
                  type=\"button\"
                  className={`concession concession-${stand.kind}`}
                  key={`concession:${stand.id}`}
                  style={{
                    left: position.left + 8,
                    top: position.top - 42,
                    zIndex: 610 + stand.x + stand.y,
                  }}
                  title={`${label} stand · ${money(stand.price_cents)} · ${stand.sales_today} sales today`}
                  aria-label={`${label} stand ${stand.id}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    const game = gameRef.current
                    if (tool === \"bulldoze\" && game) {
                      perform(() => game.bulldoze(stand.x, stand.y))
                      return
                    }
                    if (tool === \"pan\") return
                    setSelectedGuestId(null)
                    setSelectedHabitatId(null)
                    setTool(\"select\")
                    setMessage(`${label} stand #${stand.id} · ${stand.sales_today} sales today`)
                    setMessageKind(\"info\")
                  }}
                >
                  <span className=\"concession-awning\" />
                  <strong>{label}</strong>
                  <small>{stand.kind === \"food\" ? \"FOOD\" : \"DRINK\"}</small>
                  <span className=\"concession-counter\" />
                </button>
              )
            })}

            {snapshot.animals.map((animal) => {
""",
)
replace_once(
    APP,
    """                  <li>Select the enclosure and adopt one of the available species.</li>
                  <li>Watch individual animals roam while guests arrive and pay admission.</li>
""",
    """                  <li>Select the enclosure and adopt one of the available species.</li>
                  <li>Place food and drink stands on clear grass beside busy paths.</li>
                  <li>Watch guests buy refreshments while they move through the zoo.</li>
""",
)
replace_once(
    APP,
    """                  <span>Admission</span>
                  <strong>{money(snapshot.finance.admission_price_cents)}</strong>
""",
    """                  <span>Admission</span>
                  <strong>{money(snapshot.finance.admission_price_cents)}</strong>
                  <span>Stand sales</span>
                  <strong>{money(snapshot.finance.concession_revenue_today_cents)}</strong>
""",
)
replace_once(
    APP,
    """          <ToolButton
            active={tool === \"habitat\"}
            icon=\"⌗\"
            label=\"Draw habitat\"
            onClick={() => setTool(\"habitat\")}
          />
          <ToolButton
            active={tool === \"bulldoze\"}
""",
    """          <ToolButton
            active={tool === \"habitat\"}
            icon=\"⌗\"
            label=\"Draw habitat\"
            onClick={() => setTool(\"habitat\")}
          />
          <ToolButton
            active={tool === \"food\"}
            icon=\"▰\"
            label=\"Food stand · $180\"
            onClick={() => setTool(\"food\")}
          />
          <ToolButton
            active={tool === \"drink\"}
            icon=\"▥\"
            label=\"Drink stand · $140\"
            onClick={() => setTool(\"drink\")}
          />
          <ToolButton
            active={tool === \"bulldoze\"}
""",
)

# Stand visuals live in a small dedicated stylesheet.
Path("apps/web/src/concessions.css").write_text(
    """.tile-concession {
  background:
    radial-gradient(circle at 42% 40%, rgb(255 255 255 / 9%) 0 7%, transparent 8%),
    #74ad50;
}

.concession {
  position: absolute;
  width: 46px;
  min-width: 46px;
  height: 48px;
  padding: 0;
  border: 2px solid #493722;
  border-radius: 3px 3px 5px 5px;
  color: #2d2419;
  cursor: pointer;
  box-shadow:
    0 6px 0 rgb(56 48 31 / 28%),
    inset 0 2px 0 rgb(255 255 255 / 35%);
  transform: skewY(-3deg);
}

.concession:hover {
  filter: brightness(1.08);
  transform: translateY(-2px) skewY(-3deg);
}

.concession-food {
  background: #e7b957;
}

.concession-drink {
  background: #87c7d8;
}

.concession-awning {
  position: absolute;
  left: -5px;
  top: -9px;
  width: 52px;
  height: 12px;
  border: 2px solid #493722;
  border-radius: 3px 3px 1px 1px;
  background: repeating-linear-gradient(90deg, #f4efe2 0 8px, #b94f3d 8px 16px);
  box-shadow: 0 2px 0 rgb(58 43 25 / 22%);
}

.concession-drink .concession-awning {
  background: repeating-linear-gradient(90deg, #f4efe2 0 8px, #4c8faf 8px 16px);
}

.concession strong,
.concession small {
  position: absolute;
  left: 4px;
  right: 4px;
  text-align: center;
  line-height: 1;
}

.concession strong {
  top: 8px;
  font-size: 9px;
  text-transform: uppercase;
}

.concession small {
  top: 21px;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.7px;
}

.concession-counter {
  position: absolute;
  left: 5px;
  right: 5px;
  bottom: 5px;
  height: 9px;
  border: 1px solid #493722;
  background: #f1e5cc;
  box-shadow: inset 0 -3px 0 rgb(73 55 34 / 14%);
}
"""
)
replace_once(
    "apps/web/src/main.tsx",
    'import "./fence.css"\nimport "./park-frame.css"\n',
    'import "./fence.css"\nimport "./park-frame.css"\nimport "./concessions.css"\n',
)

# Browser dogfood: place both stands through the real UI and capture visual proof.
Path("apps/web/scripts/capture-concessions-proof.mjs").write_text(
    r'''import {spawn} from "node:child_process"
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs"

const previewUrl = "http://127.0.0.1:4173/"
const debuggingPort = 9224
const chromeCandidates = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean)
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate))

if (!chromePath) {
  throw new Error(`No Chrome/Chromium binary found. Checked: ${chromeCandidates.join(", ")}`)
}

const profileDir = `/tmp/zoo-concession-proof-${process.pid}`
rmSync(profileDir, {recursive: true, force: true})
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDir}`,
    "--window-size=1280,850",
    previewUrl,
  ],
  {stdio: "ignore"},
)

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForPageTarget() {
  let lastError = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json`)
      if (response.ok) {
        const targets = await response.json()
        const target = targets.find(
          (candidate) => candidate.type === "page" && candidate.url.startsWith(previewUrl),
        )
        if (target?.webSocketDebuggerUrl) return target
      }
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`Chrome did not expose the Zoo page target: ${lastError ?? "timed out"}`)
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 1
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, {once: true})
    socket.addEventListener("error", reject, {once: true})
  })
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data))
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(`${message.error.code}: ${message.error.message}`))
    else request.resolve(message.result)
  })
  return {
    opened,
    close: () => socket.close(),
    send(method, params = {}) {
      const id = nextId
      nextId += 1
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject})
        socket.send(JSON.stringify({id, method, params}))
      })
    },
  }
}

let cdp = null
try {
  const target = await waitForPageTarget()
  cdp = connectCdp(target.webSocketDebuggerUrl)
  await cdp.opened
  await cdp.send("Page.enable")
  await cdp.send("Runtime.enable")

  const evaluate = async (expression) => {
    const response = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text ?? "Browser evaluation failed")
    }
    return response.result.value
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate("Boolean(document.querySelector('.toolbar') && document.querySelector('[aria-label=\"grass tile 1, 6\"]'))")) break
    if (attempt === 79) throw new Error("Zoo UI did not become ready")
    await sleep(250)
  }

  const placed = await evaluate(`(() => {
    const clickTool = (label) => {
      const button = [...document.querySelectorAll('.tool')].find((candidate) =>
        candidate.textContent.includes(label),
      )
      if (!button) throw new Error('Missing tool: ' + label)
      button.click()
    }
    const clickTile = (x, y) => {
      const tile = document.querySelector('[aria-label="grass tile ' + x + ', ' + y + '"]')
      if (!tile) throw new Error('Missing grass tile ' + x + ', ' + y)
      tile.click()
    }
    clickTool('Drink stand')
    clickTile(1, 6)
    clickTool('Food stand')
    clickTile(2, 6)
    return true
  })()`)
  if (!placed) throw new Error("Concession placement script did not run")

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await evaluate(`JSON.stringify({
      count: document.querySelectorAll('.concession').length,
      food: Boolean(document.querySelector('.concession-food')),
      drink: Boolean(document.querySelector('.concession-drink')),
    })`)
    const state = JSON.parse(result)
    if (state.count === 2 && state.food && state.drink) break
    if (attempt === 39) throw new Error(`Expected two rendered stands, got ${result}`)
    await sleep(100)
  }

  mkdirSync("test-results", {recursive: true})
  const screenshot = await cdp.send("Page.captureScreenshot", {format: "png", fromSurface: true})
  writeFileSync("test-results/concessions.png", Buffer.from(screenshot.data, "base64"))
  console.log("Concession dogfood passed: food + drink stands placed beside the starter path")
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
'''
)

replace_once(
    ".github/workflows/verify.yml",
    """          bun scripts/capture-fence-proof.mjs
          bun scripts/capture-park-frame-proof.mjs
""",
    """          bun scripts/capture-fence-proof.mjs
          bun scripts/capture-park-frame-proof.mjs
          bun scripts/capture-concessions-proof.mjs
""",
)
replace_once(
    ".github/workflows/verify.yml",
    """      - name: Upload playable web preview
        if: github.event_name == 'pull_request'
""",
    """      - name: Upload concession visual proof
        if: always() && github.event_name == 'pull_request'
        uses: actions/upload-artifact@v4
        with:
          name: zoo-concession-visual-proof
          path: apps/web/test-results/concessions.png
          if-no-files-found: error
          retention-days: 7
      - name: Upload playable web preview
        if: github.event_name == 'pull_request'
""",
)

print("Applied zoo guest concession vertical slice")
