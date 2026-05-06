use super::systems::{
    clear_events_system, compute_summary_system, count_assignments_system,
    verify_animals_have_locations_system,
};
use bevy_ecs::schedule::{IntoScheduleConfigs, Schedule};

pub(crate) fn zoo_schedule() -> Schedule {
    let mut schedule = Schedule::default();
    schedule.add_systems(
        (
            clear_events_system,
            count_assignments_system,
            verify_animals_have_locations_system,
            compute_summary_system,
        )
            .chain(),
    );
    schedule
}
