//! Zoo-specific scene and camera interaction policy.
//!
//! Generic view/projection math remains owned by `three-d-camera`. This crate owns only the
//! management-game policy needed to frame and manipulate a Zoo park view.

use core::fmt;
use serde::Serialize;
use three_d_camera::{CameraError, PerspectiveCamera};
use three_d_core::Vec3;
use wasm_bindgen::prelude::*;

const DEFAULT_YAW_DEGREES: f32 = 42.0;
const DEFAULT_PITCH_DEGREES: f32 = 38.0;
const MIN_PITCH_DEGREES: f32 = 22.0;
const MAX_PITCH_DEGREES: f32 = 68.0;
const MIN_ZOOM: f32 = 0.55;
const MAX_ZOOM: f32 = 2.0;
const ORBIT_STEP_DEGREES: f32 = 45.0;
const FOV_Y_DEGREES: f32 = 46.0;
const CAMERA_PADDING: f32 = 1.12;
const SCENE_TARGET_HEIGHT: f32 = 0.45;
const SCENE_MAX_HEIGHT: f32 = 3.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParkCameraError {
    InvalidParkExtent,
    InvalidAspect,
    InvalidZoomFactor,
    SharedCamera(CameraError),
}

impl fmt::Display for ParkCameraError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidParkExtent => {
                formatter.write_str("park width and depth must be finite and positive")
            }
            Self::InvalidAspect => {
                formatter.write_str("viewport aspect must be finite and positive")
            }
            Self::InvalidZoomFactor => {
                formatter.write_str("zoom factor must be finite and positive")
            }
            Self::SharedCamera(error) => write!(formatter, "shared camera rejected view: {error}"),
        }
    }
}

impl std::error::Error for ParkCameraError {}

