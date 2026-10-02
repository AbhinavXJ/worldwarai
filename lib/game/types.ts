import type * as THREE from "three";

export type Faction = "dot" | "muse" | "grok";

export type Personality = "aggressive" | "coward" | "confused" | "idiot" | "menace";

export type AIState = "idle" | "patrol" | "chase" | "attack" | "flee" | "dodge" | "stunned" | "defeated";

export type Phase = "boot" | "intro" | "select" | "deploying" | "playing" | "dying" | "dead" | "victory";

export type Expression = "neutral" | "happy" | "surprised" | "hurt" | "dead" | "derp" | "smug" | "angry";

export type NpcMood = "wander" | "flee" | "cheer" | "hide" | "stare" | "dance" | "selfie" | "trip" | "uninterested" | "sign" | "celebrate";

export interface Face {
  root: THREE.Group;
  eyes: THREE.Object3D[];
  xEyes: THREE.Object3D[];
  happyEyes: THREE.Object3D[];
  smile: THREE.Object3D;
  mouthO: THREE.Object3D;
  mouthFlat: THREE.Object3D;
  brows: THREE.Object3D[];
  expr: Expression;
  exprTimer: number;
  blink: number;
}

export interface Rig {
  kind: Faction;
  lite: boolean;
  root: THREE.Group;
  /** pivot at the feet; squash, tilt and fall-over act here */
  body: THREE.Group;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  face: Face;
  flashMats: THREE.MeshStandardMaterial[];
  baseEmissive: number[];
  height: number;
  /** which real-world mascot this rig is (alfred, todd, jolly, circle, ...) */
  variant: string;
  /** per-design animation layered on top of the shared rig animation */
  post?: (r: Rig, moving: boolean, t: number, dt: number) => void;
  // animation state
  walk: number;
  squash: number;
  squashVel: number;
  fall: number;
  fallTimer: number;
  pose: number;
  poseTimer: number;
  lookYaw: number;
  wave: number;
}

export interface Actor {
  id: number;
  faction: Faction;
  isPlayer: boolean;
  isNpc: boolean;
  rig: Rig;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  move: THREE.Vector2;
  knock: THREE.Vector3;
  yaw: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  dying: number;
  grounded: boolean;
  airTime: number;
  lastGroundY: number;
  tumble: number;
  tumbleAxis: THREE.Vector3;
  tumbleAngle: number;
  stun: number;
  flash: number;
  invuln: number;
  speed: number;
  scale: number;
  // ai
  personality: Personality;
  state: AIState;
  stateTime: number;
  think: number;
  target: Actor | null;
  attackCd: number;
  wander: THREE.Vector3;
  telegraph: number;
  dashT: number;
  lastHitBy: Actor | null;
  // npc
  mood: NpcMood;
  moodTime: number;
  sign?: THREE.Object3D;
  /** temporary disable of separation (dots stuck inside dots) */
  phaseThrough: number;
  bubbleCd: number;
  spawnT: number;
  frozen: boolean;
  ally: boolean;
  shadowIdx: number;
  ballistic: boolean;
  portalCd: number;
  stepT: number;
  action: "none" | "attack" | "cheer" | "dance" | "selfie" | "pose" | "stun" | "scared" | "dead" | "dash" | "sit";
  actionT: number;
  lookAt: THREE.Vector3 | null;
  aim: THREE.Vector3;
  navT: number;
  atkT: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  energy: number;
  score: number;
  kills: number;
  combo: number;
  bestCombo: number;
  time: number;
  survive: number;
  cd: { primary: number; special: number; dash: number; ult: number };
  cdMax: { primary: number; special: number; dash: number; ult: number };
  interact: string | null;
  secret: boolean;
  fps: number;
}

export interface RunResult {
  faction: Faction;
  score: number;
  kills: number;
  time: number;
  bestCombo: number;
  title: string;
  won: boolean;
}
