use farm_engine::MapLocation;
use zoo_game::{EXCITEMENT, GUEST, SAVANNA_HABITAT, ZOO_SIZE, ZooLogic, new_zoo_state};

#[test]
fn guest_excitement_rises_near_habitats_and_falls_away_from_them() {
    let mut state = new_zoo_state().unwrap();
    let mut logic = ZooLogic;
    let zoo_center = ZOO_SIZE / 2;
    state
        .start_construction_at(SAVANNA_HABITAT, MapLocation::new(zoo_center + 2, 3))
        .unwrap();
    state.advance_time_with_logic(24, &mut logic).unwrap();

    let mira = state
        .entities()
        .find(|entity| entity.kind() == GUEST && entity.name.as_deref() == Some("Mira"))
        .expect("guest should exist")
        .id;
    state.set_entity_stat(mira, EXCITEMENT, 20).unwrap();
    state.advance_time_with_logic(30, &mut logic).unwrap();
    let near_habitat = state.entity_stat(mira, EXCITEMENT).unwrap();

    state
        .move_entity(mira, MapLocation::new(zoo_center + 1, 12))
        .unwrap();
    state.advance_time_with_logic(30, &mut logic).unwrap();
    let far_from_habitat = state.entity_stat(mira, EXCITEMENT).unwrap();

    assert!(near_habitat > 20);
    assert!(far_from_habitat < near_habitat);
}
