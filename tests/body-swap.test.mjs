import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { cycle, transferredOwnership, escapeHTML, reassign, restrictPlan } from '../body-swap/scripts/core.mjs';

test('random cycles never keep a body or lose a participant', () => {
  for (let size = 2; size <= 30; size++) for (let attempt = 0; attempt < 50; attempt++) {
    const entries = Array.from({ length: size }, (_, id) => ({ id }));
    const result = cycle(entries);
    assert.equal(new Set(result.map(r => r.target)).size, size);
    assert.ok(result.every(r => r.source !== r.target));
  }
  assert.deepEqual(cycle([1]), []);
});

test('permissions override inherited control and preserve unrelated access', () => {
  const original = { default: 3, a: 3, observer: 2 };
  assert.deepEqual(transferredOwnership(original, ['a', 'b'], ['b']), { default: 3, a: 0, b: 3, observer: 2 });
  assert.equal(original.a, 3);
  assert.equal(escapeHTML('<img>'), '&lt;img&gt;');
});

async function harness({ resistance = false, enemy = false } = {}) {
  const hooks = new Map(), settings = new Map(), documents = new Map(), messages = [];
  const clone = value => structuredClone(value);
  const actors = [], players = [];
  for (let i = 0; i < 3; i++) {
    const actor = { id: `a${i}`, uuid: `Actor.a${i}`, name: `Body ${i}`, ownership: { default: 0, [`u${i}`]: 3 }, system: { hp: 20 }, async update(data) { Object.assign(this, clone(data)); } };
    actors.push(actor); documents.set(actor.uuid, actor);
    players.push({ id: `u${i}`, name: `Player ${i}`, isGM: false, character: actor, async update(data) { this.character = actors.find(a => a.id === data.character) ?? null; } });
  }
  if (enemy) players[2].character = null;
  const gm = { id: 'gm', isGM: true, name: 'GM' };
  const users = [...players, gm]; users.get = id => users.find(u => u.id === id); users.activeGM = gm;
  actors.get = id => actors.find(a => a.id === id);
  const tokens = actors.map((actor, i) => ({ uuid: `Scene.s.Token.t${i}`, name: actor.name, actor, actorId: actor.id, actorLink: true }));
  for (const token of tokens) documents.set(token.uuid, token);
  let interval, dialog;
  const canvas = { scene: { id: 's' }, tokens: { controlled: tokens.map(document => ({ document })), placeables: tokens.map(document => ({ document })) } };
  const module = {};
  const context = vm.createContext({
    cycle, transferredOwnership, esc: escapeHTML, reassign, restrictPlan, console, Set, Map, Date,
    foundry: { utils: { deepClone: clone, randomID: () => 'session-1' } },
    game: { settings: { register: (_, key, opts) => settings.set(key, clone(opts.default)), get: (_, key) => settings.get(key), set: async (_, key, value) => { settings.set(key, clone(value)); } }, users, user: gm, actors, packs: [], system: { id: 'dnd5e' }, modules: { get: () => module }, messages: { contents: messages } },
    canvas,
    Dialog: class { constructor(data) { dialog = data; } render() {} },
    setTimeout,
    Hooks: { once: (name, fn) => hooks.set(name, fn), on: (name, fn) => hooks.set(name, fn) },
    ui: { notifications: { error() {}, info() {}, warn() {} } },
    ChatMessage: { create: async data => { messages.push(data); return data; } },
    fromUuid: async uuid => documents.get(uuid),
    setInterval: (fn, duration) => { if (duration === 5000) interval = fn; }
  });
  const source = (await fs.readFile(new URL('../body-swap/scripts/body-swap.js', import.meta.url), 'utf8')).replace(/^import .*\n/, '');
  vm.runInContext(source, context);
  hooks.get('init')(); settings.set('resistance', resistance); hooks.get('ready')();
  return { api: module.api, settings, actors, players, tokens, hooks, messages, interval, gm, canvas, game: context.game, getDialog: () => dialog };
}

