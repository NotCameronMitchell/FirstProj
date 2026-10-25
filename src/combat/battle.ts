import { Rng } from '../rng';
import type { AttackKind, Row, Side, Status, StatusKind } from '../types';

export type Targeting = 'front' | 'lowest' | 'random' | 'back' | 'assassin';
export type DmgKind = AttackKind | 'dot' | 'reflect' | 'true';

export interface HitInfo {
  kind: DmgKind;
  isSkill?: boolean;
  canCrit?: boolean;
  forceCrit?: boolean;
  noDodge?: boolean;
  trueDmg?: boolean;
  /** Damage from procs/reflects shouldn't trigger further on-hit effects. */
  noProc?: boolean;
  crit?: boolean;
}

type UnitFn = (b: Battle, u: Unit) => void;

export interface Unit {
  uid: number;
  side: Side;
  key: string;
  name: string;
  sprite: string;
  row: Row;
  order: number;
  boss: boolean;
  summon: boolean;
  heroIndex: number;
  size: number;

  maxHp: number;
  hp: number;
  atk: number;
  armor: number;
  interval: number;
  crit: number;
  critMult: number;
  dodge: number;
  lifesteal: number;
  dmgMult: number;
  dmgTakenMult: number;
  healMult: number;
  healTakenMult: number;
  energyPerAttack: number;
  energyMult: number;
  skillRank: number;
  skillName: string;

  ranged: boolean;
  attackKind: AttackKind;
  targeting: Targeting;

  energy: number;
  atkTimer: number;
  shield: number;
  statuses: Status[];
  alive: boolean;
  deathTime: number;
  cheatDeath: number;
  target: Unit | null;
  dotAcc: number;
  dotEmit: number;
  timers: Record<string, number>;
  flags: Record<string, number | boolean>;

  skill?: UnitFn;
  /** Replaces the basic attack. Return true if the unit acted. */
  basic?: (b: Battle, u: Unit) => boolean;
  tick?: (b: Battle, u: Unit, dt: number) => void;
  onHurt?: (b: Battle, u: Unit, src: Unit | null, dmg: number) => void;
  onHitLand?: (b: Battle, u: Unit, tgt: Unit, dmg: number, info: HitInfo) => void;
  onDeath?: (b: Battle, u: Unit, killer: Unit | null) => void;
  onOtherDeath?: (b: Battle, u: Unit, dead: Unit) => void;
}

export type UnitInit = Partial<Unit> &
  Pick<Unit, 'side' | 'key' | 'name' | 'sprite' | 'row' | 'maxHp' | 'atk' | 'interval'>;

let uidCounter = 1;

export function makeUnit(p: UnitInit): Unit {
  const u: Unit = {
    uid: uidCounter++,
    order: 0,
    boss: false,
    summon: false,
    heroIndex: -1,
    size: 1,
    hp: p.maxHp,
    armor: 0,
    crit: 0.05,
    critMult: 1.5,
    dodge: 0,
    lifesteal: 0,
    dmgMult: 1,
    dmgTakenMult: 1,
    healMult: 1,
    healTakenMult: 1,
    energyPerAttack: 20,
    energyMult: 1,
    skillRank: 1,
    skillName: '',
    ranged: false,
    attackKind: 'melee',
    targeting: p.ranged ? 'random' : 'front',
    energy: 0,
    atkTimer: 0,
    shield: 0,
    statuses: [],
    alive: true,
    deathTime: 0,
    cheatDeath: 0,
    target: null,
    dotAcc: 0,
    dotEmit: 0,
    timers: {},
    flags: {},
    ...p,
  };
  u.hp = u.maxHp;
  return u;
}

