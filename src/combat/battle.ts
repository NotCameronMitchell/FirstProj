import { ENEMIES } from '../data/enemies';
import { ABILITIES, HEROES, WEAPONS, abilityCd, type Target } from '../data/heroes';
import { Rng } from '../rng';
import { STATUS_INFO, type HeroId, type Side, type Status, type StatusKind } from '../types';

// A deterministic, turn-based fight. Each round every hero acts (in any order
// the player picks), then every enemy acts. Statuses tick at the start of their
// side's phase and count down at the end of it. The battle only records events;
// the renderer plays them back.

export type Style = 'melee' | 'ranged' | 'cast' | 'pet';
export type DmgKind = 'hit' | 'poison' | 'bleed' | 'burn' | 'meeting' | 'reflect' | 'boom';

export type BEvent =
  | { t: 'beat'; dur: number }
  | { t: 'turn'; side: Side; round: number }
  | { t: 'act'; uid: number; to?: number; style: Style; pet?: 'bruno' | 'murphy'; color?: string }
  | { t: 'dmg'; uid: number; amount: number; hp: number; shield: number; crit: boolean; kind: DmgKind }
  | { t: 'heal'; uid: number; amount: number; hp: number }
  | { t: 'shield'; uid: number; shield: number }
  | { t: 'miss'; uid: number; text: string }
  | { t: 'status'; uid: number; text: string; color: string }
  | { t: 'say'; uid: number; text: string }
  | { t: 'cast'; uid: number; name: string; ult: boolean }
  | { t: 'death'; uid: number }
  | { t: 'revive'; uid: number; hp: number }
  | { t: 'aoe'; side: Side; color: string }
  | { t: 'shake'; power: number }
  | { t: 'banner'; text: string; sub?: string }
  | { t: 'sprite'; uid: number; sprite: string }
  | { t: 'fx'; kind: 'wife' | 'truck'; uid: number };

/** Things that happened in a fight, for achievements. */
export interface FightStats {
  weGoNext: boolean;
  coleRevived: boolean;
  blackjack: boolean;
  /** Most enemies hit by a single Nissan Titan. */
  titanHits: number;
}

export interface Unit {
  uid: number;
  side: Side;
  key: string; // hero id or enemy id
  name: string;
  sprite: string;
  /** The sprite it started the fight with. */
  baseSprite: string;
  /** Sprite for a transformed form (Cole's Transfer to UW, James's JimmyTrains). */
  altSprite?: string;
  slot: number;
  boss: boolean;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  crit: number;
  dodge: number;
  dmgBonus: number;
  parry: number;
  shield: number;
  alive: boolean;
  statuses: Status[];
  cd: Record<string, number>;
  ranks: Record<string, number>;
  weapon: string;
  dmgTaken: number;
  aura: number;
  /** Cole's "next attack" effects. */
  prep: { burn?: number; lesson?: number; stun?: number; argue?: number };
  passiveUsed: boolean;
  reviveNext: boolean;
}

export interface HeroSetup {
  id: HeroId;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  crit: number;
  dodge: number;
  ranks: Record<string, number>;
  weapon: string;
  /** Outfit sprites; default to the hero's own. */
  sprite?: string;
  altSprite?: string;
  /** Starting shield, and event tags shown for the whole fight. */
  shield?: number;
  tags?: StatusKind[];
}

export interface EnemySetup {
  id: string;
  hpMult: number;
  atkMult: number;
  /** Shown after the name (e.g. "Empowered"). */
  suffix?: string;
}

export interface HitOpts {
  noDodge?: boolean;
  noCrit?: boolean;
  /** Fixed damage instead of ATK x mult. */
  flat?: number;
  /** Ignores armor and guard. */
  pierce?: boolean;
  /** A weapon attack (Cole's prepared effects apply). */
  weapon?: boolean;
  bonus?: number;
}

export interface ActionOpt {
  id: string;
  name: string;
  kind: 'attack' | 'ability' | 'ultimate';
  target: Target;
  ready: boolean;
  cdLeft: number;
  quick: boolean;
  rank: number;
  desc: string;
}

const DOTS: StatusKind[] = ['poison', 'bleed', 'burn', 'meeting'];
const STACKING = new Set<StatusKind>([...DOTS, 'empower', 'weaken', 'guard', 'dodge', 'crit', 'regen']);
const DOT_COLOR: Record<string, string> = { poison: '124,255,79', bleed: '255,79,109', burn: '255,154,31', meeting: '180,140,255' };

