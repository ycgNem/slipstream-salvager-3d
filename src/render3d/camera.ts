// The cameras (THREEJS-NOTES rules 2 and 6). The main camera is bolted to the chassis: position =
// the robot + 0.55 m up, yaw = the heading, no free look except the held look-back. FOV (horizontal)
// widens from 70° at rest to 92° at Slipstream, eased, +4° while revving a Burn. Shake is at most
// 1.5° of roll and 3 cm of offset, never pitch. The rear camera looks the other way from just in
// front of the robot, a little higher and tilted down, so the strip shows your own back, the
// booster on it, the towed part on its cable and whatever is coming.
import * as THREE from 'three';
import { EYE, cameraYaw, ease, wx, wz } from './units';
import { REAR, VIEW_H, VIEW_W } from './view';

export const FOV_REST = 70;
export const FOV_SLIP = 92;
export const FOV_REV = 4;
/** the rear mirror's horizontal field of view */
export const REAR_HFOV = 110;

const vfov = (hfovDeg: number, aspect: number) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfovDeg) / 2) / aspect));

export interface CamInput {
  x: number;
  y: number;
  heading: number;
  speed: number;
  slipAt: number;
  topSpeed: number;
  revving: boolean;
  burning: boolean;
  lookBack: boolean;
  stunned: boolean;
  /** how far the mirror camera may sit ahead of the robot before it'd be inside a wall (m) */
  reach: number;
}

export class CameraRig {
  cam = new THREE.PerspectiveCamera(FOV_REST, VIEW_W / VIEW_H, 0.05, 400);
  rear = new THREE.PerspectiveCamera(30, REAR.w / REAR.h, 0.05, 400);
  hfov = FOV_REST;
  trauma = 0;
  shakeOn = true;
  /** 0 forward .. 1 looking back */
  look = 0;
  private seed = 1;
  /** first person, or the title's slow orbit over the Ring */
  mode: 'fp' | 'orbit' = 'fp';

  constructor() {
    this.cam.rotation.order = 'YXZ';
    this.rear.rotation.order = 'YXZ';
    this.rear.fov = vfov(REAR_HFOV, REAR.w / REAR.h);
    this.rear.updateProjectionMatrix();
    this.rear.layers.enable(1);
  }

  /** A hit's shake, in the 2D game's units (1..3 px there). */
  addShake(n: number) {
    this.trauma = Math.min(1, this.trauma + n * 0.22);
  }

  private noise(t: number, k: number) {
    return Math.sin(t * 37.1 + k * 11.3) * 0.6 + Math.sin(t * 59.7 + k * 4.1) * 0.4;
  }

  update(c: CamInput, dt: number, time: number) {
    // FOV: the first thing that tells you your speed
    const s = Math.min(1, c.speed / c.slipAt);
    const over = Math.max(0, c.speed - c.topSpeed) / 90;
    const target = FOV_REST + (FOV_SLIP - FOV_REST) * (s * s * (3 - 2 * s)) + over * 5 + (c.revving ? FOV_REV : 0) + (c.burning ? 3 : 0);
    this.hfov = ease(this.hfov, Math.min(104, target), dt, 0.14);
    this.cam.fov = vfov(this.hfov, VIEW_W / VIEW_H);
    this.cam.updateProjectionMatrix();
    // look-back swings round in a tenth of a second
    this.look = ease(this.look, c.lookBack ? 1 : 0, dt, 0.035);
    if (Math.abs(this.look - (c.lookBack ? 1 : 0)) < 0.01) this.look = c.lookBack ? 1 : 0;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.shakeOn ? this.trauma * this.trauma : 0;
    const yaw = cameraYaw(c.heading) + this.look * Math.PI;
    const fx = Math.cos(c.heading), fz = Math.sin(c.heading);
    const ox = this.noise(time, 1) * 0.03 * sh, oy = this.noise(time, 2) * 0.03 * sh;
    // offset in the camera's own right/up plane (right = (-fz, fx) on the floor)
    this.cam.position.set(wx(c.x) - fz * ox, EYE + oy, wz(c.y) + fx * ox);
    this.cam.rotation.set(0, yaw, THREE.MathUtils.degToRad(1.5) * this.noise(time, 3) * sh + (c.stunned ? Math.sin(time * 9) * 0.05 : 0));
    // the rear camera: a metre ahead of the robot, looking back over it, so the mirror shows your
    // own back (the booster on it, the cable, the towed part) and the Ring behind
    const back = yaw + Math.PI;
    const d = Math.min(1.0, c.reach) * (this.look > 0.5 ? -1 : 1);
    this.rear.position.set(wx(c.x) + fx * d, 0.95, wz(c.y) + fz * d);
    this.rear.rotation.set(-0.24, back, 0);
  }

  /** The title screen: a slow orbit above the Ring, looking at its centre. */
  orbit(cx: number, cz: number, time: number) {
    const a = time * 0.06;
    this.hfov = 80;
    this.cam.fov = vfov(80, VIEW_W / VIEW_H);
    this.cam.updateProjectionMatrix();
    this.cam.position.set(cx + Math.cos(a) * 15, 6.5, cz + Math.sin(a) * 11);
    this.cam.lookAt(cx, 0.5, cz);
  }

  /** Is a world point in front of the main camera and inside its frame? */
  onScreen(p: THREE.Vector3): boolean {
    const v = p.clone().project(this.cam);
    return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
  }
}