export type BattleEvent =
  | { t: 'dmg'; uid: number; amount: number; crit: boolean; kind: DmgKind }
  | { t: 'dodge'; uid: number }
  | { t: 'heal'; uid: number; amount: number }
  | { t: 'shield'; uid: number; amount: number }
  | { t: 'proj'; from: number; to: number; kind: AttackKind; dur: number }
  | { t: 'lunge'; uid: number; to: number }
  | { t: 'cast'; uid: number; name: string }
  | { t: 'death'; uid: number }
  | { t: 'spawn'; uid: number }
  | { t: 'status'; uid: number; text: string; color: string }
  | { t: 'aoe'; side: Side; kind: AttackKind }
  | { t: 'shake'; power: number }
  | { t: 'banner'; text: string };

/** Hooks used by relics, bargains and gear. `owner` is set for gear effects. */
export interface Hooks {
  heroMod?(u: Unit, b: Battle, owner?: Unit): void;
  enemyMod?(u: Unit, b: Battle): void;
  onStart?(b: Battle, owner?: Unit): void;
  onTick?(b: Battle, dt: number, owner?: Unit): void;
  onHit?(b: Battle, src: Unit, tgt: Unit, dmg: number, info: HitInfo, owner?: Unit): void;
  onHurt?(b: Battle, hero: Unit, src: Unit | null, dmg: number, owner?: Unit): void;
  onKill?(b: Battle, killer: Unit | null, victim: Unit, owner?: Unit): void;
  onAllyDeath?(b: Battle, ally: Unit, owner?: Unit): void;
  onCast?(b: Battle, caster: Unit, owner?: Unit): void;
}

interface ActiveEffect {
  hooks: Hooks;
  owner?: Unit;
}

const STACKING: StatusKind[] = ['burn', 'bleed', 'regen'];
const STATUS_TEXT: Partial<Record<StatusKind, [string, string]>> = {
  stun: ['STUNNED', '#f3d36b'],
  taunt: ['TAUNT', '#9ec3ff'],
  mark: ['MARKED', '#ff5a4a'],
  weaken: ['WEAKENED', '#b48cff'],
};

export const WRATH_START = 45;

export class Battle {
  units: Unit[] = [];
  time = 0;
  events: BattleEvent[] = [];
  outcome: 'win' | 'lose' | null = null;
  kills = 0;
  /** Per-battle counters for effects that need timers. */
  scratch: Record<string, number> = {};
  flaskCharges: number;
  flaskPower: number;
  flaskUsed = false;
  private effects: ActiveEffect[] = [];
  private pending: { at: number; fn: () => void }[] = [];
  private wrathAnnounced = false;
  private started = false;

  constructor(
    public rng: Rng,
    opts: { flaskCharges?: number; flaskPower?: number } = {},
  ) {
    this.flaskCharges = opts.flaskCharges ?? 0;
    this.flaskPower = opts.flaskPower ?? 0.4;
  }

  addEffect(hooks: Hooks, owner?: Unit): void {
    this.effects.push({ hooks, owner });
  }

  emit(e: BattleEvent): void {
    this.events.push(e);
  }

  spawn(u: Unit): Unit {
    u.order = this.units.filter((o) => o.side === u.side && o.row === u.row).length;
    u.atkTimer = u.interval * (0.3 + this.rng.next() * 0.5);
    this.units.push(u);
    for (const e of this.effects) {
      if (u.side === 'hero' && e.hooks.heroMod && (!e.owner || e.owner === u)) e.hooks.heroMod(u, this, e.owner);
      if (u.side === 'enemy' && e.hooks.enemyMod) e.hooks.enemyMod(u, this);
    }
    u.hp = Math.min(u.hp, u.maxHp);
    if (this.started) this.emit({ t: 'spawn', uid: u.uid });
    return u;
  }

  start(): void {
    this.started = true;
    for (const e of this.effects) e.hooks.onStart?.(this, e.owner);
  }

  /** Run `fn` after `delay` seconds of battle time. */
  after(delay: number, fn: () => void): void {
    this.pending.push({ at: this.time + delay, fn });
  }