export class Battle {
  units: Unit[] = [];
  events: BEvent[] = [];
  rng: Rng;
  round = 1;
  phase: 'hero' | 'enemy' | 'over' = 'hero';
  outcome: 'win' | 'lose' | null = null;
  acted = new Set<number>();
  /** Heroes who already used their one quick buff this turn. */
  buffed = new Set<number>();
  kills = 0;
  stats: FightStats = { weGoNext: false, coleRevived: false, blackjack: false, titanHits: 0 };
  /** Stun length of a pending Mind Goblin trap (0 = none). */
  goblin = 0;
  /** Most recent damage dealt by each hero, for High on Potenuse. */
  lastHeroHit: { uid: number; amount: number } | null = null;
  private queue: number[] = [];
  private nextUid = 1;

  constructor(heroes: HeroSetup[], enemies: EnemySetup[], seed: number) {
    this.rng = new Rng(seed);
    heroes.forEach((h, i) => this.units.push(this.makeHero(h, i)));
    enemies.forEach((e, i) => this.units.push(this.makeEnemy(e, i)));
    this.beginHeroPhase(true);
  }

  // ------------------------------------------------------------ setup
  private base(side: Side, key: string, slot: number): Unit {
    return {
      uid: this.nextUid++,
      side,
      key,
      name: key,
      sprite: key,
      baseSprite: key,
      slot,
      boss: false,
      maxHp: 1,
      hp: 1,
      atk: 1,
      def: 0,
      crit: 0.05,
      dodge: 0,
      dmgBonus: 0,
      parry: 0,
      shield: 0,
      alive: true,
      statuses: [],
      cd: {},
      ranks: {},
      weapon: '',
      dmgTaken: 0,
      aura: 0,
      prep: {},
      passiveUsed: false,
      reviveNext: false,
    };
  }

  private makeHero(h: HeroSetup, slot: number): Unit {
    const d = HEROES[h.id];
    const w = WEAPONS[h.weapon];
    const u = this.base('hero', h.id, slot);
    Object.assign(u, {
      name: d.name,
      sprite: h.sprite ?? d.sprite,
      baseSprite: h.sprite ?? d.sprite,
      altSprite: h.altSprite,
      maxHp: h.maxHp,
      hp: Math.max(1, Math.min(h.maxHp, h.hp)),
      atk: h.atk,
      def: h.def + (w.def ?? 0),
      crit: h.crit,
      dodge: h.dodge,
      dmgBonus: w.dmgBonus ?? 0,
      parry: w.parry ?? 0,
      ranks: { ...h.ranks },
      weapon: h.weapon,
      shield: Math.round(h.shield ?? 0),
    });
    for (const kind of h.tags ?? []) u.statuses.push({ kind, dur: 999, power: 0 });
    for (const id of [...d.abilities, d.ultimate]) u.cd[id] = ABILITIES[id].first ?? 0;
    return u;
  }

  private makeEnemy(e: EnemySetup, slot: number): Unit {
    const d = ENEMIES[e.id];
    const u = this.base('enemy', e.id, slot);
    const hp = Math.round(d.hp * e.hpMult);
    Object.assign(u, { name: e.suffix ? `${d.name} (${e.suffix})` : d.name, sprite: d.sprite, baseSprite: d.sprite, boss: !!d.boss, maxHp: hp, hp, atk: d.atk * e.atkMult, def: d.def ?? 0, dodge: d.dodge ?? 0, crit: d.crit ?? 0.05 });
    for (const s of d.skills) u.cd[s.id] = s.first ?? 0;
    return u;
  }

