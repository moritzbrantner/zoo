from pathlib import Path

path = Path("crates/zoo-core/src/lib.rs")
text = path.read_text()

replacements = [
    (
        """            if let Some(task) = self.litter.iter_mut().find(|task| task.id == litter_id) {\n                if task.assigned_janitor_id == Some(janitor_id) {\n                    task.assigned_janitor_id = None;\n                }\n            }\n""",
        """            if let Some(task) = self.litter.iter_mut().find(|task| task.id == litter_id)\n                && task.assigned_janitor_id == Some(janitor_id)\n            {\n                task.assigned_janitor_id = None;\n            }\n""",
    ),
    (
        """        if let Some(litter_id) = janitor.target_litter_id {\n            if let Some(task) = self.litter.iter().find(|task| task.id == litter_id) {\n                let age = self.absolute_minute().saturating_sub(task.created_minute);\n                return format!(\"Cleaning litter #{litter_id} · {age} min old\");\n            }\n        }\n""",
        """        if let Some(litter_id) = janitor.target_litter_id\n            && let Some(task) = self.litter.iter().find(|task| task.id == litter_id)\n        {\n            let age = self.absolute_minute().saturating_sub(task.created_minute);\n            return format!(\"Cleaning litter #{litter_id} · {age} min old\");\n        }\n""",
    ),
    (
        """        if let Some(janitor_id) = task.assigned_janitor_id {\n            if let Some(janitor) = self\n                .janitors\n                .iter()\n                .find(|janitor| janitor.id == janitor_id)\n            {\n                let reachable = self\n                    .path_between(\n                        Position {\n                            x: janitor.x,\n                            y: janitor.y,\n                        },\n                        target,\n                    )\n                    .is_some();\n                return if reachable {\n                    format!(\"Janitor #{janitor_id} responding\")\n                } else {\n                    format!(\"Blocked · Janitor #{janitor_id} route disconnected\")\n                };\n            }\n        }\n""",
        """        if let Some(janitor_id) = task.assigned_janitor_id\n            && let Some(janitor) = self\n                .janitors\n                .iter()\n                .find(|janitor| janitor.id == janitor_id)\n        {\n            let reachable = self\n                .path_between(\n                    Position {\n                        x: janitor.x,\n                        y: janitor.y,\n                    },\n                    target,\n                )\n                .is_some();\n            return if reachable {\n                format!(\"Janitor #{janitor_id} responding\")\n            } else {\n                format!(\"Blocked · Janitor #{janitor_id} route disconnected\")\n            };\n        }\n""",
    ),
]

for old, new in replacements:
    if text.count(old) != 1:
        raise SystemExit(f"expected one clippy normalization anchor, found {text.count(old)}")
    text = text.replace(old, new, 1)

path.write_text(text)
