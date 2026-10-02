import * as THREE from "three";

export class CameraRig {
  pos = new THREE.Vector3(0, 30, 40);
  look = new THREE.Vector3();
  targetPos = new THREE.Vector3(0, 30, 40);
  targetLook = new THREE.Vector3();
  trauma = 0;
  fovKick = 0;
  baseFov = 55;
  smooth = 6;
  lookSmooth = 8;
  roll = 0;
  offset = new THREE.Vector3(0, 9, 10.4);
  zoom = 1;
  private seed = Math.random() * 100;

  constructor(public cam: THREE.PerspectiveCamera) {}

  snap() {
    this.pos.copy(this.targetPos);
    this.look.copy(this.targetLook);
  }

  shake(amount: number) {
    this.trauma = Math.min(1.2, this.trauma + amount);
  }

  follow(target: THREE.Vector3, lookAhead: THREE.Vector3) {
    this.targetLook.set(target.x + lookAhead.x * 0.55, target.y + 1.1, target.z + lookAhead.z * 0.55);
    this.targetPos.set(
      this.targetLook.x + this.offset.x * this.zoom,
      Math.max(target.y, -6) + this.offset.y * this.zoom,
      this.targetLook.z + this.offset.z * this.zoom,
    );
  }

  update(dt: number, t: number) {
    const k = 1 - Math.exp(-this.smooth * dt);
    const kl = 1 - Math.exp(-this.lookSmooth * dt);
    this.pos.lerp(this.targetPos, k);
    this.look.lerp(this.targetLook, kl);
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma;
    const n = (o: number) => Math.sin(t * 37 + o + this.seed) * 0.6 + Math.sin(t * 61 + o * 2.3) * 0.4;
    this.cam.position.set(this.pos.x + n(1) * s * 0.9, this.pos.y + n(2) * s * 0.7, this.pos.z + n(3) * s * 0.9);
    this.cam.lookAt(this.look);
    this.cam.rotateZ(n(4) * s * 0.05 + this.roll);
    this.fovKick += (0 - this.fovKick) * Math.min(1, dt * 5);
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(this.cam.fov - fov) > 0.01) {
      this.cam.fov = fov;
      this.cam.updateProjectionMatrix();
    }
  }
}