  // ------------------------------------------------------------ queries
  unit(uid: number): Unit | undefined {
    return this.units.find((u) => u.uid === uid);
  }
  heroes(): Unit[] {
    return this.units.filter((u) => u.side === 'hero');
  }
  enemies(): Unit[] {
    return this.units.filter((u) => u.side === 'enemy');
  }
  hero(id: HeroId): Unit | undefined {
    return this.units.find((u) => u.side === 'hero' && u.key === id);
  }
  targetable(u: Unit): boolean {
    return u.alive && !this.has(u, 'away');
  }
  foesOf(u: Unit): Unit[] {
    return this.units.filter((o) => o.side !== u.side && this.targetable(o));
  }
  alliesOf(u: Unit): Unit[] {
    return this.units.filter((o) => o.side === u.side && this.targetable(o));
  }
  has(u: Unit, kind: StatusKind): boolean {
    return u.statuses.some((s) => s.kind === kind);
  }
  power(u: Unit, kind: StatusKind): number {
    return u.statuses.reduce((s, x) => (x.kind === kind ? s + x.power : s), 0);
  }
  rank(u: Unit, id: string): number {
    return u.ranks[id] ?? 1;
  }
  /** Damage multiplier from buffs, debuffs and passives; also scales DoTs and effects. */
  mult(u: Unit): number {
    return Math.max(0.1, 1 + this.power(u, 'empower') + u.dmgBonus + u.aura - this.power(u, 'weaken'));
  }
  /** Heroes who can still take an action this phase. */
  ready(): Unit[] {
    if (this.phase !== 'hero') return [];
    return this.heroes().filter((h) => h.alive && !this.acted.has(h.uid) && !this.has(h, 'stun') && !this.has(h, 'away'));
  }

  actions(u: Unit): ActionOpt[] {
    const w = WEAPONS[u.weapon];
    const silenced = this.has(u, 'silence');
    const out: ActionOpt[] = [
      { id: 'attack', name: w.name, kind: 'attack', target: w.target, ready: true, cdLeft: 0, quick: false, rank: 0, desc: w.desc },
    ];
    const d = HEROES[u.key as HeroId];
    for (const id of [...d.abilities, d.ultimate]) {
      const ab = ABILITIES[id];
      const r = this.rank(u, id);
      const cdLeft = u.cd[id] ?? 0;
      out.push({ id, name: ab.name, kind: ab.kind === 'ultimate' ? 'ultimate' : 'ability', target: ab.target, ready: !silenced && cdLeft <= 0 && !(ab.quick && this.buffed.has(u.uid)), cdLeft, quick: !!ab.quick, rank: r, desc: ab.desc(r) });
    }
    return out;
  }

  // ------------------------------------------------------------ events
  emit(e: BEvent): void {
    this.events.push(e);
  }
  beat(dur = 0.45): void {
    this.emit({ t: 'beat', dur });
  }
  say(u: Unit, text: string): void {
    this.emit({ t: 'say', uid: u.uid, text });
  }
  anim(u: Unit, to: Unit | undefined, style: Style, extra: { pet?: 'bruno' | 'murphy'; color?: string } = {}): void {
    this.emit({ t: 'act', uid: u.uid, to: to?.uid, style, ...extra });
  }
  aoe(side: Side, color: string): void {
    this.emit({ t: 'aoe', side, color });
  }
  shake(power: number): void {
    this.emit({ t: 'shake', power });
  }
  note(u: Unit, text: string, color = '#ffffff'): void {
    this.emit({ t: 'status', uid: u.uid, text, color });
  }

  // ------------------------------------------------------------ effects
  addStatus(u: Unit, kind: StatusKind, dur: number, power = 0, src?: number, quiet = false): void {
    if (!u.alive || dur <= 0) return;
    if (kind === 'stun' && u.boss && this.has(u, 'resolve')) {
      this.note(u, 'Resists', '#ffffff');
      return;
    }
    const cur = u.statuses.find((s) => s.kind === kind);
    if (cur) {
      cur.power = STACKING.has(kind) ? cur.power + power : Math.max(cur.power, power);
      cur.dur = Math.max(cur.dur, dur);
      if (src !== undefined) cur.src = src;
    } else u.statuses.push({ kind, dur, power, src });
    const info = STATUS_INFO[kind];
    if (!quiet && !info.hidden) this.note(u, info.label, info.color);
  }

  removeStatus(u: Unit, kind: StatusKind): void {
    u.statuses = u.statuses.filter((s) => s.kind !== kind);
  }

  /** Applies a damage-over-time effect scaled from the source's attack. */
  dot(src: Unit, tgt: Unit, kind: 'poison' | 'bleed' | 'burn' | 'meeting', atkFrac: number, dur: number): void {
    this.addStatus(tgt, kind, dur, Math.max(1, src.atk * atkFrac * this.mult(src)), src.uid);
  }

