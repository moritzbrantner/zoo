from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {text.count(old)}")
    return text.replace(old, new, 1)


lib_path = Path("crates/zoo-core/src/lib.rs")
lib = lib_path.read_text()

lib = replace_once(
    lib,
    '''#[derive(Clone, Debug)]
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

#[derive(Clone, Debug, Serialize)]
struct PlacementEvaluation {''',
    '''#[derive(Clone, Debug)]
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
struct PlacementEvaluation {''',
    "guest fields",
)

lib = replace_once(
    lib,
    '''            if self.upkeep_accumulator >= 60 {
                self.upkeep_accumulator = 0;
                self.charge_upkeep();
            }
            if self.movement_accumulator >= 3 {''',
    '''            if self.upkeep_accumulator >= 60 {
                self.upkeep_accumulator = 0;
                self.charge_upkeep();
            }

            self.advance_guest_needs();

            if self.movement_accumulator >= 3 {''',
    "tick needs",
)

lib = replace_once(
    lib,
    '''            happiness: 78,
            target_habitat,
            state: GuestState::WalkingToHabitat,''',
    '''            happiness: 78,
            energy: 90,
            hunger: 10,
            thirst: 8,
            value_perception: 68,
            minutes_in_park: 0,
            target_habitat,
            state: GuestState::WalkingToHabitat,''',
    "guest spawn needs",
)

lib = replace_once(
    lib,
    '''    fn advance_guest_movement(&mut self) {
        let mut leave_ids = Vec::new();''',
    '''    fn advance_guest_needs(&mut self) {
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
        let mut leave_ids = Vec::new();''',
    "guest need methods",
)

lib = replace_once(
    lib,
    '''                GuestState::WalkingToHabitat => {
                    self.guests[index].state = GuestState::Viewing;
                    self.guests[index].viewing_minutes = 24;
                    self.guests[index].happiness = 92;
                }''',
    '''                GuestState::WalkingToHabitat => {
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
                }''',
    "viewing experience",
)

lib = replace_once(
    lib,
    '''    fn snapshot(&self) -> Snapshot {''',
    '''    fn complaint_summary(&self) -> ComplaintSummary {
        ComplaintSummary {
            hungry: self.guests.iter().filter(|guest| guest.hunger >= 60).count() as u32,
            thirsty: self.guests.iter().filter(|guest| guest.thirst >= 60).count() as u32,
            tired: self.guests.iter().filter(|guest| guest.energy <= 35).count() as u32,
            poor_value: self
                .guests
                .iter()
                .filter(|guest| guest.value_perception <= 40)
                .count() as u32,
        }
    }

    fn snapshot(&self) -> Snapshot {''',
    "complaint summary method",
)

lib = replace_once(
    lib,
    '''                happiness: guest.happiness,
                target_habitat: guest.target_habitat,
                state: guest.state.clone(),''',
    '''                happiness: guest.happiness,
                energy: guest.energy,
                hunger: guest.hunger,
                thirst: guest.thirst,
                value_perception: guest.value_perception,
                target_habitat: guest.target_habitat,
                state: guest.state.clone(),
                thought: guest.thought().to_owned(),''',
    "guest snapshot fields",
)

lib = replace_once(
    lib,
    '''            habitats,
            guests,
            finance: FinanceView {''',
    '''            habitats,
            guests,
            complaints: self.complaint_summary(),
            finance: FinanceView {''',
    "snapshot complaints",
)

lib = replace_once(
    lib,
    '''struct GuestView {
    id: u32,
    x: u32,
    y: u32,
    happiness: u32,
    target_habitat: u32,
    state: GuestState,
}

#[derive(Serialize)]
struct FinanceView {''',
    '''struct GuestView {
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
struct FinanceView {''',
    "guest view and complaints type",
)

lib = replace_once(
    lib,
    '''    habitats: Vec<HabitatView>,
    guests: Vec<GuestView>,
    finance: FinanceView,''',
    '''    habitats: Vec<HabitatView>,
    guests: Vec<GuestView>,
    complaints: ComplaintSummary,
    finance: FinanceView,''',
    "snapshot complaint field",
)

extra_tests = r'''

    #[test]
    fn guest_needs_decay_deterministically() {
        let mut first = GameState::default();
        let mut second = GameState::default();
        assert!(first.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        assert!(second.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
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
        assert!(state
            .place_habitat(10, 8, HabitatOrientation::Horizontal)
            .ok);
        let habitat_id = state.habitats[0].id;
        assert!(state.adopt(habitat_id, "flamingo").ok);
        let cash_before_tick = state.cash_cents;

        state.tick(24);

        assert!(state.guests.is_empty());
        assert_eq!(state.cash_cents, cash_before_tick);
    }
'''
head, tail = lib.rsplit("\n}", 1)
lib = head + extra_tests + "\n}\n" + tail
lib_path.write_text(lib)

app_path = Path("apps/web/src/App.tsx")
app = app_path.read_text()

