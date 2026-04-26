use std::error::Error;
use zoo_game::{new_zoo_state, zoo_view};

fn main() -> Result<(), Box<dyn Error>> {
    let state = new_zoo_state()?;
    let view = zoo_view(&state);

    println!("Zoo opening snapshot at {}s", state.now_seconds());
    println!("Resources");
    for resource in &view.resources {
        match resource.capacity {
            Some(capacity) => println!("- {}: {} / {}", resource.label, resource.amount, capacity),
            None => println!("- {}: {}", resource.label, resource.amount),
        }
    }

    println!();
    println!("Buildings");
    for building in &view.buildings {
        println!(
            "- {} at ({}, {}) workers {}/{}",
            building.label,
            building.location.x,
            building.location.y,
            building.assigned_workers,
            building.required_workers
        );
    }

    Ok(())
}