  alive(side: Side): Unit[] {
    return this.units.filter((u) => u.alive && u.side === side);
  }

  allies(u: Unit): Unit[] {
    return this.alive(u.side);
  }

  foes(u: Unit): Unit[] {
    return this.alive(u.side === 'hero' ? 'enemy' : 'hero');
  }

  heroes(): Unit[] {
    return this.units.filter((u) => u.side === 'hero' && !u.summon);
  }

  wrathMult(): number {
    return this.time > WRATH_START ? 1 + (this.time - WRATH_START) * 0.05 : 1;
  }

  statusSum(u: Unit, kind: StatusKind): number {
    let s = 0;
    for (const st of u.statuses) if (st.kind === kind) s += st.power;
    return s;
  }

  has(u: Unit, kind: StatusKind): boolean {
    return u.statuses.some((s) => s.kind === kind);
  }

  addStatus(u: Unit, kind: StatusKind, dur: number, power = 0, src?: Unit): void {
    if (!u.alive) return;
    if (kind === 'stun' && u.boss) dur *= 0.4;
    const existing = u.statuses.find((s) => s.kind === kind);
    if (existing) {
      existing.dur = Math.max(existing.dur, dur);
      existing.power = STACKING.includes(kind) ? existing.power + power : Math.max(existing.power, power);
      if (src) existing.src = src.uid;
    } else {
      u.statuses.push({ kind, dur, power, src: src?.uid });
      const txt = STATUS_TEXT[kind];
      if (txt) this.emit({ t: 'status', uid: u.uid, text: txt[0], color: txt[1] });
    }
  }

  addShield(u: Unit, amount: number): void {
    if (!u.alive || amount <= 0) return;
    u.shield = Math.min(u.maxHp, u.shield + amount);
    this.emit({ t: 'shield', uid: u.uid, amount: Math.round(amount) });
  }

  heal(src: Unit | null, tgt: Unit, amount: number): number {
    if (!tgt.alive) return 0;
    let a = amount * (src ? src.healMult : 1) * tgt.healTakenMult;
    a = Math.min(a, tgt.maxHp - tgt.hp);
    if (a <= 0) return 0;
    tgt.hp += a;
    if (a >= 1) this.emit({ t: 'heal', uid: tgt.uid, amount: Math.round(a) });
    return a;
  }

  revive(u: Unit, pct: number): void {
    if (u.alive) return;
    u.alive = true;
    u.hp = Math.max(1, u.maxHp * pct);
    u.statuses = [];
    u.shield = 0;
    u.energy = 0;
    u.atkTimer = u.interval * 0.5;
    this.emit({ t: 'spawn', uid: u.uid });
    this.emit({ t: 'status', uid: u.uid, text: 'REVIVED', color: '#ffd27a' });
  }

  pickTarget(u: Unit, mode: Targeting = u.targeting): Unit | null {
    const foes = this.foes(u);
    if (!foes.length) return null;
    if (mode !== 'assassin') {
      const taunters = foes.filter((f) => this.has(f, 'taunt'));
      if (taunters.length) return taunters[0];
    }
    const sticky = (pool: Unit[]): Unit => {
      if (u.target && u.target.alive && pool.includes(u.target)) return u.target;
      u.target = this.rng.pick(pool);
      return u.target;
    };
    const lowest = (pool: Unit[]): Unit => pool.reduce((a, c) => (c.hp / c.maxHp < a.hp / a.maxHp ? c : a));
    switch (mode) {
      case 'front': {
        const front = foes.filter((f) => f.row === 'front');
        return sticky(front.length ? front : foes);
      }
      case 'back': {
        const back = foes.filter((f) => f.row === 'back');
        return sticky(back.length ? back : foes);
      }
      case 'lowest':
        return lowest(foes);
      case 'assassin': {
        const back = foes.filter((f) => f.row === 'back');
        return lowest(back.length ? back : foes);
      }
      default:
        return sticky(foes);
    }
  }

