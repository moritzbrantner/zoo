from pathlib import Path

path = Path("crates/zoo-core/src/lib.rs")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    text = text.replace(old, new, 1)


replace_once(
'''    fn concession_service_tile(&self, concession_id: u32) -> Option<Position> {
        let stand = self
            .concessions
            .iter()
            .find(|stand| stand.id == concession_id)?;
        self.neighbors(Position {
            x: stand.x,
            y: stand.y,
        })
        .into_iter()
        .find(|position| self.is_walkable(*position))
    }
''',
'''    fn concession_service_tiles(&self, concession_id: u32) -> Vec<Position> {
        let Some(stand) = self
            .concessions
            .iter()
            .find(|stand| stand.id == concession_id)
        else {
            return Vec::new();
        };
        self.neighbors(Position {
            x: stand.x,
            y: stand.y,
        })
        .into_iter()
        .filter(|position| self.is_walkable(*position))
        .collect()
    }

    fn concession_service_tile_from(
        &self,
        concession_id: u32,
        start: Position,
    ) -> Option<Position> {
        self.concession_service_tiles(concession_id)
            .into_iter()
            .filter_map(|target| {
                self.path_between(start, target)
                    .map(|route| (route.len(), target))
            })
            .min_by_key(|(route_len, target)| (*route_len, target.y, target.x))
            .map(|(_, target)| target)
    }
''',
"service tile helpers",
)

replace_once(
'''            let target = self
                .maintenance
                .iter()
                .find(|task| task.id == task_id)
                .and_then(|task| self.concession_service_tile(task.concession_id));
            let reachable =
                target.is_some_and(|target| self.path_between(mechanic_position, target).is_some());
''',
'''            let target = self
                .maintenance
                .iter()
                .find(|task| task.id == task_id)
                .and_then(|task| {
                    self.concession_service_tile_from(task.concession_id, mechanic_position)
                });
            let reachable = target.is_some();
''',
"release unreachable mechanic assignment",
)

replace_once(
'''                .filter(|task| {
                    self.concession_service_tile(task.concession_id)
                        .is_some_and(|target| {
                            self.path_between(mechanic_position, target).is_some()
                        })
                })
''',
'''                .filter(|task| {
                    self.concession_service_tile_from(task.concession_id, mechanic_position)
                        .is_some()
                })
''',
"assign reachable mechanic task",
)

replace_once(
'''            let Some(target) = self
                .maintenance
                .iter()
                .find(|task| task.id == task_id)
                .and_then(|task| self.concession_service_tile(task.concession_id))
            else {
                self.mechanics[mechanic_index].target_maintenance_id = None;
                continue;
            };
            let current = Position {
                x: self.mechanics[mechanic_index].x,
                y: self.mechanics[mechanic_index].y,
            };
''',
'''            let current = Position {
                x: self.mechanics[mechanic_index].x,
                y: self.mechanics[mechanic_index].y,
            };
            let Some(concession_id) = self
                .maintenance
                .iter()
                .find(|task| task.id == task_id)
                .map(|task| task.concession_id)
            else {
                self.mechanics[mechanic_index].target_maintenance_id = None;
                continue;
            };
            let Some(target) = self.concession_service_tile_from(concession_id, current) else {
                self.mechanics[mechanic_index].target_maintenance_id = None;
                continue;
            };
''',
"advance mechanic reachable target",
)

replace_once(
'''            let at_service_tile = self
                .concession_service_tile(task.concession_id)
                .is_some_and(|target| target.x == mechanic.x && target.y == mechanic.y);
''',
'''            let position = Position {
                x: mechanic.x,
                y: mechanic.y,
            };
            let at_service_tile = self
                .concession_service_tiles(task.concession_id)
                .contains(&position);
''',
"mechanic at any service tile",
)

replace_once(
'''        let reachable = self.maintenance.iter().any(|task| {
            self.concession_service_tile(task.concession_id)
                .is_some_and(|target| self.path_between(position, target).is_some())
        });
''',
'''        let reachable = self.maintenance.iter().any(|task| {
            self.concession_service_tile_from(task.concession_id, position)
                .is_some()
        });
''',
"mechanic status reachable work",
)

