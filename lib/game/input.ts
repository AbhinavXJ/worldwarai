import * as THREE from "three";

export class Input {
  keys = new Set<string>();
  mouse = new THREE.Vector2(0, 0);
  mousePx = new THREE.Vector2(-100, -100);
  primary = false;
  /** edge-triggered actions, consumed by the game each frame */
  pressed = new Set<string>();
  touchMove = new THREE.Vector2();
  touchActive = false;
  touchFire = false;
  usingTouch = false;
  lastInput = 0;
  clicks: { x: number; y: number }[] = [];
  private el: HTMLElement | null = null;

  attach(el: HTMLElement) {
    this.el = el;
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
    el.addEventListener("contextmenu", this.onCtx);
    window.addEventListener("blur", this.onBlur);
  }

  detach() {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    this.el?.removeEventListener("pointermove", this.onMove);
    this.el?.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    this.el?.removeEventListener("contextmenu", this.onCtx);
    window.removeEventListener("blur", this.onBlur);
  }

  private touchStamp() {
    this.lastInput = performance.now();
  }

  private onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    if (!this.keys.has(k)) this.pressed.add(k);
    this.keys.add(k);
    this.usingTouch = false;
    this.touchStamp();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.mousePx.set(e.clientX - r.left, e.clientY - r.top);
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.usingTouch = false;
  };
  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      this.usingTouch = true;
      return;
    }
    this.onMove(e);
    this.touchStamp();
    if (e.button === 0) {
      this.primary = true;
      this.pressed.add("mouse0");
      this.clicks.push({ x: this.mouse.x, y: this.mouse.y });
    }
    if (e.button === 2) this.pressed.add("mouse2");
  };
  private onUp = (e: PointerEvent) => {
    if (e.button === 0) this.primary = false;
  };
  private onCtx = (e: Event) => e.preventDefault();
  private onBlur = () => {
    this.keys.clear();
    this.primary = false;
  };

  press(k: string) {
    this.pressed.add(k);
    this.touchStamp();
  }

  down(...ks: string[]) {
    return ks.some((k) => this.keys.has(k));
  }

  consume(...ks: string[]) {
    let hit = false;
    for (const k of ks) if (this.pressed.delete(k)) hit = true;
    return hit;
  }

  moveVector(out: THREE.Vector2) {
    out.set(0, 0);
    if (this.down("w", "arrowup")) out.y -= 1;
    if (this.down("s", "arrowdown")) out.y += 1;
    if (this.down("a", "arrowleft")) out.x -= 1;
    if (this.down("d", "arrowright")) out.x += 1;
    if (this.touchActive) out.copy(this.touchMove);
    if (out.lengthSq() > 1) out.normalize();
    return out;
  }

  endFrame() {
    this.pressed.clear();
    this.clicks.length = 0;
  }
}