test('swaps control and sheets, then restores exact original permissions without reverting HP', async () => {
  const h = await harness();
  const original = structuredClone(h.actors.map(a => a.ownership));
  await h.api.start();
  assert.equal(h.api.status().phase, 'active');
  for (let i = 0; i < 3; i++) {
    assert.notEqual(h.players[i].character.id, `a${i}`);
    assert.equal(h.players[i].character.ownership[`u${i}`], 3);
    assert.equal(h.actors[i].ownership[`u${i}`], 0);
  }
  h.actors[0].system.hp = 7;
  await h.api.revert();
  assert.deepEqual(h.actors.map(a => a.ownership), original);
  assert.deepEqual(h.players.map(u => u.character.id), ['a0', 'a1', 'a2']);
  assert.equal(h.actors[0].system.hp, 7);
  assert.equal(h.api.status().phase, undefined);
});

test('successful and unauthorized resistance rolls cannot cause a swap', async () => {
  const h = await harness({ resistance: true });
  await h.api.start();
  const send = async (i, total, user = h.players[i]) => {
    const flags = { result: true, request: 'session-1', token: h.tokens[i].uuid };
    h.hooks.get('createChatMessage')({ user, rolls: [{ total }], getFlag: (_, key) => flags[key] });
    await new Promise(resolve => setTimeout(resolve, 10));
  };
  await send(0, 1, h.players[1]);
  assert.equal(h.api.status().rolls[h.tokens[0].uuid], undefined);
  await send(0, 15);
  await send(1, 1);
  await send(2, 2);
  assert.equal(h.players[0].character.id, 'a0');
  assert.equal(h.players[1].character.id, 'a2');
  assert.equal(h.players[2].character.id, 'a1');
  await h.api.revert();
});

test('unassigned enemies are excluded by default', async () => {
  const h = await harness({ enemy: true });
  await h.api.start();
  assert.equal(h.players[0].character.id, 'a1');
  assert.equal(h.players[1].character.id, 'a0');
  assert.equal(h.actors[2].ownership.u2, 3);
  await h.api.revert();
});

test('a failed ownership mutation rolls back and preserves recovery until successful', async () => {
  const h = await harness();
  const originalUpdate = h.actors[1].update;
  h.actors[1].update = async () => { throw new Error('simulated permission failure'); };
  await assert.rejects(h.api.start());
  assert.equal(h.api.status().phase, 'reverting');
  h.actors[1].update = originalUpdate;
  await h.api.revert();
  assert.equal(h.api.status().phase, undefined);
  assert.deepEqual(h.players.map(u => u.character.id), ['a0', 'a1', 'a2']);
});

test('expired swaps revert through the primary GM timer', async () => {
  const h = await harness();
  h.settings.set('duration', 1);
  await h.api.start();
  h.settings.get('state').expires = Date.now() - 1;
  h.interval();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(h.api.status().phase, undefined);
});

test('shared ownership, observer vision, and offline account permissions restore exactly', async () => {
  const h = await harness();
  h.actors[0].ownership = { default: 1, u0: 3, u1: 3, u2: 2, offlinePartner: 3 };
  h.actors[1].ownership = { default: 0, u0: 3, u1: 3, u2: 3 };
  h.actors[2].ownership = { default: 2, u0: 3, u1: 2, u2: 3 };
  const originals = structuredClone(h.actors.map(a => a.ownership));
  await h.api.start();
  await h.api.revert();
  assert.deepEqual(h.actors.map(a => a.ownership), originals);
});

test('destination edits displace the previous occupant into the freed body', () => {
  const plan = { a: 'b', b: 'c', c: 'd', d: 'a' };
  const result = reassign(plan, 'a', 'd');
  assert.deepEqual(result, { a: 'd', b: 'c', c: 'b', d: 'a' });
  assert.equal(new Set(Object.values(result)).size, 4);
  assert.equal(plan.a, 'b');
});

test('resistance reconnects cycles while isolated survivors stay put', () => {
  assert.deepEqual(restrictPlan({ a: 'b', b: 'c', c: 'a', d: 'e', e: 'd' }, ['a', 'c', 'e']), { a: 'c', c: 'a', e: 'e' });
});

test('zero or one selection opens scene-wide editor without changing permissions', async () => {
  for (const count of [0, 1]) {
    const h = await harness();
    h.canvas.tokens.controlled = h.canvas.tokens.controlled.slice(0, count);
    await h.api.start();
    const dialog = h.getDialog();
    assert.ok(dialog.content.includes('Body 2'));
    assert.equal(h.api.status().phase, undefined);
    assert.deepEqual(h.players.map(u => u.character.id), ['a0', 'a1', 'a2']);
  }
});