impl From<CameraError> for ParkCameraError {
    fn from(value: CameraError) -> Self {
        Self::SharedCamera(value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ParkCameraRig {
    target: Vec3,
    park_width: f32,
    park_depth: f32,
    yaw_degrees: f32,
    pitch_degrees: f32,
    zoom: f32,
}

impl ParkCameraRig {
    pub fn new(park_width: f32, park_depth: f32) -> Result<Self, ParkCameraError> {
        if !park_width.is_finite()
            || !park_depth.is_finite()
            || park_width <= 0.0
            || park_depth <= 0.0
        {
            return Err(ParkCameraError::InvalidParkExtent);
        }

        Ok(Self {
            // Zoo world coordinates now use real tile centers: tile (x, z) occupies
            // [x, x + 1] × [z, z + 1]. There is no legacy isometric anchor offset.
            target: Vec3::new(park_width * 0.5, SCENE_TARGET_HEIGHT, park_depth * 0.5),
            park_width,
            park_depth,
            yaw_degrees: DEFAULT_YAW_DEGREES,
            pitch_degrees: DEFAULT_PITCH_DEGREES,
            zoom: 1.0,
        })
    }

    pub fn target(self) -> Vec3 {
        self.target
    }

    pub fn yaw_degrees(self) -> f32 {
        self.yaw_degrees
    }

    pub fn pitch_degrees(self) -> f32 {
        self.pitch_degrees
    }

    pub fn zoom(self) -> f32 {
        self.zoom
    }

    pub fn rotate_steps(&mut self, steps: i32) {
        self.yaw_degrees = (self.yaw_degrees + steps as f32 * ORBIT_STEP_DEGREES).rem_euclid(360.0);
    }

    pub fn tilt_by_degrees(&mut self, delta_degrees: f32) {
        if delta_degrees.is_finite() {
            self.pitch_degrees =
                (self.pitch_degrees + delta_degrees).clamp(MIN_PITCH_DEGREES, MAX_PITCH_DEGREES);
        }
    }

    pub fn zoom_by_factor(&mut self, factor: f32) -> Result<(), ParkCameraError> {
        if !factor.is_finite() || factor <= 0.0 {
            return Err(ParkCameraError::InvalidZoomFactor);
        }
        self.zoom = (self.zoom * factor).clamp(MIN_ZOOM, MAX_ZOOM);
        Ok(())
    }

    fn scene_radius(self) -> f32 {
        let half_width = self.park_width * 0.5;
        let half_depth = self.park_depth * 0.5;
        let vertical_extent = SCENE_MAX_HEIGHT - self.target.y;
        (half_width * half_width + half_depth * half_depth + vertical_extent * vertical_extent)
            .sqrt()
    }

    fn limiting_half_fov(self, aspect: f32) -> f32 {
        let half_vertical = FOV_Y_DEGREES.to_radians() * 0.5;
        let half_horizontal = (half_vertical.tan() * aspect).atan();
        half_vertical.min(half_horizontal)
    }

    pub fn camera(self, aspect: f32) -> Result<PerspectiveCamera, ParkCameraError> {
        if !aspect.is_finite() || aspect <= 0.0 {
            return Err(ParkCameraError::InvalidAspect);
        }

        let radius = self.scene_radius();
        let half_fov = self.limiting_half_fov(aspect);
        let distance = radius * CAMERA_PADDING / half_fov.sin() / self.zoom;
        let pitch = self.pitch_degrees.to_radians();
        let yaw = self.yaw_degrees.to_radians();
        let horizontal_distance = distance * pitch.cos();
        let eye = Vec3::new(
            self.target.x + horizontal_distance * yaw.sin(),
            self.target.y + distance * pitch.sin(),
            self.target.z + horizontal_distance * yaw.cos(),
        );
        let near = (distance - radius * 1.2).max(0.05);
        let far = distance + radius * 3.0 + SCENE_MAX_HEIGHT;

        Ok(PerspectiveCamera::new(
            eye,
            self.target,
            Vec3::new(0.0, 1.0, 0.0),
            FOV_Y_DEGREES.to_radians(),
            aspect,
            near,
            far,
        )?)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserCameraFrame {
    view_matrix: [f32; 16],
    projection_matrix: [f32; 16],
    yaw_degrees: f32,
    pitch_degrees: f32,
    zoom: f32,
}

impl BrowserCameraFrame {
    fn from_rig(rig: ParkCameraRig, aspect: f32) -> Result<Self, ParkCameraError> {
        let camera = rig.camera(aspect)?;
        Ok(Self {
            view_matrix: camera.view_matrix().elements,
            projection_matrix: camera.projection_matrix().elements,
            yaw_degrees: rig.yaw_degrees(),
            pitch_degrees: rig.pitch_degrees(),
            zoom: rig.zoom(),
        })
    }
}

fn js_error(error: impl fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

#[wasm_bindgen]
pub struct ParkCameraBridge {
    rig: ParkCameraRig,
}

#[wasm_bindgen]
impl ParkCameraBridge {
    #[wasm_bindgen(constructor)]
    pub fn new(park_width: f32, park_depth: f32) -> Result<ParkCameraBridge, JsValue> {
        Ok(Self {
            rig: ParkCameraRig::new(park_width, park_depth).map_err(js_error)?,
        })
    }

    pub fn rotate_steps(&mut self, steps: i32) {
        self.rig.rotate_steps(steps);
    }

    pub fn tilt_by_degrees(&mut self, delta_degrees: f32) {
        self.rig.tilt_by_degrees(delta_degrees);
    }

    pub fn zoom_by_factor(&mut self, factor: f32) -> Result<(), JsValue> {
        self.rig.zoom_by_factor(factor).map_err(js_error)
    }

    pub fn frame_json(&self, aspect: f32) -> Result<String, JsValue> {
        let frame = BrowserCameraFrame::from_rig(self.rig, aspect).map_err(js_error)?;
        serde_json::to_string(&frame).map_err(js_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_scene_inside_camera(
        rig: ParkCameraRig,
        park_width: f32,
        park_depth: f32,
        aspect: f32,
    ) {
        let camera = rig.camera(aspect).expect("camera is valid");
        let matrix = camera.view_projection_matrix();

        for x in [0.0, park_width] {
            for z in [0.0, park_depth] {
                for y in [0.0, SCENE_MAX_HEIGHT] {
                    let projected = matrix.transform_point(Vec3::new(x, y, z));
                    assert!(
                        projected.x.abs() <= 1.0 && projected.y.abs() <= 1.0,
                        "scene corner escaped shared clip volume at yaw {} pitch {}: ({}, {})",
                        rig.yaw_degrees(),
                        rig.pitch_degrees(),
                        projected.x,
                        projected.y
                    );
                }
            }
        }
    }

    #[test]
    fn rejects_invalid_park_extent() {
        assert_eq!(
            ParkCameraRig::new(0.0, 14.0),
            Err(ParkCameraError::InvalidParkExtent)
        );
        assert_eq!(
            ParkCameraRig::new(20.0, f32::NAN),
            Err(ParkCameraError::InvalidParkExtent)
        );
    }

    #[test]
    fn centers_scene_on_real_world_coordinates() {
        let rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");
        assert_eq!(rig.target(), Vec3::new(10.0, SCENE_TARGET_HEIGHT, 7.0));
    }

    #[test]
    fn canonical_view_preserves_grid_axes() {
        let rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");
        let camera = rig.camera(1240.0 / 720.0).expect("camera is valid");
        let matrix = camera.view_projection_matrix();
        let center = matrix.transform_point(Vec3::new(2.5, 0.0, 8.5));
        let plus_x = matrix.transform_point(Vec3::new(3.5, 0.0, 8.5));
        let plus_z = matrix.transform_point(Vec3::new(2.5, 0.0, 9.5));

        assert!(plus_x.x > center.x);
        assert!(plus_z.x < center.x);
    }

    #[test]
    fn full_orbit_returns_to_original_yaw() {
        let mut rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");
        let initial_yaw = rig.yaw_degrees();

        rig.rotate_steps(8);

        assert_eq!(rig.yaw_degrees(), initial_yaw);
    }

    #[test]
    fn tilt_stays_inside_management_view_bounds() {
        let mut rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");

        rig.tilt_by_degrees(100.0);
        assert_eq!(rig.pitch_degrees(), MAX_PITCH_DEGREES);

        rig.tilt_by_degrees(-200.0);
        assert_eq!(rig.pitch_degrees(), MIN_PITCH_DEGREES);
    }

    #[test]
    fn perspective_camera_keeps_full_scene_inside_frustum_through_orbit() {
        let mut rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");

        for pitch_delta in [-100.0, 0.0, 100.0] {
            let mut pitched = rig;
            pitched.tilt_by_degrees(pitch_delta);
            for _ in 0..8 {
                assert_scene_inside_camera(pitched, 20.0, 14.0, 1240.0 / 720.0);
                pitched.rotate_steps(1);
            }
        }

        rig.rotate_steps(8);
        assert_eq!(rig.yaw_degrees(), DEFAULT_YAW_DEGREES);
    }

    #[test]
    fn zoom_moves_perspective_camera_without_moving_target() {
        let mut rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");
        let initial_target = rig.target();
        let initial = rig.camera(16.0 / 9.0).expect("camera is valid");

        rig.zoom_by_factor(1.5).expect("zoom factor is valid");
        let zoomed = rig.camera(16.0 / 9.0).expect("camera is valid");

        assert_eq!(rig.target(), initial_target);
        assert_eq!(initial.target, zoomed.target);

        let initial_distance = ((initial.eye.x - initial.target.x).powi(2)
            + (initial.eye.y - initial.target.y).powi(2)
            + (initial.eye.z - initial.target.z).powi(2))
        .sqrt();
        let zoomed_distance = ((zoomed.eye.x - zoomed.target.x).powi(2)
            + (zoomed.eye.y - zoomed.target.y).powi(2)
            + (zoomed.eye.z - zoomed.target.z).powi(2))
        .sqrt();

        assert!(zoomed_distance < initial_distance);
    }

    #[test]
    fn rejects_invalid_viewport_and_zoom_inputs() {
        let mut rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");

        assert_eq!(rig.camera(0.0), Err(ParkCameraError::InvalidAspect));
        assert_eq!(
            rig.zoom_by_factor(f32::INFINITY),
            Err(ParkCameraError::InvalidZoomFactor)
        );
    }

    #[test]
    fn browser_frame_uses_shared_perspective_camera_matrices() {
        let rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");
        let shared = rig.camera(16.0 / 9.0).expect("shared camera is valid");
        let frame = BrowserCameraFrame::from_rig(rig, 16.0 / 9.0).expect("frame is valid");

        assert_eq!(frame.view_matrix, shared.view_matrix().elements);
        assert_eq!(frame.projection_matrix, shared.projection_matrix().elements);
        assert_eq!(frame.yaw_degrees, DEFAULT_YAW_DEGREES);
        assert_eq!(frame.pitch_degrees, DEFAULT_PITCH_DEGREES);
        assert_eq!(frame.zoom, 1.0);
    }
}