app = replace_once(
    app,
    '''type Guest = {
  id: number
  x: number
  y: number
  happiness: number
  target_habitat: number
  state: "walking_to_habitat" | "viewing" | "walking_to_exit"
}''',
    '''type Guest = {
  id: number
  x: number
  y: number
  happiness: number
  energy: number
  hunger: number
  thirst: number
  value_perception: number
  target_habitat: number
  state: "walking_to_habitat" | "viewing" | "walking_to_exit"
  thought: string
}''',
    "app guest type",
)

app = replace_once(
    app,
    '''  habitats: Habitat[]
  guests: Guest[]
  finance: {''',
    '''  habitats: Habitat[]
  guests: Guest[]
  complaints: {
    hungry: number
    thirsty: number
    tired: number
    poor_value: number
  }
  finance: {''',
    "app complaints type",
)

app = replace_once(
    app,
    '''function speciesLabel(species: Habitat["species"]) {
  if (species === "capybara") return "Capybara"
  if (species === "flamingo") return "Flamingo"
  return "Empty habitat"
}

function toolHint(tool: Tool) {''',
    '''function speciesLabel(species: Habitat["species"]) {
  if (species === "capybara") return "Capybara"
  if (species === "flamingo") return "Flamingo"
  return "Empty habitat"
}

function guestStateLabel(state: Guest["state"]) {
  if (state === "walking_to_habitat") return "Walking to habitat"
  if (state === "viewing") return "Viewing animals"
  return "Walking to exit"
}

function toolHint(tool: Tool) {''',
    "guest state label",
)

app = replace_once(
    app,
    '''      return "Click a habitat, animal marker, or ground tile to inspect it."''',
    '''      return "Click a habitat, guest, animal marker, or ground tile to inspect it."''',
    "inspect hint",
)

app = replace_once(
    app,
    '''  const [selectedHabitatId, setSelectedHabitatId] = useState<number | null>(null)
  const [hoveredTile, setHoveredTile] = useState<Point | null>(null)''',
    '''  const [selectedHabitatId, setSelectedHabitatId] = useState<number | null>(null)
  const [selectedGuestId, setSelectedGuestId] = useState<number | null>(null)
  const [hoveredTile, setHoveredTile] = useState<Point | null>(null)''',
    "selected guest state",
)

app = replace_once(
    app,
    '''  const selectedHabitat = useMemo(
    () => snapshot?.habitats.find((habitat) => habitat.id === selectedHabitatId) ?? null,
    [selectedHabitatId, snapshot],
  )

  const placement = useMemo(() => {''',
    '''  const selectedHabitat = useMemo(
    () => snapshot?.habitats.find((habitat) => habitat.id === selectedHabitatId) ?? null,
    [selectedHabitatId, snapshot],
  )

  const selectedGuest = useMemo(
    () => snapshot?.guests.find((guest) => guest.id === selectedGuestId) ?? null,
    [selectedGuestId, snapshot],
  )

  const placement = useMemo(() => {''',
    "selected guest memo",
)

app = replace_once(
    app,
    '''    if (tool === "select") {
      setSelectedHabitatId(tile.habitat_id)
      setMessage(tile.habitat_id ? `Habitat #${tile.habitat_id} selected` : "Ground selected")''',
    '''    if (tool === "select") {
      setSelectedGuestId(null)
      setSelectedHabitatId(tile.habitat_id)
      setMessage(tile.habitat_id ? `Habitat #${tile.habitat_id} selected` : "Ground selected")''',
    "tile clears guest",
)

app = replace_once(
    app,
    '''    setTool("select")
    setSelectedHabitatId(null)
    setHoveredTile(null)''',
    '''    setTool("select")
    setSelectedHabitatId(null)
    setSelectedGuestId(null)
    setHoveredTile(null)''',
    "reset guest",
)

app = replace_once(
    app,
    '''                    setSelectedHabitatId(habitat.id)
                    setTool("select")''',
    '''                    setSelectedGuestId(null)
                    setSelectedHabitatId(habitat.id)
                    setTool("select")''',
    "habitat clears guest",
)

app = replace_once(
    app,
    '''                <div
                  className={`guest guest-${guest.state}`}
                  key={guest.id}
                  style={{
                    left: position.left + 24,
                    top: position.top - 4,
                    zIndex: 800 + guest.x + guest.y,
                  }}
                  title={`Guest #${guest.id} · happiness ${guest.happiness}%`}
                >
                  <i />
                  <b />
                </div>''',
    '''                <button
                  type="button"
                  className={`guest guest-${guest.state} ${selectedGuestId === guest.id ? "selected" : ""}`}
                  key={guest.id}
                  style={{
                    left: position.left + 24,
                    top: position.top - 4,
                    zIndex: 800 + guest.x + guest.y,
                  }}
                  title={`Guest #${guest.id} · ${guest.thought}`}
                  onClick={() => {
                    if (tool === "pan") return
                    setSelectedGuestId(guest.id)
                    setSelectedHabitatId(null)
                    setTool("select")
                  }}
                >
                  <i />
                  <b />
                </button>''',
    "guest marker button",
)

