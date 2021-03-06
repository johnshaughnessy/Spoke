import { Spoke, SpokeMapping } from "./input-mappings";
import THREE from "../../vendor/three";
import SpokeTransformControls from "./SpokeTransformControls";
import getIntersectingNode from "../utils/getIntersectingNode";

export default class SpokeControls {
  constructor(camera, editor, inputManager, flyControls) {
    this.camera = camera;
    this.editor = editor;
    this.inputManager = inputManager;
    this.flyControls = flyControls;
    this.enabled = false;
    this.normalMatrix = new THREE.Matrix3();
    this.vector = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.center = new THREE.Vector3();
    this.spherical = new THREE.Spherical();
    this.panSpeed = 0.002;
    this.zoomSpeed = 0.1;
    this.orbitSpeed = 0.005;
    this.lookSensitivity = 5;
    this.boostSpeed = 4;
    this.moveSpeed = 4;
    this.initialLookSensitivity = flyControls.lookSensitivity;
    this.initialBoostSpeed = flyControls.boostSpeed;
    this.initialMoveSpeed = flyControls.moveSpeed;
    this.distance = 0;
    this.maxFocusDistance = 1000;
    this.raycaster = new THREE.Raycaster();
    this.scene = null;
    this.box = new THREE.Box3();
    this.sphere = new THREE.Sphere();
    this.transformControls = new SpokeTransformControls(camera);
    this.objectPositionOnDown = null;
    this.objectRotationOnDown = null;
    this.objectScaleOnDown = null;
    this.snapEnabled = false;
    this.translationSnap = 1;
    this.rotationSnap = Math.PI / 4;
    this.currentSpace = "world";
    this.updateSnapSettings();
    this.wasOrbiting = false;
  }

  onSceneSet(scene) {
    this.scene = scene;
    scene.add(this.transformControls);
  }

  enable() {
    this.enabled = true;
    this.inputManager.enableInputMapping(Spoke, SpokeMapping);
  }

  disable() {
    this.enabled = false;
    this.inputManager.disableInputMapping(Spoke);
  }