  stun(tgt: Unit, dur: number, chance = 1): boolean {
    if (!tgt.alive || !this.rng.chance(chance)) return false;
    this.addStatus(tgt, 'stun', dur);
    return true;
  }

  heal(u: Unit, amount: number): number {
    if (!u.alive) return 0;
    const a = Math.max(0, Math.min(u.maxHp - u.hp, Math.round(amount)));
    u.hp += a;
    if (a > 0) this.emit({ t: 'heal', uid: u.uid, amount: a, hp: u.hp });
    return a;
  }

  shieldUp(u: Unit, amount: number): void {
    if (!u.alive) return;
    u.shield = Math.min(u.maxHp * 2, u.shield + Math.round(amount));
    this.emit({ t: 'shield', uid: u.uid, shield: u.shield });
  }

  /** An attack from src to tgt. Returns the damage dealt (0 on a miss or block). */
  hit(src: Unit, tgt: Unit, mult: number, o: HitOpts = {}): number {
    if (!tgt.alive) return 0;
    let dmg = (o.flat ?? src.atk * mult) * Math.max(0.1, this.mult(src) + (o.bonus ?? 0) + (o.weapon ? (src.prep.lesson ?? 0) : 0));
    let crit = false;
    if (!o.noCrit && o.flat === undefined && this.rng.chance(src.crit + this.power(src, 'crit'))) {
      dmg *= 1.6;
      crit = true;
    }
    const noDodge = o.noDodge || (o.weapon && src.prep.argue !== undefined);
    if (!noDodge && src !== tgt && this.rng.chance(Math.min(0.6, tgt.dodge + this.power(tgt, 'dodge')))) {
      this.emit({ t: 'miss', uid: tgt.uid, text: 'Dodge' });
      return 0;
    }
    if (tgt.parry && src !== tgt && this.rng.chance(tgt.parry)) {
      this.emit({ t: 'miss', uid: tgt.uid, text: 'Parry' });
      return 0;
    }
    if (!o.pierce) dmg *= 1 - Math.min(0.75, tgt.def + this.power(tgt, 'guard'));
    const amount = Math.max(1, Math.round(dmg));
    if (this.has(tgt, 'protect')) {
      this.emit({ t: 'miss', uid: tgt.uid, text: 'Blocked' });
      const r = this.power(tgt, 'reflect');
      if (r > 0 && src !== tgt && src.alive) this.damage(src, Math.max(1, Math.round(amount * r)), 'reflect');
      return 0;
    }
    this.damage(tgt, amount, 'hit', crit);
    if (src.side === 'hero' && tgt.side === 'enemy') this.lastHeroHit = { uid: src.uid, amount };
    if (o.weapon && src.alive) {
      if (src.prep.burn) this.addStatus(tgt, 'burn', 3, src.prep.burn, src.uid);
      if (src.prep.stun) this.stun(tgt, 1, src.prep.stun);
    }
    return amount;
  }

  /** Raw damage after mitigation: eats shield first, then health. */
  damage(u: Unit, amount: number, kind: DmgKind, crit = false): void {
    if (!u.alive) return;
    let rest = amount;
    if (u.shield > 0) {
      const ab = Math.min(u.shield, rest);
      u.shield -= ab;
      rest -= ab;
    }
    u.hp = Math.max(0, u.hp - rest);
    u.dmgTaken += amount;
    this.emit({ t: 'dmg', uid: u.uid, amount, hp: u.hp, shield: u.shield, crit, kind });
    if (u.hp <= 0) this.kill(u);
  }

  kill(u: Unit): void {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    u.shield = 0;
    u.statuses = [];
    this.emit({ t: 'death', uid: u.uid });
    if (u.side === 'enemy') this.kills++;
    if (u.key === 'cole' && !u.passiveUsed) {
      u.passiveUsed = true;
      u.reviveNext = true;
      this.note(u, '9 Iron on Ciabatta...', '#ffd23f');
    }
  }

  // ------------------------------------------------------------ turn flow
  private tickSide(side: Side): void {
    for (const u of this.units) {
      if (u.side !== side || !u.alive) continue;
      for (const s of [...u.statuses]) {
        if (DOTS.includes(s.kind)) {
          this.damage(u, Math.max(1, Math.round(s.power)), s.kind as DmgKind);
          if (!u.alive) break;
        } else if (s.kind === 'regen') this.heal(u, s.power);
      }
      for (const k of Object.keys(u.cd)) if (u.cd[k] > 0) u.cd[k]--;
    }
  }