  /** Visual + delayed damage: melee lunges, ranged attacks fire a projectile. */
  strike(src: Unit, tgt: Unit, mult: number, info: Partial<HitInfo> = {}, onLand?: (dmg: number) => void): void {
    const kind = (info.kind as AttackKind) ?? src.attackKind;
    const full: HitInfo = { kind, ...info };
    const melee = kind === 'melee' || kind === 'claw';
    const delay = melee ? 0.12 : 0.28;
    if (melee) this.emit({ t: 'lunge', uid: src.uid, to: tgt.uid });
    else this.emit({ t: 'proj', from: src.uid, to: tgt.uid, kind, dur: delay });
    this.after(delay, () => {
      if (!tgt.alive || !src.alive) return;
      const dmg = this.dealDamage(src, tgt, src.atk * mult, full);
      onLand?.(dmg);
    });
  }

  dealDamage(src: Unit | null, tgt: Unit, raw: number, info: HitInfo): number {
    if (!tgt.alive) return 0;
    if (src && !info.noDodge && info.kind !== 'dot' && this.rng.chance(tgt.dodge)) {
      this.emit({ t: 'dodge', uid: tgt.uid });
      return 0;
    }
    let dmg = raw;
    let crit = false;
    if (src && (info.forceCrit || (info.canCrit !== false && info.kind !== 'dot' && this.rng.chance(src.crit)))) {
      crit = true;
      dmg *= src.critMult;
    }
    info.crit = crit;
    if (src) {
      dmg *= src.dmgMult * (1 + this.statusSum(src, 'empower') / 100);
      dmg *= 1 - Math.min(80, this.statusSum(src, 'weaken')) / 100;
    }
    dmg *= tgt.dmgTakenMult * (1 + this.statusSum(tgt, 'mark') / 100);
    if (!info.trueDmg) dmg *= 100 / (100 + Math.max(0, tgt.armor));
    dmg *= this.wrathMult();
    dmg = Math.max(1, Math.round(dmg));

    const absorbed = Math.min(tgt.shield, dmg);
    tgt.shield -= absorbed;
    tgt.hp -= dmg - absorbed;
    this.emit({ t: 'dmg', uid: tgt.uid, amount: dmg, crit, kind: info.kind });

    if (src && src.alive && src.lifesteal > 0 && info.kind !== 'dot') this.heal(null, src, dmg * src.lifesteal);
    tgt.energy = Math.min(100, tgt.energy + 3 * tgt.energyMult);

    if (src && !info.noProc && info.kind !== 'dot') {
      src.onHitLand?.(this, src, tgt, dmg, info);
      if (src.side === 'hero') for (const e of this.effects) e.hooks.onHit?.(this, src, tgt, dmg, info, e.owner);
    }
    if (tgt.side === 'hero') for (const e of this.effects) e.hooks.onHurt?.(this, tgt, src, dmg, e.owner);
    tgt.onHurt?.(this, tgt, src, dmg);
    if (tgt.hp <= 0) this.kill(tgt, src);
    return dmg;
  }

  kill(u: Unit, killer: Unit | null): void {
    if (!u.alive) return;
    if (u.cheatDeath > 0) {
      u.cheatDeath--;
      u.hp = u.maxHp * 0.3;
      this.emit({ t: 'status', uid: u.uid, text: 'DEFIED DEATH', color: '#ffd27a' });
      return;
    }
    u.alive = false;
    u.hp = 0;
    u.shield = 0;
    u.deathTime = this.time;
    this.emit({ t: 'death', uid: u.uid });
    u.onDeath?.(this, u, killer);
    for (const o of this.units) if (o.alive && o !== u) o.onOtherDeath?.(this, o, u);
    if (u.side === 'enemy') {
      if (!u.summon) this.kills++;
      for (const e of this.effects) e.hooks.onKill?.(this, killer, u, e.owner);
    } else if (!u.summon) {
      for (const e of this.effects) e.hooks.onAllyDeath?.(this, u, e.owner);
    }
  }