test('editor destination changes update all dropdowns and execute the displayed plan', async () => {
  const h = await harness();
  await h.api.configure();
  const dialog = h.getDialog();
  const selects = h.tokens.map(t => ({ dataset: { swapSource: t.uuid }, value: '' }));
  const notes = h.tokens.map(t => ({ dataset: { swapNote: t.uuid }, textContent: '' }));
  let change;
  dialog.render({ find(selector) { return {
    each(fn) { (selector.includes('source') ? selects : selector.includes('note') ? notes : []).forEach((el, i) => fn(i, el)); },
    on(_, fn) { if (selector === '[data-swap-source]') change = fn; }
  }; } });
  const before = Object.fromEntries(selects.map(s => [s.dataset.swapSource, s.value]));
  const destination = h.tokens[2].uuid;
  selects[0].value = destination;
  change({ currentTarget: selects[0] });
  const expected = reassign(before, h.tokens[0].uuid, destination);
  assert.deepEqual(Object.fromEntries(selects.map(s => [s.dataset.swapSource, s.value])), expected);
  dialog.buttons.apply.callback();
  await new Promise(resolve => setTimeout(resolve, 20));
  for (let i = 0; i < 3; i++) assert.equal(h.players[i].character.id, h.tokens.find(t => t.uuid === expected[h.tokens[i].uuid]).actorId);
  await h.api.revert();
});

test('Pair makes a mutual swap; Leave unchanged locks the body through reshuffling', async () => {
  const h = await harness();
  await h.api.configure();
  const dialog = h.getDialog(), handlers = {};
  const selects = h.tokens.map(t => ({ dataset: { swapSource: t.uuid }, options: h.tokens.map(t => ({ value: t.uuid })) }));
  const checks = h.tokens.map(t => ({ dataset: { swapUnchanged: t.uuid } }));
  const pairs = h.tokens.map(t => ({ dataset: { swapPair: t.uuid } }));
  const elements = { '[data-swap-source]': selects, '[data-swap-unchanged]': checks, '[data-swap-pair]': pairs };
  const html = { find(selector) { return { each(fn) { (elements[selector] ?? []).forEach((el, i) => fn(i, el)); }, on(_, fn) { handlers[selector] = fn; } }; } };
  dialog.render(html);
  const target = selects[0].value;
  handlers['[data-swap-pair]']({ currentTarget: pairs[0] });
  assert.equal(selects.find(s => s.dataset.swapSource === target).value, h.tokens[0].uuid);
  checks[0].checked = true;
  handlers['[data-swap-unchanged]']({ currentTarget: checks[0] });
  assert.equal(selects[0].value, h.tokens[0].uuid);
  assert.equal(selects[0].disabled, true);
  assert.ok(selects[1].options.find(o => o.value === h.tokens[0].uuid).disabled);
  dialog.buttons.random.callback();
  dialog.render(html);
  assert.equal(selects[0].value, h.tokens[0].uuid);
  assert.equal(new Set(selects.map(s => s.value)).size, 3);
  checks[0].checked = false;
  handlers['[data-swap-unchanged]']({ currentTarget: checks[0] });
  assert.equal(selects[0].disabled, false);
  assert.notEqual(selects[0].value, h.tokens[0].uuid);
});

test('active chat card shows countdown, hides player controls, and reverts as GM', async () => {
  const h = await harness();
  h.settings.set('duration', 120);
  await h.api.start();
  const card = h.messages.at(-1);
  assert.equal(card.flags['body-swap'].active, h.api.status().id);
  const label = { tagName: 'SPAN', dataset: { bodySwapActive: h.api.status().id } };
  let click;
  const button = { tagName: 'BUTTON', dataset: { ...label.dataset }, addEventListener(_, fn) { click = fn; } };
  const message = { getFlag: (_, key) => card.flags['body-swap'][key] };
  const html = { find() { return { each(fn) { [label, button].forEach((el, i) => fn(i, el)); } }; } };
  h.game.user = h.players[0];
  h.hooks.get('renderChatMessage')(message, html);
  assert.equal(button.hidden, true);
  assert.match(label.textContent, /Time remaining: 2:00/);
  h.game.user = h.gm;
  h.hooks.get('renderChatMessage')(message, html);
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  await click();
  assert.equal(h.api.status().phase, undefined);
  h.hooks.get('renderChatMessage')(message, html);
  assert.match(label.textContent, /Ended/);
  assert.equal(button.hidden, true);
});