  private decrement(side: Side): void {
    for (const u of this.units) {
      if (u.side !== side) continue;
      const before = u.statuses.length;
      const stunned = this.has(u, 'stun');
      for (const s of u.statuses) s.dur--;
      u.statuses = u.statuses.filter((s) => s.dur > 0);
      if (u.boss && stunned && !this.has(u, 'stun') && u.statuses.length < before) u.statuses.push({ kind: 'resolve', dur: 1, power: 0 });
      // James slims back down when JimmyTrains wears off.
      if (u.key === 'james' && u.alive && u.sprite !== u.baseSprite && !this.has(u, 'reflect')) {
        u.sprite = u.baseSprite;
        this.emit({ t: 'sprite', uid: u.uid, sprite: u.sprite });
      }
    }
  }

  private beginHeroPhase(first = false): void {
    if (!first) this.round++;
    this.phase = 'hero';
    this.acted.clear();
    this.buffed.clear();
    this.emit({ t: 'turn', side: 'hero', round: this.round });
    for (const h of this.heroes()) if (h.reviveNext) this.reviveCole(h);
    this.tickSide('hero');
    const james = this.hero('james');
    if (james && james.alive && this.round % 3 === 0) ABILITIES.uncrustable.use?.(this, james, undefined, this.rank(james, 'uncrustable'));
    this.checkWeGoNext();
    if (this.checkEnd()) return;
    this.skipIdle();
  }

  private reviveCole(u: Unit): void {
    u.reviveNext = false;
    u.alive = true;
    u.hp = u.maxHp;
    this.emit({ t: 'revive', uid: u.uid, hp: u.hp });
    ABILITIES.nine_iron.use?.(this, u, undefined, this.rank(u, 'nine_iron'));
    this.beat(0.6);
  }

  /** Stunned or removed heroes lose their action. */
  private skipIdle(): void {
    for (const h of this.heroes()) {
      if (!h.alive || this.acted.has(h.uid)) continue;
      if (this.has(h, 'stun')) {
        this.note(h, 'Stunned', STATUS_INFO.stun.color);
        this.acted.add(h.uid);
      } else if (this.has(h, 'away')) this.acted.add(h.uid);
    }
    if (this.ready().length === 0) this.endHeroPhase();
  }

  /** The player's move for one hero. Returns false if it isn't allowed. */
  act(uid: number, actionId: string, targetUid?: number): boolean {
    const u = this.unit(uid);
    if (!u || !this.ready().includes(u)) return false;
    const opt = this.actions(u).find((a) => a.id === actionId);
    if (!opt || !opt.ready) return false;
    let t = targetUid !== undefined ? this.unit(targetUid) : undefined;
    if (opt.target === 'enemy' && (!t || !this.foesOf(u).includes(t))) t = this.foesOf(u)[0];
    if (opt.target === 'ally' && (!t || !this.alliesOf(u).includes(t))) t = u;
    if (opt.target === 'enemy' && !t) return false;

    if (this.has(u, 'confuse') && !opt.quick && this.rng.chance(0.5)) {
      this.note(u, 'Confused!', STATUS_INFO.confuse.color);
      const others = this.alliesOf(u).filter((a) => a !== u);
      const victim = others.length ? this.rng.pick(others) : u;
      this.anim(u, victim, 'melee');
      this.hit(u, victim, 1, { noCrit: true });
      this.acted.add(uid);
      this.beat();
      this.afterAction();
      return true;
    }

    if (actionId === 'attack') {
      WEAPONS[u.weapon].attack(this, u, t);
      if (u.key === 'cole') this.finishPrep(u);
    } else {
      const ab = ABILITIES[actionId];
      const r = this.rank(u, actionId);
      u.cd[actionId] = abilityCd(ab, r);
      this.emit({ t: 'cast', uid: u.uid, name: ab.name, ult: ab.kind === 'ultimate' });
      ab.use?.(this, u, t, r);
    }
    if (u.key === 'cam' && !opt.quick) {
      const r = this.rank(u, 'aura_farming');
      u.aura += 0.03 + 0.01 * (r - 1);
    }
    if (opt.quick) this.buffed.add(uid);
    else this.acted.add(uid);
    this.beat();
    this.afterAction();
    return true;
  }