  cast(u: Unit): void {
    if (!u.skill) return;
    u.energy = 0;
    this.emit({ t: 'cast', uid: u.uid, name: u.skillName });
    u.skill(this, u);
    if (u.side === 'hero') for (const e of this.effects) e.hooks.onCast?.(this, u, e.owner);
  }

  step(dt: number): void {
    if (this.outcome) return;
    this.time += dt;
    if (!this.wrathAnnounced && this.time > WRATH_START) {
      this.wrathAnnounced = true;
      this.emit({ t: 'banner', text: "The Throne's Wrath stirs" });
    }

    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.time);
      if (due.length) {
        this.pending = this.pending.filter((p) => p.at > this.time);
        for (const p of due) p.fn();
      }
    }

    for (const e of this.effects) e.hooks.onTick?.(this, dt, e.owner);

    for (const u of this.units.slice()) {
      if (!u.alive) continue;
      this.tickUnit(u, dt);
    }
    this.checkOutcome();
  }

  private tickUnit(u: Unit, dt: number): void {
    let dot = 0;
    let regen = 0;
    let dotSrc: number | undefined;
    for (const s of u.statuses) {
      s.dur -= dt;
      if (s.kind === 'burn' || s.kind === 'bleed') {
        dot += s.power * dt;
        dotSrc ??= s.src;
      } else if (s.kind === 'regen') regen += s.power * dt;
    }
    u.statuses = u.statuses.filter((s) => s.dur > 0);
    if (regen > 0) {
      const before = u.hp;
      u.hp = Math.min(u.maxHp, u.hp + regen * u.healTakenMult);
      u.dotAcc -= u.hp - before; // regen ticks show up as net healing
    }
    if (dot > 0) u.dotAcc += dot;
    u.dotEmit -= dt;
    if (u.dotEmit <= 0 && u.dotAcc >= 1) {
      u.dotEmit = 0.5;
      const amt = Math.floor(u.dotAcc);
      u.dotAcc -= amt;
      const src = dotSrc ? (this.units.find((o) => o.uid === dotSrc) ?? null) : null;
      this.dealDamage(src, u, amt, { kind: 'dot', trueDmg: true, canCrit: false, noDodge: true });
      if (!u.alive) return;
    } else if (u.dotAcc < -1 && u.dotEmit <= 0) {
      u.dotEmit = 0.5;
      this.emit({ t: 'heal', uid: u.uid, amount: Math.round(-u.dotAcc) });
      u.dotAcc = 0;
    }

    u.tick?.(this, u, dt);
    if (!u.alive || this.has(u, 'stun')) return;

    const haste = this.statusSum(u, 'haste');
    u.atkTimer -= dt * Math.max(0.2, 1 + haste / 100);
    if (u.atkTimer <= 0) {
      u.atkTimer += u.interval;
      const acted = u.basic ? u.basic(this, u) : false;
      if (!acted) {
        const t = this.pickTarget(u);
        if (t) this.strike(u, t, 1);
      }
      u.energy += u.energyPerAttack * u.energyMult;
    }
    if (u.skill && u.energy >= 100) this.cast(u);
  }

  private checkOutcome(): void {
    const heroesAlive = this.units.some((u) => u.side === 'hero' && u.alive && !u.summon);
    if (!heroesAlive) {
      if (this.flaskCharges > 0) {
        this.flaskCharges--;
        this.flaskUsed = true;
        this.emit({ t: 'banner', text: 'The Crimson Flask is drunk' });
        for (const h of this.heroes()) this.revive(h, this.flaskPower);
        return;
      }
      this.outcome = 'lose';
      return;
    }
    if (!this.units.some((u) => u.side === 'enemy' && u.alive)) this.outcome = 'win';
  }
}
