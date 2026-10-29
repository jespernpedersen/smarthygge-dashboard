/**
 * The 3D model of the house: walls, windows, furniture and one real light per lamp.
 * Built once; afterwards only light intensities, blind bars and the day/night mix change.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LIGHTS, BLINDS, ROOMS, type Floor } from '../config/home';

const H = 2.5;
const XO = [-0.12, 5.92], ZO = [-0.12, 7.62];
type Opening = { a: number; b: number; kind: 'door' | 'window' | 'pass'; blind?: string }; // pass: half-height wall, open above
type Wall = { a: [number, number]; b: [number, number]; t: number; open?: Opening[] };

const WALLS: Record<Floor, Wall[]> = {
  ground: [
    // top: kitchen window over the sink, front door into the entrance
    { a: [XO[0], ZO[0]], b: [XO[1], ZO[0]], t: .24, open: [{ a: .8, b: 2.2, kind: 'window', blind: 'kitchen' }, { a: 4.2, b: 5.1, kind: 'door' }] },
    // bottom: terrace door and the big living-room window
    { a: [XO[0], ZO[1]], b: [XO[1], ZO[1]], t: .24, open: [{ a: .7, b: 1.6, kind: 'door' }, { a: 3.2, b: 4.6, kind: 'window', blind: 'living' }] },
    { a: [XO[0], ZO[0]], b: [XO[0], ZO[1]], t: .24 }, { a: [XO[1], ZO[0]], b: [XO[1], ZO[1]], t: .24 },
    // kitchen ↔ living: breakfast bar on a half wall, then an open doorway
    { a: [0, 3.1], b: [1.9, 3.1], t: .12, open: [{ a: .1, b: 1.8, kind: 'pass' }] },
    // entrance ↔ living, with a door; the TV hangs on the living-room side
    { a: [2.7, 3.1], b: [5.8, 3.1], t: .12, open: [{ a: 2.9, b: 3.8, kind: 'door' }] },
    { a: [3.0, 0], b: [3.0, 3.1], t: .12 },
  ],
  up: [
    { a: [XO[0], ZO[0]], b: [XO[1], ZO[0]], t: .24, open: [{ a: .9, b: 1.8, kind: 'window' }, { a: 3.6, b: 4.6, kind: 'window' }] },
    { a: [XO[0], ZO[1]], b: [XO[1], ZO[1]], t: .24, open: [{ a: 1.0, b: 2.4, kind: 'window' }, { a: 3.6, b: 5.0, kind: 'window' }] },
    { a: [XO[0], ZO[0]], b: [XO[0], ZO[1]], t: .24 }, { a: [XO[1], ZO[0]], b: [XO[1], ZO[1]], t: .24 },
    // landing ↔ bathroom and office
    { a: [3.0, 0], b: [3.0, 4.4], t: .12, open: [{ a: 1.4, b: 2.2, kind: 'door' }, { a: 3.2, b: 4.0, kind: 'door' }] },
    { a: [0, 2.6], b: [3.0, 2.6], t: .12 },
    // bedroom along the back, door from the landing
    { a: [0, 4.4], b: [5.8, 4.4], t: .12, open: [{ a: 4.3, b: 5.1, kind: 'door' }] },
  ],
};

function kelvin(k: number) {
  const t = k / 100; let r: number, g: number, b: number;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -.1332); g = 288.12 * Math.pow(t - 60, -.0755); b = 255; }
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace).lerp(new THREE.Color(1, .97, .93), .45);
}
function rnd(seed: number) { let s = seed; return () => ((s = Math.imul(s ^ s >>> 15, 1 | s) + 0x6D2B79F5 | 0, ((s ^ s >>> 7) >>> 0) % 100000) / 100000); }

interface LightRT { id: string; floor: Floor; pl: THREE.PointLight[]; shade: THREE.MeshStandardMaterial; cur: number; target: number; col: THREE.Color; k: number; cd: number }

export class HouseScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(13, 1, 1, 400);
  private scene = new THREE.Scene();
  private G: Record<Floor, THREE.Group> = { ground: new THREE.Group(), up: new THREE.Group() };
  private CUR!: THREE.Group;
  private mats: THREE.MeshStandardMaterial[] = [];
  private lights = new Map<string, LightRT>();
  private blindMesh = new Map<string, THREE.Mesh>();
  readonly blindSpot = new Map<string, [number, number]>();
  private roomShade = new Map<string, THREE.Mesh>();
  private blindPos = new Map<string, number>();
  private mWall!: THREE.MeshStandardMaterial; private mCap!: THREE.MeshBasicMaterial;
  private bgNight = new THREE.Color(0x1b1c1f); private bgDay = new THREE.Color(0x26282c);
  private cats: THREE.Object3D[] = [];
  private hemi!: THREE.HemisphereLight; private sun!: THREE.DirectionalLight;
  private tvLight!: THREE.PointLight; private tvScreen!: THREE.Mesh; private tvCur = 0; private tvOn = false;
  private dayCur = 0; private dayTarget = 0;
  private running = false; private last = 0; private shadowDirty = true; private first = true;
  floor: Floor = 'ground';
  W = 1; H = 1;
  onFirstFrame: () => void = () => {};
  onResize: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement, private stage: HTMLElement) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    this.camera.up.set(0, 0, -1);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.add(this.G.ground, this.G.up);
    this.build();
    this.applyFloors();
    new ResizeObserver(() => this.fit()).observe(stage);
    this.fit();
  }

  /* ---------- helpers ---------- */
  private M(color: number, o: THREE.MeshStandardMaterialParameters = {}) { const m = new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: 0, ...o }); this.mats.push(m); return m; }
  private add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, { cast = true, recv = true } = {}) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = recv; this.CUR.add(m); return m;
  }
  private B(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, r = 0, o?: { cast?: boolean; recv?: boolean }) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
    return this.add(g, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
  }
  private cyl(x: number, z: number, y0: number, y1: number, r: number, mat: THREE.Material, seg = 32) { return this.add(new THREE.CylinderGeometry(r, r, y1 - y0, seg), mat, x, (y0 + y1) / 2, z); }
  private floorRect(x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, y = 0) {
    const m = this.add(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), mat, (x0 + x1) / 2, y, (z0 + z1) / 2, { cast: false });
    const uv = m.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 2.4, -(z0 + (1 - uv.getY(i)) * (z1 - z0)) / 2.4);
  }
  private canvasTex(draw: (g: CanvasRenderingContext2D, S: number) => void, size = 1024) {
    const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d')!, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); return t;
  }
  private woodTex(seed: number, l0: number, lr: number, h0: number, s0: number) {
    return this.canvasTex((g, S) => {
      const R = rnd(seed), cols = 12, pw = S / cols;
      for (let i = 0; i < cols; i++) {
        let y = -R() * 400;
        while (y < S) {
          const len = 300 + R() * 420;
          g.fillStyle = `hsl(${h0 + R() * 6} ${s0 + R() * 8}% ${l0 + R() * lr}%)`; g.fillRect(i * pw, y, pw, len);
          for (let k = 0; k < 24; k++) {
            let x = i * pw + R() * pw; g.beginPath(); g.moveTo(x, y);
            for (let yy = y; yy < y + len; yy += 18) { x += (R() - .5) * 1.6; g.lineTo(x, yy); }
            g.strokeStyle = R() < .6 ? `rgba(40,20,6,${.06 + R() * .1})` : `rgba(255,230,195,${.04 + R() * .05})`; g.lineWidth = .6 + R() * 1.4; g.stroke();
          }
          g.fillStyle = 'rgba(20,10,4,.45)'; g.fillRect(i * pw, y, pw, 2); y += len;
        }
        g.fillStyle = 'rgba(20,10,4,.5)'; g.fillRect(i * pw, 0, 1.6, S);
      }
    });
  }
  private tileTex(seed: number, n: number, l0: number, lr: number, hue: number, sat: number, grout: string) {
    return this.canvasTex((g, S) => {
      const R = rnd(seed), ts = S / n; g.fillStyle = grout; g.fillRect(0, 0, S, S);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        g.fillStyle = `hsl(${hue} ${sat}% ${l0 + R() * lr}%)`; g.fillRect(i * ts + 3, j * ts + 3, ts - 6, ts - 6);
        for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(${R() < .5 ? '0,0,0' : '255,255,255'},.04)`; g.fillRect(i * ts + R() * ts, j * ts + R() * ts, 3, 3); }
      }
    });
  }

  /* ---------- model ---------- */
  private build() {
    const M = this.M.bind(this), B = this.B.bind(this), cyl = this.cyl.bind(this), add = this.add.bind(this);
    const rugTex = this.canvasTex((g, S) => {
      const R = rnd(11); g.fillStyle = '#8e877c'; g.fillRect(0, 0, S, S);
      for (let k = 0; k < 26000; k++) { g.fillStyle = R() < .5 ? 'rgba(60,52,44,.18)' : 'rgba(230,220,205,.12)'; g.fillRect(R() * S, R() * S, 2, 2); }
      g.strokeStyle = 'rgba(50,44,38,.55)'; g.lineWidth = 10; g.strokeRect(46, 46, S - 92, S - 92); g.lineWidth = 3; g.strokeRect(76, 76, S - 152, S - 152);
    }, 512);
    const mOakFloor = M(0xffffff, { map: this.woodTex(7, 30, 9, 28, 34), roughness: .55 });
    const mLightFloor = M(0xffffff, { map: this.woodTex(19, 44, 8, 32, 30), roughness: .6 });
    const mStoneFloor = M(0xffffff, { map: this.tileTex(3, 4, 30, 4, 30, 5, '#2a2826'), roughness: .45 });
    const mBathFloor = M(0xffffff, { map: this.tileTex(5, 8, 76, 5, 40, 4, '#8f8d89'), roughness: .35 });
    const mWall = this.mWall = M(0xe9e6e1, { roughness: .92 });
    const mCap = this.mCap = new THREE.MeshBasicMaterial({ color: 0xd9d8d4 });
    const mGlass = new THREE.MeshBasicMaterial({ color: 0x8fa3b4 });
    const mBlind = new THREE.MeshBasicMaterial({ color: 0x50545b });
    const mCab = M(0xe7e4de, { roughness: .6 }), mStone = M(0x2a2a2c, { roughness: .32 });
    const mSteel = M(0xa9acb0, { roughness: .28, metalness: .85 }), mBlack = M(0x0d0d0f, { roughness: .18 });
    const mWalnut = M(0x5e4130, { roughness: .5 }), mOak = M(0xa88560, { roughness: .6 });
    const mLeatherBlk = M(0x26272a, { roughness: .6 }), mLeatherBlk2 = M(0x323337, { roughness: .6 });
    const mMustard = M(0xb48a3c, { roughness: .9 });
    const mWhite = M(0xf1f0ec, { roughness: .35 }), mLinen = M(0xebe8e2, { roughness: .9 });
    const mDuvet = M(0xa9a9ab, { roughness: .95 }), mThrow = M(0x6d5b4d, { roughness: .95 }), mGrey = M(0x8c8f94, { roughness: .9 });
    const mRug = M(0xffffff, { map: rugTex, roughness: 1 });
    const mLeaf = M(0x3e6b3a, { roughness: .8, flatShading: true }), mLeaf2 = M(0x527f45, { roughness: .8, flatShading: true });
    const mPot = M(0xcdc6bb, { roughness: .7 }), mDark = M(0x2d2e32, { roughness: .6 }), mDesk = M(0x3e352e, { roughness: .5 }), mStep = M(0x9a7a5a, { roughness: .6 });
    const mGlassScreen = M(0xbfd3dc, { roughness: .05, metalness: .2, transparent: true, opacity: .35 });

    const wallPiece = (horiz: boolean, c: number, s0: number, s1: number, t: number, e0: boolean, e1: boolean) => {
      const a = s0 - (e0 ? t / 2 : 0), b = s1 + (e1 ? t / 2 : 0); if (b - a < .01) return;
      if (horiz) { B(a, b, 0, H, c - t / 2, c + t / 2, mWall); add(new THREE.PlaneGeometry(b - a, t).rotateX(-Math.PI / 2), mCap, (a + b) / 2, H + .002, c, { cast: false, recv: false }); }
      else { B(c - t / 2, c + t / 2, 0, H, a, b, mWall); add(new THREE.PlaneGeometry(t, b - a).rotateX(-Math.PI / 2), mCap, c, H + .002, (a + b) / 2, { cast: false, recv: false }); }
    };
    const buildWalls = (list: Wall[]) => {
      for (const w of list) {
        const horiz = w.a[1] === w.b[1], c = horiz ? w.a[1] : w.a[0], s0 = horiz ? w.a[0] : w.a[1], s1 = horiz ? w.b[0] : w.b[1];
        const inward = horiz ? (c < 3.75 ? 1 : -1) : (c < 2.9 ? 1 : -1);
        let cur = s0, first = true;
        for (const o of (w.open ?? []).slice().sort((p, q) => p.a - q.a)) {
          wallPiece(horiz, c, cur, o.a, w.t, first, false); first = false;
          const box = (y0: number, y1: number) => horiz ? B(o.a, o.b, y0, y1, c - w.t / 2, c + w.t / 2, mWall) : B(c - w.t / 2, c + w.t / 2, y0, y1, o.a, o.b, mWall);
          if (o.kind === 'window') {
            box(0, .85); box(2.22, 2.4);
            for (const off of [-.05, .05]) {
              const L = o.b - o.a, g = horiz ? new THREE.PlaneGeometry(L, .025) : new THREE.PlaneGeometry(.025, L); g.rotateX(-Math.PI / 2);
              add(g, mGlass, horiz ? (o.a + o.b) / 2 : c + off, 2.45, horiz ? c + off : (o.a + o.b) / 2, { cast: false, recv: false });
            }
            if (o.blind) {
              const g = horiz ? new THREE.PlaneGeometry(1, .09) : new THREE.PlaneGeometry(.09, 1); g.rotateX(-Math.PI / 2);
              const bm = add(g, mBlind, 0, 2.47, 0, { cast: false, recv: false });
              bm.userData = { horiz, c: c + inward * (w.t / 2 + .07), a: o.a, L: o.b - o.a, f: 0 };
              this.blindMesh.set(o.blind, bm);
              this.blindSpot.set(o.blind, horiz ? [(o.a + o.b) / 2, c + inward * .62] : [c + inward * .62, (o.a + o.b) / 2]);
            }
          }
          if (o.kind === 'door') box(2.1, 2.4);
          if (o.kind === 'pass') { box(0, 1.08); box(2.25, 2.4); }
          cur = o.b;
        }
        wallPiece(horiz, c, cur, s1, w.t, first, true);
      }
    };
    const plant = (x: number, z: number, s: number, seed: number) => {
      const R = rnd(seed); cyl(x, z, 0, .38 * s, .17 * s, mPot, 24);
      for (let i = 0; i < 9; i++) { const a = R() * 6.28, d = R() * .18 * s; add(new THREE.IcosahedronGeometry((.12 + R() * .1) * s, 0), R() < .5 ? mLeaf : mLeaf2, x + Math.cos(a) * d, (.45 + R() * .35) * s, z + Math.sin(a) * d); }
    };

    /* ground floor (a fictional demo townhouse) */
    this.CUR = this.G.ground;
    this.floorRect(0, 3.1, 5.8, 7.5, mOakFloor);
    this.floorRect(0, 0, 3.0, 3.1, mStoneFloor, .001);
    this.floorRect(3.0, 0, 5.8, 3.1, mStoneFloor, .001);
    buildWalls(WALLS.ground);
    // dining by the kitchen: oak table on black legs, round tub chairs
    B(.68, 1.72, .72, .77, 3.75, 5.25, mOak, .1);
    for (const [x, z] of [[.8, 3.9], [1.6, 3.9], [.8, 5.1], [1.6, 5.1]]) B(x - .03, x + .03, 0, .72, z - .03, z + .03, mBlack);
    const mTub = M(0x8e8f92, { roughness: .95, side: THREE.DoubleSide });
    const tub = (x: number, z: number, dir: number) => { // dir: −1 sits west of the table facing east, +1 the opposite
      cyl(x, z, .42, .5, .25, mTub, 32);
      add(new THREE.CylinderGeometry(.27, .26, .36, 32, 1, true, (dir < 0 ? Math.PI : 0) - .45, Math.PI + .9), mTub, x, .66, z);
      for (const [dx, dz] of [[-.15, -.15], [.15, -.15], [-.15, .15], [.15, .15]]) cyl(x + dx, z + dz, 0, .42, .014, mBlack, 8);
    };
    for (const z of [4.15, 4.85]) { tub(.36, z, -1); tub(2.04, z, 1); }
    // breakfast bar on the half wall, two stools on the kitchen side
    B(.1, 1.8, 1.08, 1.12, 2.92, 3.28, mStone, .01);
    for (const x of [.65, 1.3]) { cyl(x, 2.7, .72, .78, .19, mSteel, 24); cyl(x, 2.7, 0, .72, .025, mSteel, 8); cyl(x, 2.7, 0, .02, .2, mSteel, 24); }
    // sofa with its back to the window, facing the TV; coffee table on a rug
    B(3.4, 5.72, 0, .006, 4.75, 6.35, mRug, 0, { cast: false });
    B(3.45, 5.72, 0, .42, 6.45, 7.46, mLeatherBlk, .06); B(3.45, 5.72, .42, .84, 7.22, 7.46, mLeatherBlk, .08);
    for (const [x0, x1] of [[3.5, 4.58], [4.6, 5.68]]) B(x0, x1, .42, .55, 6.5, 7.2, mLeatherBlk2, .06);
    B(3.6, 4.02, .5, .86, 6.98, 7.18, mMustard, .08); B(5.1, 5.5, .5, .86, 6.98, 7.18, M(0xdcb8a8, { roughness: .95 }), .08);
    B(4.0, 5.1, .4, .44, 5.2, 5.8, mOak, .01);
    for (const [x, z] of [[4.03, 5.23], [5.07, 5.23], [4.03, 5.77], [5.07, 5.77]]) B(x - .015, x + .015, 0, .4, z - .015, z + .015, mBlack);
    // TV on the wall to the entrance, over a low oak bench
    const mLightOak = M(0xd2bc98, { roughness: .6 });
    B(4.1, 5.7, 0, .5, 3.16, 3.56, mLightOak, .01);
    B(4.3, 5.5, .9, 1.72, 3.165, 3.2, mBlack, .01);
    cyl(3.1, 6.75, 0, .03, .16, mDark, 24); cyl(3.1, 6.75, 0, 1.32, .015, mDark, 8);
    plant(5.45, 4.2, 1, 2); plant(2.35, 7.15, .8, 5);
    B(5.4, 5.8, 0, .7, 4.7, 5.9, mWhite, .01);
    // robot vacuum dock by the terrace door
    B(0, .1, 0, .1, 6.6, 7.0, mDark, .02);
    // kitchen: counter under the window, a second run on the left wall, tall fridge
    B(0, 3.0, 0, .88, 0, .6, mCab, .01); B(0, 3.0, .88, .92, 0, .62, mStone, .01);
    B(0, .6, 0, .88, .6, 2.2, mCab, .01); B(0, .62, .88, .92, .6, 2.2, mStone, .01);
    B(1.2, 1.93, .9, .925, .08, .5, mSteel, .03); B(1.27, 1.86, .9, .928, .13, .45, M(0x6f7276, { roughness: .4, metalness: .6 }), .03);
    cyl(1.56, .06, .92, 1.2, .018, mSteel, 12);
    B(.05, .58, .915, .93, .95, 1.6, mBlack, .01);
    for (const [dx, dz, r] of [[.19, 1.1, .08], [.19, 1.45, .1], [.44, 1.1, .1], [.44, 1.45, .08]]) add(new THREE.RingGeometry(r * .7, r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2c2c2e }), dx, .932, dz, { cast: false, recv: false });
    B(0, .62, 0, 2.0, 2.2, 2.84, M(0xd5d6d8, { roughness: .35, metalness: .3 }), .02);
    B(2.2, 2.75, .06, .84, .6, .63, mWhite, .005); // dishwasher front
    // entrance: stair rising towards the front wall, doormat, wardrobe
    { const n = 13, z0 = 2.95, z1 = .3, st = (z0 - z1) / n; for (let i = 0; i < n; i++) B(5.16, 5.8, 0, Math.min(2.35, (i + 1) * .19), z0 - (i + 1) * st, z0 - i * st, mStep, .005); }
    B(4.25, 5.05, 0, .01, .2, .6, M(0x2c2a28, { roughness: 1 }), 0, { cast: false });
    B(3.06, 3.62, 0, 2.0, .4, 1.6, mWhite, .01); B(3.62, 3.625, .1, 1.95, .995, 1.005, mDark); // wardrobe, two doors

    /* upstairs */
    this.CUR = this.G.up;
    this.floorRect(0, 0, 3.0, 2.6, mBathFloor, .001);
    this.floorRect(0, 2.6, 3.0, 4.4, mLightFloor);
    this.floorRect(3.0, 0, 5.16, 4.4, mLightFloor);
    this.floorRect(5.16, 2.95, 5.8, 4.4, mLightFloor);
    this.floorRect(0, 4.4, 5.8, 7.5, mLightFloor);
    buildWalls(WALLS.up);
    { const n = 13, z0 = .3, z1 = 2.95, st = (z1 - z0) / n; for (let i = 0; i < n; i++) { const y = -(i + 1) * .19; B(5.16, 5.8, y - .2, y, z0 + i * st, z0 + (i + 1) * st, mStep, .005); } B(5.1, 5.16, 0, .95, .3, 2.95, mDark, .01); }
    // bathroom: shower in the corner, vanity under the window, toilet
    B(.07, 1.0, 0, .08, .07, 1.3, mWhite, .03); B(.07, 1.0, 0, 1.9, 1.28, 1.31, mGlassScreen, .005, { cast: false });
    cyl(.55, .7, .08, .09, .04, mSteel, 16);
    B(1.4, 2.3, 0, .84, 0, .45, mOak, .015); add(new THREE.CylinderGeometry(.2, .2, .04, 32).scale(1, 1, .7), mWhite, 1.85, .86, .22);
    B(1.6, 2.1, 1.25, 1.85, 0, .03, M(0x9fb0bc, { roughness: .05, metalness: .6 }), .005);
    B(2.52, 2.84, 0, .8, 0, .26, mWhite, .04); add(new THREE.CylinderGeometry(.18, .15, .4, 32).scale(1, 1, 1.3), mWhite, 2.68, .2, .52);
    // office: desk along the left wall, two screens, chair; small sofa
    B(0, .73, .72, .76, 2.75, 4.25, mDesk, .01);
    for (const z of [2.8, 3.5, 4.2]) B(.04, .7, 0, .72, z - .03, z + .03, mDark);
    for (const z of [3.15, 3.85]) { B(.16, .2, .85, 1.3, z - .3, z + .3, mBlack, .01); B(.1, .2, .76, .85, z - .04, z + .04, mDark); }
    cyl(1.15, 3.5, .44, .5, .26, mDark, 32); B(1.42, 1.49, .5, 1.0, 3.28, 3.72, mDark, .03); cyl(1.15, 3.5, 0, .44, .03, mDark, 8);
    B(2.3, 2.92, 0, .42, 2.85, 4.1, M(0xd9cfbf, { roughness: .9 }), .08);
    // bedroom: headboard against the landing wall, a night table each side
    B(1.6, 4.2, 0, .006, 5.7, 7.1, mRug, 0, { cast: false });
    for (const x of [1.45, 3.9]) B(x, x + .45, 0, .5, 4.46, 4.9, mOak, .015);
    B(2.0, 3.8, 0, .3, 4.46, 6.6, mWalnut, .02); B(2.02, 3.78, .3, .5, 4.5, 6.56, mLinen, .06);
    B(2.02, 3.78, .5, .6, 5.1, 6.58, mDuvet, .08); B(2.04, 3.76, .6, .63, 6.1, 6.54, mThrow, .03);
    B(2.08, 2.85, .5, .64, 4.52, 4.92, mLinen, .07); B(2.95, 3.72, .5, .64, 4.52, 4.92, mLinen, .07);
    B(5.2, 5.8, 0, 2.1, 4.9, 6.9, M(0xd8d4cc, { roughness: .6 }), .01); B(5.195, 5.2, .1, 2.05, 5.895, 5.905, mDark); // wardrobe, two doors
    B(.3, .86, 0, .42, 6.6, 7.14, mGrey, .08);

    /* lights + fixtures (fixtures don't cast shadows, so they don't block their own light) */
    const NS = { cast: false, recv: false };
    const lowTex = this.renderer.capabilities.maxTextures < 16;
    for (const L of LIGHTS) {
      const floor = ROOMS[L.room].floor; this.CUR = this.G[floor];
      const shade = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: .7, emissive: 0xffffff, emissiveIntensity: 0, side: THREE.DoubleSide });
      const pl: THREE.PointLight[] = [];
      for (const [x, y, z] of L.pos) {
        if (L.fx === 'flush') add(new THREE.CylinderGeometry(.17, .19, .05, 40), shade, x, y + .04, z, NS);
        if (L.fx === 'pendant') { add(new THREE.IcosahedronGeometry(.25, 1), shade, x, y + .12, z, NS); // IKEA PS 2014-style sphere
          add(new THREE.CylinderGeometry(.006, .006, .9, 6), mDark, x, y + .65, z, NS); }
        if (L.fx === 'floor') add(new THREE.CylinderGeometry(.2, .24, .3, 40, 1, true), shade, x, y + .03, z, NS);
        if (L.fx === 'table') { add(new THREE.CylinderGeometry(.1, .13, .16, 32, 1, true), shade, x, y + .02, z, NS); add(new THREE.CylinderGeometry(.05, .07, .18, 16), mDark, x, y - .15, z, NS); }
        // table lamps cast no shadows, so a short range keeps them from shining through walls into the next room
        const p = new THREE.PointLight(0xffffff, 0, L.fx === 'table' ? 1.5 : 0, 2); p.position.set(x, y, z);
        // only ceiling lights and the pendant cast shadows: both floors on screen = 7 shadow maps, safely under the GPU's texture limit
        if ((L.fx === 'flush' || L.fx === 'pendant') && !(lowTex && L.fx === 'pendant')) { p.castShadow = true; p.shadow.mapSize.set(512, 512); p.shadow.camera.near = .05; p.shadow.camera.far = 10; p.shadow.bias = -.003; p.shadow.normalBias = .03; }
        this.CUR.add(p); pl.push(p);
      }
      this.lights.set(L.id, { id: L.id, floor, pl, shade, cur: 0, target: 0, col: kelvin(2700), k: 2700, cd: (L.lm / (4 * Math.PI)) * .42 / pl.length });
    }
    this.hemi = new THREE.HemisphereLight(0xdfe8f2, 0x6b5a48, .12); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2e0, 0); this.sun.position.set(0.5, 15, -3); this.sun.target.position.set(6.4, 0, 3.75);
    this.scene.add(this.sun, this.sun.target);
    this.sun.castShadow = true; Object.assign(this.sun.shadow.camera, { left: -11, right: 11, top: 8, bottom: -8, near: 1, far: 40 });
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -.0004; this.sun.shadow.normalBias = .02;
    this.tvLight = new THREE.PointLight(0x80b0ff, 0, 4, 2); this.tvLight.position.set(4.9, 1.0, 3.6); this.G.ground.add(this.tvLight);
    this.tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.24, .66), new THREE.MeshBasicMaterial({ color: 0x6aa0ff, transparent: true, opacity: 0 }));
    this.tvScreen.position.set(4.9, 1.31, 3.205); this.G.ground.add(this.tvScreen);
    for (const [id, r] of Object.entries(ROOMS)) {
      const [x0, z0, x1, z1] = r.r;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x05070b, transparent: true, opacity: 0, depthWrite: false }));
      m.position.set((x0 + x1) / 2, 2.35, (z0 + z1) / 2); m.renderOrder = 2; this.G[r.floor].add(m); this.roomShade.set(id, m);
    }
    for (const b of BLINDS) this.blindPos.set(b.id, 100);
    // two sleepy cats with bows, only shown in the kawaii theme
    const cat = (g: THREE.Group, x: number, y: number, z: number, rot: number, fur: number) => {
      const c = new THREE.Group(), mFur = M(fur, { roughness: .95 }), mPink = M(0xff8fb1, { roughness: .6 }), mEar = M(0xffc1d6, { roughness: .9 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(.2, 24, 16), mFur); body.scale.set(1.15, .55, .8); c.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.095, 20, 14), mFur); head.position.set(.2, .05, .06); c.add(head);
      for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(.035, .07, 12), mEar); ear.position.set(.21, .14, .06 + s * .05); ear.rotation.x = s * .35; c.add(ear); }
      const tail = new THREE.Mesh(new THREE.TorusGeometry(.17, .025, 8, 24, Math.PI * 1.1), mFur); tail.rotation.x = Math.PI / 2; tail.position.set(-.02, -.02, 0); c.add(tail);
      for (const s of [-1, 1]) { const loop = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), mPink); loop.scale.set(1, .6, 1.3); loop.position.set(.2, .1, .06 + s * .035); c.add(loop); }
      const knot = new THREE.Mesh(new THREE.SphereGeometry(.016, 10, 8), mPink); knot.position.set(.2, .11, .06); c.add(knot);
      c.traverse((o) => { (o as THREE.Mesh).castShadow = true; }); c.position.set(x, y, z); c.rotation.y = rot; c.visible = false; g.add(c); this.cats.push(c);
    };
    cat(this.G.ground, 5.15, .6, 6.85, 1.6, 0xf6f1ee); // on the sofa
    cat(this.G.up, 2.3, .67, 5.6, -.8, 0xfff4ea);      // on the bed, clear of the ceiling-light button
  }

  /* ---------- state in ---------- */
  setLight(id: string, on: boolean, brightnessPct: number, k: number) { const L = this.lights.get(id); if (!L) return; L.target = on ? brightnessPct / 100 : 0; L.k = k; this.kick(); }
  setBlind(id: string, p: number) { this.blindPos.set(id, p); this.kick(); }
  setTv(on: boolean) { this.tvOn = on; this.kick(); }
  /** colour theme for the 3D house; 'kawaii' = pink and white with cats */
  setTheme(theme: string) {
    const k = theme === 'kawaii';
    this.mWall.color.set(k ? 0xfff1f5 : 0xe9e6e1); this.mCap.color.set(k ? 0xffcfe0 : 0xd9d8d4);
    this.bgNight.set(k ? 0x4a2e3d : 0x1b1c1f); this.bgDay.set(k ? 0xffe6ef : 0x26282c);
    for (const c of this.cats) c.visible = k;
    this.shadowDirty = true; this.kick();
  }
  /** draws an image flat on the ground floor with its corners (top-left, top-right, bottom-right, bottom-left) at floorplan [x, z] */
  private overlay?: THREE.Mesh;
  setOverlay(img: HTMLCanvasElement, corners: [number, number][]) {
    if (this.overlay) { this.G.ground.remove(this.overlay); this.overlay.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap(([x, z]) => [x, .03, z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 3, 1, 1, 3, 2]);
    const t = new THREE.CanvasTexture(img); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    this.overlay = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: .7, depthWrite: false, side: THREE.DoubleSide }));
    this.overlay.renderOrder = 10; this.G.ground.add(this.overlay); this.kick();
  }
  setDay(day: boolean) { this.dayTarget = day ? 1 : 0; this.kick(); }
  /** the real sun: azimuth (degrees clockwise from north) and elevation, or null for a fixed day/evening look.
   *  `north` is the compass direction the top of the floorplan faces (0 = north, 90 = east…). */
  private sunPos: { az: number; el: number } | null = null; private north = 0; private cloud = 0;
  /** `cloud` 0–1 from the weather: clouds soften direct sunlight into even sky light */
  setSun(pos: { az: number; el: number } | null, north = 0, cloud = 0) { this.sunPos = pos; this.north = north; this.cloud = cloud; this.shadowDirty = true; this.kick(); }
  setFloor(f: Floor) { this.floor = f; this.applyFloors(); this.kick(); }

  /* ---------- view ----------
     Wide stages show both floors side by side (upstairs shifted UP_DX metres to the right);
     narrow ones show one floor and the UI offers a switcher. `reserveLeft` keeps pixels free for the Today card. */
  static readonly UP_DX = 6.9;
  dual = false;
  reserveLeft = 0;
  reserveUsed = false;
  visibleFloors(): Floor[] { return this.dual ? ['ground', 'up'] : [this.floor]; }
  floorOffset(f: Floor) { return this.dual && f === 'up' ? HouseScene.UP_DX : 0; }
  private applyFloors() {
    this.G.ground.visible = this.dual || this.floor === 'ground';
    this.G.up.visible = this.dual || this.floor === 'up';
    this.G.up.position.x = this.dual ? HouseScene.UP_DX : 0;
    this.shadowDirty = true;
  }
  fit() {
    const r = this.stage.getBoundingClientRect(); this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.renderer.setSize(this.W, this.H, false); this.camera.aspect = this.W / this.H;
    const dual = this.W >= 900 && this.W / this.H >= 1.35;
    if (dual !== this.dual) { this.dual = dual; this.applyFloors(); }
    const x0 = -0.4, x1 = (dual ? HouseScene.UP_DX : 0) + 6.0, z0 = -0.4, z1 = 7.9;
    const planW = x1 - x0 + 0.6, planH = z1 - z0 + (dual ? 1.6 : 1.2); // margins; dual mode needs room for the floor labels below
    let R = this.reserveLeft;
    if (R && (this.W - R) / this.H < (planW / planH) * 0.8) R = 0; // only reserve when the plans still fit well
    this.reserveUsed = R > 0;
    const halfH = Math.max(planH / 2, (planW / ((this.W - R) / this.H)) / 2);
    const upp = (2 * halfH) / this.H; // metres per pixel at floor level
    const cx = (x0 + x1) / 2 - (R / 2) * upp, cz = (z0 + z1) / 2 + (dual ? 0.15 : -0.2);
    let gx = cx, gz = cz, gh = halfH;
    if (this.focusPt) {
      // zoom in on one spot (a device whose panel is open): ~4.6 m of floor around it, but never past the whole plan
      const f = this.focusPt, span = 4.6;
      gh = Math.min(halfH, Math.max(span / 2, (span / (this.W / this.H)) / 2));
      gx = f.x + this.floorOffset(f.floor); gz = f.z;
    }
    const d = gh / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camGoal.set(gx, d, gz);
    if (!this.camReady) { this.camReady = true; this.camCur.copy(this.camGoal); }
    this.placeCamera();
    this.onResize(); this.kick();
  }
  /** glide the camera to a point on the floorplan (null = back to the whole house) */
  private focusPt: { x: number; z: number; floor: Floor } | null = null;
  private camGoal = new THREE.Vector3(); private camCur = new THREE.Vector3(); private camReady = false;
  onCamera: () => void = () => {};
  focus(p: { x: number; z: number; floor: Floor } | null) {
    const same = p && this.focusPt && p.x === this.focusPt.x && p.z === this.focusPt.z && p.floor === this.focusPt.floor;
    if (same || (!p && !this.focusPt)) return;
    this.focusPt = p; this.fit();
  }
  private placeCamera() {
    const c = this.camCur; this.camera.position.set(c.x, c.y, c.z + 0.00001); this.camera.lookAt(c.x, 0, c.z); this.camera.updateProjectionMatrix();
  }
  setReserveLeft(px: number) { if (px !== this.reserveLeft) { this.reserveLeft = px; this.fit(); } }
  project(x: number, y: number, z: number, floor: Floor = 'ground'): [number, number] {
    const v = new THREE.Vector3(x + this.floorOffset(floor), y, z).project(this.camera);
    return [(v.x + 1) / 2 * this.W, (1 - v.y) / 2 * this.H];
  }

  /* ---------- render loop: runs only while something is animating ---------- */
  private kick() { if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame((t) => this.frame(t)); } }
  private frame(now: number) {
    const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; let busy = false;
    if (this.camCur.distanceTo(this.camGoal) > .002) {
      this.camCur.lerp(this.camGoal, 1 - Math.exp(-dt * 7)); busy = true; this.placeCamera(); this.onCamera();
    }
    const ease = 1 - Math.exp(-dt * 9);
    const near = (a: number, b: number) => Math.abs(a - b) < .002;
    for (const L of this.lights.values()) {
      L.cur += (L.target - L.cur) * ease; if (!near(L.cur, L.target)) busy = true; else L.cur = L.target;
      const tc = kelvin(L.k); L.col.lerp(tc, ease); if (Math.abs(L.col.r - tc.r) + Math.abs(L.col.b - tc.b) > .002) busy = true;
      for (const p of L.pl) { p.intensity = L.cd * L.cur; p.color.copy(L.col); }
      L.shade.emissive.copy(L.col); L.shade.emissiveIntensity = L.cur * 1.1;
    }
    const tvT = this.tvOn ? 1 : 0; this.tvCur += (tvT - this.tvCur) * ease; if (!near(tvT, this.tvCur)) busy = true; else this.tvCur = tvT;
    this.tvLight.intensity = this.tvCur * 6; (this.tvScreen.material as THREE.MeshBasicMaterial).opacity = this.tvCur * .9;
    const sp = this.sunPos;
    if (sp) {
      // daylight fades through twilight (sun 6° below to 8° above the horizon) and warms up while the sun is low
      this.dayCur = THREE.MathUtils.smoothstep(sp.el, -6, 8);
      const rad = Math.PI / 180, a = (sp.az - this.north) * rad, el = Math.max(sp.el, 4) * rad, tg = this.sun.target.position;
      // plan axes: x to the right, z down the screen, so the top of the plan (−z) points `north` degrees from true north
      this.sun.position.set(tg.x + Math.sin(a) * Math.cos(el) * 20, Math.sin(el) * 20, tg.z - Math.cos(a) * Math.cos(el) * 20);
      this.sun.color.set(0xff9a50).lerp(new THREE.Color(0xfff2e0), THREE.MathUtils.smoothstep(sp.el, 2, 22));
      this.dayTarget = this.dayCur;
    } else {
      this.sun.position.set(0.5, 15, -3); this.sun.color.set(0xfff2e0);
      this.dayCur += (this.dayTarget - this.dayCur) * (1 - Math.exp(-dt * 4)); if (!near(this.dayCur, this.dayTarget)) busy = true; else this.dayCur = this.dayTarget;
    }
    const d = this.dayCur, lerp = THREE.MathUtils.lerp;
    // with the real sun, a high summer sun gives a brighter sky and stronger sunlight than a low winter one,
    // and clouds swap direct sun for softer sky light; the fixed day look sits at about an October midday
    const high = sp ? THREE.MathUtils.smoothstep(sp.el, 5, 50) : .45, cl = sp ? this.cloud : 0;
    this.hemi.intensity = lerp(.12, (1.05 + .45 * high) * (1 + .25 * cl), d);
    this.sun.intensity = lerp(0, (2.3 + .9 * high) * (1 - .8 * cl), d); this.sun.shadow.intensity = 1 - .6 * cl;
    // three r163+ applies scene.environment through scene.environmentIntensity (material.envMapIntensity no longer affects it)
    this.scene.environmentIntensity = lerp(.035, .45, d);
    this.renderer.toneMappingExposure = lerp(1.0, .95, d);
    this.scene.background = this.bgNight.clone().lerp(this.bgDay, d);
    for (const [id, m] of this.roomShade) {
      const bs = BLINDS.filter((b) => b.room === id); if (!bs.length) continue;
      const avg = bs.reduce((a, b) => a + (this.blindPos.get(b.id) ?? 100), 0) / bs.length;
      const mat = m.material as THREE.MeshBasicMaterial, t = d * .6 * (1 - avg / 100);
      mat.opacity += (t - mat.opacity) * ease; if (!near(t, mat.opacity)) busy = true;
    }
    for (const [id, m] of this.blindMesh) {
      const u = m.userData, f = Math.max(.0001, 1 - (this.blindPos.get(id) ?? 100) / 100);
      u.f += (f - u.f) * ease; if (!near(f, u.f)) busy = true;
      const len = u.L * u.f; m.visible = len > .01;
      if (u.horiz) { m.scale.set(len, 1, 1); m.position.set(u.a + len / 2, 2.47, u.c); } else { m.scale.set(1, 1, len); m.position.set(u.c, 2.47, u.a + len / 2); }
    }
    if (this.shadowDirty) { this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = false; }
    this.renderer.render(this.scene, this.camera);
    if (this.first) { this.first = false; busy = true; this.onFirstFrame(); }
    if (busy) requestAnimationFrame((t) => this.frame(t)); else this.running = false;
  }
}
