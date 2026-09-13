//! Zoo-specific scene and camera interaction policy.
//!
//! Generic view/projection math remains owned by `three-d-camera`. This crate owns only the
//! management-game policy needed to frame and manipulate a Zoo park view.

use core::fmt;
use serde::Serialize;
use three_d_camera::{CameraError, OrthographicCamera};
use three_d_core::Vec3;
use wasm_bindgen::prelude::*;

const DEFAULT_YAW_DEGREES: f32 = 45.0;
const DEFAULT_PITCH_DEGREES: f32 = 31.15;
const MIN_PITCH_DEGREES: f32 = 20.0;
const MAX_PITCH_DEGREES: f32 = 70.0;
const MIN_ZOOM: f32 = 0.35;
const MAX_ZOOM: f32 = 4.0;
const ORBIT_STEP_DEGREES: f32 = 45.0;
const PARK_FRAMING_HALF_HEIGHT_FACTOR: f32 = 0.439;

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
    park_span: f32,
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

        // Zoo's legacy isometric DOM grid anchors each tile at its left diamond vertex. The
        // reusable renderer uses the tile's actual 3D center at (x + 1, z), so the scene center
        // is shifted by (+0.5, -0.5) relative to width/2, depth/2. Keeping that mapping here
        // lets the migration preserve existing hit targets while projection itself stays shared.
        Ok(Self {
            target: Vec3::new((park_width + 1.0) * 0.5, 0.0, (park_depth - 1.0) * 0.5),
            park_span: park_width.max(park_depth),
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
        self.yaw_degrees =
            (self.yaw_degrees + steps as f32 * ORBIT_STEP_DEGREES).rem_euclid(360.0);
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

    pub fn camera(self, aspect: f32) -> Result<OrthographicCamera, ParkCameraError> {
        if !aspect.is_finite() || aspect <= 0.0 {
            return Err(ParkCameraError::InvalidAspect);
        }

        let pitch = self.pitch_degrees.to_radians();
        let yaw = self.yaw_degrees.to_radians();
        let distance = self.park_span * 2.0 + 1.0;
        let horizontal_distance = distance * pitch.cos();
        let eye = Vec3::new(
            self.target.x + horizontal_distance * yaw.sin(),
            self.target.y + distance * pitch.sin(),
            self.target.z + horizontal_distance * yaw.cos(),
        );
        let half_height = self.park_span * PARK_FRAMING_HALF_HEIGHT_FACTOR / self.zoom;
        let half_width = half_height * aspect;
        let near = 0.1;
        let far = distance * 4.0 + self.park_span;

        Ok(OrthographicCamera::new(
            eye,
            self.target,
            Vec3::new(0.0, 1.0, 0.0),
            -half_width,
            half_width,
            -half_height,
            half_height,
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
    fn centers_scene_on_renderer_tile_coordinates() {
        let rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");
        assert_eq!(rig.target(), Vec3::new(10.5, 0.0, 6.5));
    }

    #[test]
    fn canonical_view_preserves_legacy_grid_axes() {
        let rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");
        let camera = rig.camera(1240.0 / 720.0).expect("camera is valid");
        let matrix = camera.view_projection_matrix();
        let center = matrix.transform_point(Vec3::new(2.0, 0.0, 8.0));
        let plus_x = matrix.transform_point(Vec3::new(3.0, 0.0, 8.0));
        let plus_z = matrix.transform_point(Vec3::new(2.0, 0.0, 9.0));

        assert!(plus_x.x > center.x);
        assert!(plus_x.y < center.y);
        assert!(plus_z.x < center.x);
        assert!(plus_z.y < center.y);
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
    fn zoom_changes_shared_orthographic_volume_without_moving_target() {
        let mut rig = ParkCameraRig::new(20.0, 14.0).expect("park extent is valid");
        let initial_target = rig.target();
        let initial = rig.camera(16.0 / 9.0).expect("camera is valid");

        rig.zoom_by_factor(2.0).expect("zoom factor is valid");
        let zoomed = rig.camera(16.0 / 9.0).expect("camera is valid");

        assert_eq!(rig.target(), initial_target);
        assert_eq!(initial.target, zoomed.target);
        assert!(zoomed.right - zoomed.left < initial.right - initial.left);
        assert!(zoomed.top - zoomed.bottom < initial.top - initial.bottom);
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
    fn browser_frame_uses_shared_camera_matrices() {
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