app = replace_once(
    app,
    '''        <aside className="side-panel bevel">
          {selectedHabitat ? (''',
    '''        <aside className="side-panel bevel">
          {selectedGuest ? (
            <>
              <div className="window-title">
                <span>Guest #{selectedGuest.id}</span>
                <button onClick={() => setSelectedGuestId(null)}>×</button>
              </div>
              <div className="guest-card">
                <div className="guest-thought">“{selectedGuest.thought}”</div>
                <dl>
                  <div><dt>Status</dt><dd>{guestStateLabel(selectedGuest.state)}</dd></div>
                  <div><dt>Destination</dt><dd>Habitat #{selectedGuest.target_habitat}</dd></div>
                  <div><dt>Happiness</dt><dd>{selectedGuest.happiness}%</dd></div>
                </dl>
                <h3>Needs</h3>
                <NeedBar label="Energy" value={selectedGuest.energy} />
                <NeedBar label="Hunger" value={selectedGuest.hunger} badWhenHigh />
                <NeedBar label="Thirst" value={selectedGuest.thirst} badWhenHigh />
                <NeedBar label="Value" value={selectedGuest.value_perception} />
              </div>
            </>
          ) : selectedHabitat ? (''',
    "guest inspector branch",
)

app = replace_once(
    app,
    '''                <div className="finance-grid">
                  <span>Income today</span><strong>{money(snapshot.finance.income_today_cents)}</strong>
                  <span>Expenses today</span><strong>{money(snapshot.finance.expenses_today_cents)}</strong>
                  <span>Profit today</span><strong>{money(snapshot.finance.profit_today_cents)}</strong>
                </div>
                <button className="secondary" onClick={reset}>Start new park</button>''',
    '''                <div className="finance-grid">
                  <span>Income today</span><strong>{money(snapshot.finance.income_today_cents)}</strong>
                  <span>Expenses today</span><strong>{money(snapshot.finance.expenses_today_cents)}</strong>
                  <span>Profit today</span><strong>{money(snapshot.finance.profit_today_cents)}</strong>
                </div>
                <h3>Guest complaints</h3>
                <div className="complaint-grid">
                  <span>Hungry</span><strong>{snapshot.complaints.hungry}</strong>
                  <span>Thirsty</span><strong>{snapshot.complaints.thirsty}</strong>
                  <span>Tired</span><strong>{snapshot.complaints.tired}</strong>
                  <span>Poor value</span><strong>{snapshot.complaints.poor_value}</strong>
                </div>
                <button className="secondary" onClick={reset}>Start new park</button>''',
    "complaint UI",
)

app += '''

function NeedBar({label, value, badWhenHigh = false}: {label: string; value: number; badWhenHigh?: boolean}) {
  const warning = badWhenHigh ? value >= 60 : value <= 35
  return (
    <div className={`need-row ${warning ? "warning" : ""}`}>
      <div><span>{label}</span><strong>{value}%</strong></div>
      <div className="need-track"><span style={{width: `${value}%`}} /></div>
    </div>
  )
}
'''
app_path.write_text(app)

styles_path = Path("apps/web/src/styles.css")
styles = styles_path.read_text()
styles = replace_once(
    styles,
    '''.guest {
  position: absolute;
  width: 14px;
  height: 22px;
  pointer-events: none;
  filter: drop-shadow(0 3px 1px rgb(0 0 0 / 25%));
}''',
    '''.guest {
  position: absolute;
  width: 14px;
  height: 22px;
  padding: 0;
  border: 0;
  pointer-events: auto;
  background: transparent;
  cursor: pointer;
  filter: drop-shadow(0 3px 1px rgb(0 0 0 / 25%));
}

.guest.selected {
  filter: drop-shadow(0 0 4px #fff6b3) drop-shadow(0 3px 1px rgb(0 0 0 / 25%));
}''',
    "guest clickable styles",
)
styles = replace_once(
    styles,
    '''.habitat-card,
.manager-card {
  padding: 14px;
}''',
    '''.habitat-card,
.guest-card,
.manager-card {
  padding: 14px;
}''',
    "guest card padding",
)
styles += '''

.guest-card h3,
.manager-card h3 {
  margin: 18px 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.guest-thought {
  margin-bottom: 14px;
  padding: 10px;
  border: 1px solid #8a8467;
  border-radius: 4px;
  background: #f3edcc;
  font-weight: 800;
  line-height: 1.35;
}

.need-row {
  margin: 9px 0;
}

.need-row > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
}

.need-track {
  height: 10px;
  margin-top: 3px;
  padding: 1px;
  border: 1px solid #77745d;
  background: #aaa98a;
}

.need-track span {
  display: block;
  height: 100%;
  background: #4d9255;
}

.need-row.warning .need-track span {
  background: repeating-linear-gradient(45deg, #ad493a 0 5px, #d88352 5px 9px);
}

.complaint-grid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 12px;
  margin: 8px 0 18px;
  padding: 10px;
  border: 1px solid #979175;
  background: #eee8c7;
  font-size: 11px;
}

.complaint-grid strong {
  font-variant-numeric: tabular-nums;
}
'''
styles_path.write_text(styles)
