from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


lib_path = Path("crates/zoo-core/src/lib.rs")
lib = lib_path.read_text()

lib = replace_once(
    lib,
    '''    fn appeal(self) -> u32 {
        match self {
            Self::Capybara => 95,
            Self::Flamingo => 80,
        }
    }

    fn label(self) -> &'static str {''',
    '''    fn appeal(self) -> u32 {
        match self {
            Self::Capybara => 95,
            Self::Flamingo => 80,
        }
    }

    fn social_minimum(self) -> u32 {
        match self {
            Self::Capybara => 2,
            Self::Flamingo => 3,
        }
    }

    fn preferred_group(self) -> u32 {
        match self {
            Self::Capybara => 3,
            Self::Flamingo => 4,
        }
    }

    fn space_per_animal(self) -> u32 {
        match self {
            Self::Capybara => 4,
            Self::Flamingo => 2,
        }
    }

    fn label(self) -> &'static str {''',
    "species requirements",
)

lib = replace_once(
    lib,
    '''impl Habitat {
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
enum GuestState {''',
    '''impl Habitat {
    fn capacity(&self) -> u32 {
        4
    }

    fn appeal(&self) -> u32 {
        self.species.map_or(0, |species| {
            species.appeal().saturating_mul(self.animals.max(1))
        })
    }

    fn welfare_profile(&self) -> WelfareProfile {
        let Some(species) = self.species else {
            return WelfareProfile {
                social_score: 100,
                space_score: 100,
                target: 100,
                status: "Adopt animals to evaluate habitat welfare.",
                social_minimum: None,
                preferred_group: None,
                space_per_animal: None,
            };
        };

        let preferred_group = species.preferred_group();
        let social_score = self
            .animals
            .saturating_mul(100)
            .checked_div(preferred_group)
            .unwrap_or(0)
            .min(100);
        let available_space = self.width.saturating_mul(self.height);
        let required_space = self.animals.saturating_mul(species.space_per_animal());
        let space_score = if required_space == 0 {
            100
        } else {
            available_space
                .saturating_mul(100)
                .checked_div(required_space)
                .unwrap_or(0)
                .min(100)
        };
        let target = (social_score + space_score) / 2;
        let status = if self.animals < species.social_minimum() && space_score < 100 {
            "This group needs more companions and more space."
        } else if self.animals < species.social_minimum() {
            "This species needs more companions."
        } else if space_score < 100 {
            "This habitat is crowded for this species."
        } else if self.animals < preferred_group {
            "The group is viable but would benefit from more companions."
        } else {
            "This habitat fits the current group's social and space needs."
        };

        WelfareProfile {
            social_score,
            space_score,
            target,
            status,
            social_minimum: Some(species.social_minimum()),
            preferred_group: Some(preferred_group),
            space_per_animal: Some(species.space_per_animal()),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WelfareProfile {
    social_score: u32,
    space_score: u32,
    target: u32,
    status: &'static str,
    social_minimum: Option<u32>,
    preferred_group: Option<u32>,
    space_per_animal: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum GuestState {''',
    "welfare profile",
)

lib = replace_once(
    lib,
    '''        let habitat = &mut self.habitats[index];
        habitat.species = Some(species);
        habitat.animals += 1;
        habitat.welfare = 96_u32.saturating_sub(habitat.animals.saturating_sub(2) * 4);
        self.recalculate_rating();''',
    '''        let habitat = &mut self.habitats[index];
        habitat.species = Some(species);
        habitat.animals += 1;
        self.recalculate_rating();''',
    "remove instant welfare",
)

lib = replace_once(
    lib,
    '''            if self.upkeep_accumulator >= 60 {
                self.upkeep_accumulator = 0;
                self.charge_upkeep();
            }

            self.advance_guest_needs();''',
    '''            if self.upkeep_accumulator >= 60 {
                self.upkeep_accumulator = 0;
                self.charge_upkeep();
            }

            self.advance_animal_welfare();
            self.advance_guest_needs();''',
    "tick animal welfare",
)

lib = replace_once(
    lib,
    '''    fn advance_guest_needs(&mut self) {
        for guest in &mut self.guests {''',
    '''    fn advance_animal_welfare(&mut self) {
        for habitat in &mut self.habitats {
            let target = habitat.welfare_profile().target;
            if habitat.welfare < target {
                habitat.welfare += 1;
            } else if habitat.welfare > target {
                habitat.welfare -= 1;
            }
        }
    }

    fn advance_guest_needs(&mut self) {
        for guest in &mut self.guests {''',
    "animal welfare progression",
)

old_map = '''        let habitats = self
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
                appeal: habitat.appeal(),
            })
            .collect();'''
new_map = '''        let habitats = self
            .habitats
            .iter()
            .map(|habitat| {
                let welfare = habitat.welfare_profile();
                HabitatView {
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
                    welfare_target: welfare.target,
                    social_score: welfare.social_score,
                    space_score: welfare.space_score,
                    welfare_status: welfare.status.to_owned(),
                    social_minimum: welfare.social_minimum,
                    preferred_group: welfare.preferred_group,
                    space_per_animal: welfare.space_per_animal,
                    appeal: habitat.appeal(),
                }
            })
            .collect();'''
lib = replace_once(lib, old_map, new_map, "habitat snapshot mapping")

lib = replace_once(
    lib,
    '''    capacity: u32,
    welfare: u32,
    appeal: u32,
}''',
    '''    capacity: u32,
    welfare: u32,
    welfare_target: u32,
    social_score: u32,
    space_score: u32,
    welfare_status: String,
    social_minimum: Option<u32>,
    preferred_group: Option<u32>,
    space_per_animal: Option<u32>,
    appeal: u32,
}''',
    "habitat view fields",
)