replace_once(
'''    fn maintenance_status(&self, task: &MaintenanceTask) -> String {
        let Some(target) = self.concession_service_tile(task.concession_id) else {
            return "Blocked · stand has no path service point".to_owned();
        };
        if let Some(mechanic_id) = task.assigned_mechanic_id
            && let Some(mechanic) = self
                .mechanics
                .iter()
                .find(|mechanic| mechanic.id == mechanic_id)
        {
            let reachable = self
                .path_between(
                    Position {
                        x: mechanic.x,
                        y: mechanic.y,
                    },
                    target,
                )
                .is_some();
            return if reachable {
                format!("Mechanic #{mechanic_id} responding")
            } else {
                format!("Blocked · Mechanic #{mechanic_id} route disconnected")
            };
        }
        if self.mechanics.is_empty() {
            return "Waiting · no mechanic hired".to_owned();
        }
        if self.mechanics.iter().any(|mechanic| {
            self.path_between(
                Position {
                    x: mechanic.x,
                    y: mechanic.y,
                },
                target,
            )
            .is_some()
        }) {
            "Waiting for an available mechanic".to_owned()
        } else {
            "Blocked · disconnected from mechanics".to_owned()
        }
    }
''',
'''    fn maintenance_status(&self, task: &MaintenanceTask) -> String {
        if self.concession_service_tiles(task.concession_id).is_empty() {
            return "Blocked · stand has no path service point".to_owned();
        }
        if let Some(mechanic_id) = task.assigned_mechanic_id
            && let Some(mechanic) = self
                .mechanics
                .iter()
                .find(|mechanic| mechanic.id == mechanic_id)
        {
            let position = Position {
                x: mechanic.x,
                y: mechanic.y,
            };
            let reachable = self
                .concession_service_tile_from(task.concession_id, position)
                .is_some();
            return if reachable {
                format!("Mechanic #{mechanic_id} responding")
            } else {
                format!("Blocked · Mechanic #{mechanic_id} route disconnected")
            };
        }
        if self.mechanics.is_empty() {
            return "Waiting · no mechanic hired".to_owned();
        }
        if self.mechanics.iter().any(|mechanic| {
            self.concession_service_tile_from(
                task.concession_id,
                Position {
                    x: mechanic.x,
                    y: mechanic.y,
                },
            )
            .is_some()
        }) {
            "Waiting for an available mechanic".to_owned()
        } else {
            "Blocked · disconnected from mechanics".to_owned()
        }
    }
''',
"maintenance status all service points",
)

anchor = '''    #[test]
    fn unreachable_maintenance_remains_backlogged_and_reports_blocked() {
'''
regression = '''    #[test]
    fn mechanic_chooses_reachable_service_tile_across_split_path_components() {
        let mut state = GameState::default();
        assert!(state.place_path(5, ENTRANCE_Y).ok);
        assert!(state.place_path(6, ENTRANCE_Y).ok);
        assert!(state.place_concession(6, ENTRANCE_Y - 1, "food").ok);

        // The north service tile is an isolated path component and appears before the
        // reachable south tile in neighbor order. Mechanics must consider both.
        state.set_tile(6, ENTRANCE_Y - 2, TileKind::Path);
        state.concessions[0].condition = 50;
        let concession_id = state.concessions[0].id;
        assert!(state.ensure_maintenance_task(concession_id));
        let task_id = state.maintenance[0].id;
        assert!(state.hire_mechanic().ok);

        state.assign_mechanic_tasks();

        assert_eq!(state.mechanics[0].target_maintenance_id, Some(task_id));
        assert!(!state.maintenance_status(&state.maintenance[0]).contains("Blocked"));

        for _ in 0..8 {
            state.advance_mechanic_work();
            if state.maintenance.is_empty() {
                break;
            }
        }

        assert!(state.maintenance.is_empty());
        assert_eq!(state.concessions[0].condition, 100);
        assert_eq!(state.mechanics[0].repairs_completed, 1);
    }

'''
if text.count(anchor) != 1:
    raise SystemExit(f"regression test anchor count: {text.count(anchor)}")
text = text.replace(anchor, regression + anchor, 1)

path.write_text(text)