  private finishPrep(u: Unit): void {
    if (u.prep.argue !== undefined) {
      for (const e of this.foesOf(u)) this.addStatus(e, 'poison', 3, u.prep.argue, u.uid);
      this.aoe('enemy', DOT_COLOR.poison);
    }
    u.prep = {};
  }

  private afterAction(): void {
    this.checkWeGoNext();
    if (this.checkEnd()) return;
    if (this.phase === 'hero' && this.ready().length === 0) this.endHeroPhase();
  }

  private endHeroPhase(): void {
    this.decrement('hero');
    this.phase = 'enemy';
    this.emit({ t: 'turn', side: 'enemy', round: this.round });
    this.tickSide('enemy');
    this.checkWeGoNext();
    if (this.checkEnd()) return;
    this.queue = this.enemies()
      .filter((e) => e.alive)
      .map((e) => e.uid);
  }

  /** Plays the next enemy's turn (one per call so the renderer can keep up). */
  enemyStep(): void {
    if (this.phase !== 'enemy') return;
    while (this.queue.length) {
      const u = this.unit(this.queue.shift()!)!;
      if (!u.alive) continue;
      this.enemyAct(u);
      this.beat();
      this.checkWeGoNext();
      this.checkEnd();
      return;
    }
    this.decrement('enemy');
    this.beginHeroPhase();
  }

  private enemyAct(u: Unit): void {
    if (this.has(u, 'stun')) {
      this.note(u, 'Stunned', STATUS_INFO.stun.color);
      return;
    }
    if (this.has(u, 'confuse') && this.rng.chance(0.75)) {
      this.note(u, 'Confused!', STATUS_INFO.confuse.color);
      this.anim(u, u, 'melee');
      this.hit(u, u, 1 + this.power(u, 'confuse'), { noDodge: true, noCrit: true });
      return;
    }
    const d = ENEMIES[u.key];
    for (const sk of d.skills) {
      if ((u.cd[sk.id] ?? 0) > 0) continue;
      u.cd[sk.id] = sk.cd;
      if (this.goblin > 0) {
        const cam = this.hero('cam');
        this.emit({ t: 'cast', uid: u.uid, name: sk.name, ult: false });
        this.note(u, 'Mind Goblin!', '#7cff4f');
        if (cam?.alive) this.say(cam, this.rng.pick(['Wagwan', 'SMH my head']));
        this.addStatus(u, 'stun', this.goblin);
        this.goblin = 0;
        return;
      }
      this.emit({ t: 'cast', uid: u.uid, name: sk.name, ult: !!sk.ult });
      if (sk.ult) this.emit({ t: 'banner', text: sk.name, sub: u.name });
      sk.use(this, u);
      return;
    }
    const t = this.pickHeroTarget(u);
    if (!t) return;
    this.anim(u, t, d.style, { color: d.color });
    this.hit(u, t, 1);
  }

  /** Taunts win; otherwise front-liners draw more attacks. */
  pickHeroTarget(u: Unit): Unit | undefined {
    const taunt = u.statuses.find((s) => s.kind === 'taunt');
    if (taunt?.src !== undefined) {
      const src = this.unit(taunt.src);
      if (src && this.targetable(src)) return src;
    }
    const hs = this.foesOf(u);
    if (!hs.length) return undefined;
    return this.rng.weighted(hs, (h) => (h.side === 'hero' && HEROES[h.key as HeroId].row === 'front' ? 1.6 : 1));
  }

  private checkWeGoNext(): void {
    const m = this.hero('mason');
    if (!m || !m.alive || m.passiveUsed || this.phase === 'over') return;
    const alive = this.heroes().filter((h) => h.alive);
    const th = 0.15 + 0.02 * (this.rank(m, 'we_go_next') - 1);
    if (!alive.length || !alive.every((h) => h.hp < h.maxHp * th)) return;
    ABILITIES.we_go_next.use?.(this, m, undefined, this.rank(m, 'we_go_next'));
  }

  private checkEnd(): boolean {
    if (this.phase === 'over') return true;
    if (!this.enemies().some((e) => e.alive)) {
      this.phase = 'over';
      this.outcome = 'win';
      return true;
    }
    if (!this.heroes().some((h) => h.alive || h.reviveNext)) {
      this.phase = 'over';
      this.outcome = 'lose';
      return true;
    }
    return false;
  }
}