extra_tests = r'''

    #[test]
    fn species_have_distinct_social_requirements() {
        let mut capybaras = GameState::default();
        let mut flamingos = GameState::default();
        assert!(capybaras
            .place_habitat(3, 8, HabitatOrientation::Horizontal)
            .ok);
        assert!(flamingos
            .place_habitat(3, 8, HabitatOrientation::Horizontal)
            .ok);
        let capybara_habitat = capybaras.habitats[0].id;
        let flamingo_habitat = flamingos.habitats[0].id;
        assert!(capybaras.adopt(capybara_habitat, "capybara").ok);
        assert!(flamingos.adopt(flamingo_habitat, "flamingo").ok);

        let capybara_profile = capybaras.habitats[0].welfare_profile();
        let flamingo_profile = flamingos.habitats[0].welfare_profile();
        assert_eq!(capybara_profile.social_minimum, Some(2));
        assert_eq!(flamingo_profile.social_minimum, Some(3));
        assert!(capybara_profile.social_score > flamingo_profile.social_score);
    }

    #[test]
    fn capybara_group_trades_social_fit_for_space() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;
        for _ in 0..4 {
            assert!(state.adopt(habitat_id, "capybara").ok);
        }

        let profile = state.habitats[0].welfare_profile();
        assert_eq!(profile.social_score, 100);
        assert_eq!(profile.space_score, 75);
        assert_eq!(profile.target, 87);
        assert_eq!(profile.status, "This habitat is crowded for this species.");
    }

    #[test]
    fn flamingos_tolerate_density_but_prefer_a_larger_group() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;
        for _ in 0..3 {
            assert!(state.adopt(habitat_id, "flamingo").ok);
        }

        let three = state.habitats[0].welfare_profile();
        assert_eq!(three.social_minimum, Some(3));
        assert_eq!(three.preferred_group, Some(4));
        assert_eq!(three.space_score, 100);
        assert_eq!(three.social_score, 75);
        assert_eq!(
            three.status,
            "The group is viable but would benefit from more companions."
        );

        assert!(state.adopt(habitat_id, "flamingo").ok);
        let four = state.habitats[0].welfare_profile();
        assert_eq!(four.social_score, 100);
        assert_eq!(four.space_score, 100);
        assert_eq!(four.target, 100);
    }

    #[test]
    fn welfare_moves_gradually_toward_species_target() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;
        assert!(state.adopt(habitat_id, "capybara").ok);
        let target = state.habitats[0].welfare_profile().target;

        assert_eq!(state.habitats[0].welfare, 100);
        assert!(target < 100);
        state.tick(5);
        assert_eq!(state.habitats[0].welfare, 95);
        assert!(state.habitats[0].welfare > target);

        state.tick(100);
        assert_eq!(state.habitats[0].welfare, target);
    }
'''
head, tail = lib.rsplit("\n}", 1)
lib = head + extra_tests + "\n}\n" + tail
lib_path.write_text(lib)

app_path = Path("apps/web/src/App.tsx")
app = app_path.read_text()

app = replace_once(
    app,
    '''  capacity: number
  welfare: number
  appeal: number
}''',
    '''  capacity: number
  welfare: number
  welfare_target: number
  social_score: number
  space_score: number
  welfare_status: string
  social_minimum: number | null
  preferred_group: number | null
  space_per_animal: number | null
  appeal: number
}''',
    "frontend habitat welfare fields",
)

app = replace_once(
    app,
    '''                  <div><dt>Welfare</dt><dd>{selectedHabitat.welfare}%</dd></div>
                  <div><dt>Appeal</dt><dd>{selectedHabitat.appeal}</dd></div>
                </dl>
                <div className="meter"><span style={{width: `${selectedHabitat.welfare}%`}} /></div>
                <h3>Adopt animal</h3>''',
    '''                  <div><dt>Welfare</dt><dd>{selectedHabitat.welfare}% → {selectedHabitat.welfare_target}%</dd></div>
                  <div><dt>Appeal</dt><dd>{selectedHabitat.appeal}</dd></div>
                </dl>
                <div className="meter"><span style={{width: `${selectedHabitat.welfare}%`}} /></div>
                <h3>Habitat fit</h3>
                <div className="welfare-status">{selectedHabitat.welfare_status}</div>
                <dl className="welfare-details">
                  <div><dt>Social fit</dt><dd>{selectedHabitat.social_score}%</dd></div>
                  <div><dt>Space fit</dt><dd>{selectedHabitat.space_score}%</dd></div>
                  {selectedHabitat.social_minimum !== null && (
                    <div><dt>Group</dt><dd>min {selectedHabitat.social_minimum} · prefer {selectedHabitat.preferred_group}</dd></div>
                  )}
                  {selectedHabitat.space_per_animal !== null && (
                    <div><dt>Space need</dt><dd>{selectedHabitat.space_per_animal} tiles / animal</dd></div>
                  )}
                </dl>
                <h3>Adopt animal</h3>''',
    "habitat welfare inspector",
)

app_path.write_text(app)

styles_path = Path("apps/web/src/styles.css")
styles = styles_path.read_text()
styles += '''

.welfare-status {
  margin: 8px 0 10px;
  padding: 9px 10px;
  border: 1px solid #8b8668;
  border-radius: 4px;
  background: #f3edcc;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.35;
}

.welfare-details {
  margin-bottom: 18px;
}

.welfare-details dd {
  max-width: 150px;
  text-align: right;
}
'''
styles_path.write_text(styles)