  update() {
    if (!this.enabled) return;

    const input = this.inputManager;
    const transformControls = this.transformControls;

    if (input.get(Spoke.enableFlyMode)) {
      this.flyControls.enable();
      this.initialLookSensitivity = this.flyControls.lookSensitivity;
      this.initialMoveSpeed = this.flyControls.moveSpeed;
      this.initialBoostSpeed = this.flyControls.boostSpeed;
      this.flyControls.lookSensitivity = this.lookSensitivity;
      this.flyControls.moveSpeed = this.moveSpeed;
      this.flyControls.boostSpeed = this.boostSpeed;
      this.distance = this.camera.position.distanceTo(this.center);
    } else if (input.get(Spoke.disableFlyMode)) {
      this.flyControls.disable();
      this.flyControls.lookSensitivity = this.initialLookSensitivity;
      this.flyControls.boostSpeed = this.initialBoostSpeed;
      this.flyControls.moveSpeed = this.initialMoveSpeed;
      this.center.addVectors(
        this.camera.position,
        this.vector.set(0, 0, -this.distance).applyMatrix3(this.normalMatrix.getNormalMatrix(this.camera.matrix))
      );
    }

    if (input.get(Spoke.flyMode)) return;

    const zoom = input.get(Spoke.zoom);

    if (zoom !== 0) {
      const camera = this.camera;
      const delta = this.delta;
      const center = this.center;

      delta.set(0, 0, zoom);

      const distance = camera.position.distanceTo(center);

      delta.multiplyScalar(distance * this.zoomSpeed);

      if (delta.length() > distance) return;

      delta.applyMatrix3(this.normalMatrix.getNormalMatrix(camera.matrix));

      camera.position.add(delta);
    } else if (input.get(Spoke.pan)) {
      const camera = this.camera;
      const delta = this.delta;
      const center = this.center;

      const dx = input.get(Spoke.mouseDeltaX);
      const dy = input.get(Spoke.mouseDeltaY);

      const distance = camera.position.distanceTo(center);

      delta
        .set(-dx, dy, 0)
        .multiplyScalar(distance * this.panSpeed)
        .applyMatrix3(this.normalMatrix.getNormalMatrix(this.camera.matrix));

      camera.position.add(delta);
      center.add(delta);
    } else if (input.get(Spoke.orbit) && !transformControls.dragging) {
      const camera = this.camera;
      const center = this.center;
      const vector = this.vector;
      const spherical = this.spherical;

      const dx = input.get(Spoke.mouseDeltaX);
      const dy = input.get(Spoke.mouseDeltaY);

      vector.copy(camera.position).sub(center);

      spherical.setFromVector3(vector);

      spherical.theta += -dx * this.orbitSpeed;
      spherical.phi += -dy * this.orbitSpeed;

      spherical.makeSafe();

      vector.setFromSpherical(spherical);

      camera.position.copy(center).add(vector);

      camera.lookAt(center);

      transformControls.update(this.raycaster, false, false);

      this.wasOrbiting = true;
      return;
    }

    const selecting = input.get(Spoke.selecting);
    const selectEnd = input.get(Spoke.selectEnd);
    const snapModifier = input.get(Spoke.snapModifier);

    // TODO: Replace wasOrbiting with a rising action getter ex: input.actionRising(Spoke.orbit)
    if (selectEnd && !transformControls.dragging && !this.wasOrbiting) {
      this.raycaster.setFromCamera(input.get(Spoke.selectCoords), this.camera);
      const results = this.raycaster.intersectObject(this.scene, true);
      const result = getIntersectingNode(results, this.scene);

      if (result) {
        this.editor.select(result.node);
      } else {
        this.editor.deselect();
      }
    }

    this.wasOrbiting = false;

    const focusScreenCoords = input.get(Spoke.focus);

    if (focusScreenCoords) {
      this.raycaster.setFromCamera(focusScreenCoords, this.camera);
      const results = this.raycaster.intersectObject(this.scene, true);
      const result = getIntersectingNode(results, this.scene);

      if (result) {
        this.focus(result.node);
      }
    }

    const moveScreenCoords = input.get(Spoke.move);

    if (moveScreenCoords) {
      this.raycaster.setFromCamera(moveScreenCoords, this.camera);
    }

    // Update Transform Controls selection
    const editorSelection = this.editor.selected;

    if (editorSelection !== transformControls.object) {
      if (
        editorSelection !== null &&
        editorSelection !== this.editor.scene &&
        editorSelection !== this.camera &&
        !(editorSelection.constructor && editorSelection.constructor.disableTransform)
      ) {
        transformControls.object = editorSelection;
      } else {
        transformControls.object = null;
      }
    }

    transformControls.update(this.raycaster, selecting, this.snapEnabled == !snapModifier);

    const object = transformControls.object;

    if (transformControls.dragging && !transformControls.startDrag && !transformControls.endDrag) {
      this.editor.signals.transformChanged.dispatch(object);
      return;
    }

    if (transformControls.endDrag) {
      switch (transformControls.mode) {
        case "translate":
          if (!transformControls.positionStart.equals(object.position)) {
            this.editor.setNodeProperty(object, "position", object.position, transformControls.positionStart);
          }
          break;
        case "rotate":
          if (!transformControls.rotationStart.equals(object.rotation)) {
            this.editor.setNodeProperty(object, "rotation", object.rotation, transformControls.rotationStart);
          }
          break;
        case "scale":
          if (!transformControls.scaleStart.equals(object.scale)) {
            this.editor.setNodeProperty(object, "scale", object.scale, transformControls.scaleStart);
          }
          break;
      }
    }

    if (input.get(Spoke.focusSelection)) {
      this.focus(this.editor.selected);
    } else if (input.get(Spoke.translateMode)) {
      this.setTransformControlsMode("translate");
    } else if (input.get(Spoke.rotateMode)) {
      this.setTransformControlsMode("rotate");
    } else if (input.get(Spoke.scaleMode)) {
      this.setTransformControlsMode("scale");
    } else if (input.get(Spoke.snapToggle)) {
      this.toggleSnapMode();
    } else if (input.get(Spoke.rotationSpaceToggle)) {
      this.toggleRotationSpace();
    } else if (input.get(Spoke.undo)) {
      this.editor.undo();
    } else if (input.get(Spoke.redo)) {
      this.editor.redo();
    } else if (input.get(Spoke.duplicateSelected)) {
      this.editor.duplicateSelectedObject();
    } else if (input.get(Spoke.deleteSelected)) {
      this.editor.deleteSelectedObject();
    } else if (input.get(Spoke.saveProject)) {
      this.editor.signals.saveProject.dispatch();
    }
  }

  focus(object) {
    const box = this.box;
    const center = this.center;
    const delta = this.delta;
    const camera = this.camera;

    let distance = 0;

    if (!object) {
      center.set(0, 0, 0);
      distance = 10;
    } else {
      box.setFromObject(object);

      if (box.isEmpty() === false) {
        box.getCenter(center);
        distance = box.getBoundingSphere(this.sphere).radius;
      } else {
        // Focusing on an Group, AmbientLight, etc
        center.setFromMatrixPosition(object.matrixWorld);
        distance = 0.1;
      }
    }

    delta.set(0, 0, 1);
    delta.applyQuaternion(camera.quaternion);
    delta.multiplyScalar(Math.min(distance, this.maxFocusDistance) * 4);

    camera.position.copy(center).add(delta);
  }

  setTransformControlsMode(mode) {
    this.transformControls.mode = mode;
    this.editor.signals.transformModeChanged.dispatch(mode);
  }

  toggleSnapMode() {
    this.snapEnabled = !this.snapEnabled;
    this.updateSnapSettings();
    this.editor.signals.snapToggled.dispatch(this.snapEnabled);
  }

  updateSnapSettings() {
    this.transformControls.translationSnap = this.translationSnap;
    this.transformControls.rotationSnap = this.rotationSnap;
  }

  setTranslationSnapValue(value) {
    this.translationSnap = value;
    this.transformControls.translationSnap = this.translationSnap;
  }

  setRotationSnapValue(value) {
    this.rotationSnap = value;
    this.transformControls.rotationSnap = this.rotationSnap;
  }

  toggleRotationSpace() {
    this.currentSpace = this.currentSpace === "world" ? "local" : "world";
    this.transformControls.space = this.currentSpace;
    this.editor.signals.spaceChanged.dispatch(this.currentSpace);
  }
}
