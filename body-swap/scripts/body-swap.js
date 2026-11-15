import { cycle, transferredOwnership, escapeHTML as esc, reassign, restrictPlan } from './core.mjs';

const ID = 'body-swap';
const copy = value => foundry.utils.deepClone(value);
const setting = key => game.settings.get(ID, key);
const state = () => copy(setting('state'));
const save = value => game.settings.set(ID, 'state', value);
const primary = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
let queue = Promise.resolve();
const serialized = fn => {
  const job = queue.then(fn);
  queue = job.catch(error => { console.error(ID, error); ui.notifications.error(`Body Swap: ${error.message}`); });
  return job;
};
function requireGM() {
  if (!primary()) throw new Error('Run this as the primary active GM.');
}
async function chat(content, flags) {
  return ChatMessage.create({ content, speaker: { alias: 'Body Swap' }, ...(flags ? { flags: { [ID]: flags } } : {}) });
}

Hooks.once('init', () => {
  const register = (key, name, type, defaultValue, hint, extra = {}) => game.settings.register(ID, key, {
    name, hint, scope: 'world', config: true, type, default: defaultValue, ...extra
  });
  register('includeEnemies', 'Include enemies and unassigned bodies', Boolean, false, 'Off: only bodies assigned to a non-GM player are eligible. On: selected NPCs can participate; their minds remain GM-controlled.');
  register('compendiumLookup', 'Search Actor compendiums', Boolean, false, 'If a token has no usable Actor, search the Actors sidebar by exact name, then Actor compendiums. Ambiguous matches stop the swap.');
  register('resistance', 'Request Constitution rolls', Boolean, false, 'Successful bodies are excluded. All eligible bodies must roll before the swap occurs. The GM can roll for offline players or NPCs.');
  register('rollType', 'Constitution roll type', String, 'check', '', { choices: { check: 'Ability check', save: 'Saving throw' } });
  register('dc', 'Constitution DC', Number, 15, 'A total equal to or greater than this DC resists the swap.', { range: { min: 1, max: 40, step: 1 } });
  register('duration', 'Revert after seconds', Number, 0, 'Real-world seconds, starting when bodies swap. Zero means manual reversion. An active GM is needed; expired swaps revert when a GM reconnects.');
  game.settings.register(ID, 'state', { scope: 'world', config: false, type: Object, default: {} });
});

async function resolveActor(token, session) {
  if (token.actor) return token.actor;
  let matches = game.actors.filter(a => a.name === token.name);
  if (matches.length > 1) throw new Error(`Multiple sidebar Actors named ${token.name}. Assign the correct Actor to the token first.`);
  if (matches.length === 1) return matches[0];
  if (!setting('compendiumLookup')) throw new Error(`No Actor found for ${token.name}.`);
  matches = [];
  for (const pack of game.packs.filter(p => p.documentName === 'Actor')) {
    const index = await pack.getIndex();
    for (const entry of index.filter(e => e.name === token.name)) matches.push({ pack, id: entry._id });
  }
  if (matches.length !== 1) throw new Error(`Found ${matches.length} compendium Actors named ${token.name}; exactly one is required.`);
  const source = await matches[0].pack.getDocument(matches[0].id);
  const data = game.actors.fromCompendium(source);
  const actor = await Actor.create(data);
  session.imported.push(actor.id);
  await save(session);
  return actor;
}

function openAssignments() {
  requireGM();
  if (state().phase) throw new Error('Revert or cancel the current swap before configuring another.');
  if (!canvas.scene) throw new Error('Open a scene first.');
  const seen = new Set();
  const rows = canvas.tokens.placeables.map(({ document: token }) => {
    const users = game.users.filter(u => !u.isGM && u.character?.id === token.actorId);
    let reason = '';
    if (!setting('includeEnemies') && !users.length) reason = 'Enable Include enemies to use this body';
    const body = token.actor?.uuid;
    if (body && seen.has(body)) reason = 'Another linked token uses this same body';
    if (!reason && body) seen.add(body);
    return { token, actorId: token.actorId, reason, label: `${token.name}${users.length ? ` (${users.map(u => u.name).join(', ')})` : ' (GM)'}` };
  });
  const eligible = rows.filter(row => !row.reason);
  if (eligible.length < 2) throw new Error('This scene needs at least two eligible bodies. Enable Include enemies to include unassigned bodies.');
  const unchanged = new Set();
  const randomPlan = () => {
    const available = eligible.filter(row => !unchanged.has(row.token.uuid));
    return { ...Object.fromEntries(eligible.map(row => [row.token.uuid, row.token.uuid])), ...Object.fromEntries(cycle(available).map(({ source, target }) => [source.token.uuid, target.token.uuid])) };
  };
  let plan = randomPlan();
  let dialog;
  const portrait = row => {
    const src = row.token.texture?.src;
    return (src && !/\.(webm|mp4)(?:[?#]|$)/i.test(src) ? src : row.token.actor?.img) || 'icons/svg/mystery-man.svg';
  };
  const imageStyle = size => `width:${size}px;height:${size}px;object-fit:contain;border:0;display:block;margin:0 auto`;
  const options = eligible.map(row => `<option value="${esc(row.token.uuid)}">${esc(row.label)}</option>`).join('');
  const cards = rows.map(row => `<section style="border:1px solid #999;border-radius:6px;padding:10px;${row.reason ? 'opacity:.55' : ''}">
    ${row.reason ? '' : `<div style="text-align:center;margin-bottom:6px"><small>New body</small><img data-swap-portrait="${esc(row.token.uuid)}" src="icons/svg/mystery-man.svg" alt="New body" style="${imageStyle(80)}"><strong data-swap-destination="${esc(row.token.uuid)}"></strong><div aria-hidden="true">↑</div></div>`}
    <div style="text-align:center"><img src="${esc(portrait(row))}" alt="${esc(row.token.name)} — original body" style="${imageStyle(56)}"><small>Original character</small><strong style="display:block">${esc(row.label)}</strong></div>
    ${row.reason ? `<p>${esc(row.reason)}</p>` : `<label style="display:block;margin-top:8px">Becomes<select style="width:100%" data-swap-source="${esc(row.token.uuid)}">${options}</select></label><button type="button" data-swap-pair="${esc(row.token.uuid)}" title="Make this a mutual two-way swap">Pair ↔</button><label style="display:flex;align-items:center"><input type="checkbox" data-swap-unchanged="${esc(row.token.uuid)}">Leave unchanged</label><small data-swap-note="${esc(row.token.uuid)}"></small>`}</section>`).join('');
  const content = `<p>Choose who each character becomes. Changing a destination exchanges it with its current occupant. “Stays” means that character is unchanged.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;max-height:55vh;overflow:auto;padding:4px">${cards}</div>
    <p>Constitution successes are removed from their assignment cycles; remaining assignments reconnect. A character left alone stays in place.</p>`;
  const refresh = html => {
    html.find('[data-swap-source]').each((_, select) => {
      const source = select.dataset.swapSource;
      select.value = plan[source];
      select.disabled = unchanged.has(source);
      for (const option of select.options ?? []) option.disabled = unchanged.has(option.value) && option.value !== source;
    });
    html.find('[data-swap-unchanged]').each((_, checkbox) => { checkbox.checked = unchanged.has(checkbox.dataset.swapUnchanged); });
    html.find('[data-swap-pair]').each((_, button) => { button.disabled = unchanged.has(button.dataset.swapPair) || plan[button.dataset.swapPair] === button.dataset.swapPair; });
    html.find('[data-swap-note]').each((_, note) => { note.textContent = plan[note.dataset.swapNote] === note.dataset.swapNote ? 'Stays in this body' : ''; });
    html.find('[data-swap-portrait]').each((_, image) => {
      const destination = eligible.find(row => row.token.uuid === plan[image.dataset.swapPortrait]);
      image.src = portrait(destination);
      image.alt = `${destination.token.name} — new body`;
    });
    html.find('[data-swap-destination]').each((_, label) => {
      label.textContent = eligible.find(row => row.token.uuid === plan[label.dataset.swapDestination]).token.name;
    });
  };
  dialog = new Dialog({ title: 'Body Swap — Assign Bodies', content, buttons: {
    random: { label: 'Randomize', callback: () => { plan = randomPlan(); setTimeout(() => dialog.render(true), 0); } },
    apply: { label: 'Enable Body Swap', callback: () => {
      const chosen = copy(plan);
      serialized(async () => {
        const tokens = [];
        for (const row of eligible) {
          const token = await fromUuid(row.token.uuid);
          if (!token || token.actorId !== row.actorId) throw new Error('A scene token changed. Reopen the assignment window.');
          tokens.push(token);
        }
        await start(tokens, chosen);
      });
    } },
    cancel: { label: 'Cancel' }
  }, default: 'apply', render: html => {
    html.find('img').on('error', event => {
      const image = event.currentTarget;
      if (!image.src.endsWith('/icons/svg/mystery-man.svg')) image.src = 'icons/svg/mystery-man.svg';
    });
    refresh(html);
    html.find('[data-swap-source]').on('change', event => {
      if (unchanged.has(event.currentTarget.dataset.swapSource) || unchanged.has(event.currentTarget.value)) return refresh(html);
      plan = reassign(plan, event.currentTarget.dataset.swapSource, event.currentTarget.value);
      refresh(html);
    });
    html.find('[data-swap-pair]').on('click', event => {
      const source = event.currentTarget.dataset.swapPair;
      if (!unchanged.has(source) && plan[source] !== source) plan = reassign(plan, plan[source], source);
      refresh(html);
    });
    html.find('[data-swap-unchanged]').on('change', event => {
      const source = event.currentTarget.dataset.swapUnchanged;
      if (event.currentTarget.checked) {
        plan = reassign(plan, source, source);
        unchanged.add(source);
      } else {
        unchanged.delete(source);
        const other = eligible.find(row => row.token.uuid !== source && !unchanged.has(row.token.uuid));
        if (other) plan = reassign(plan, source, plan[other.token.uuid]);
      }
      refresh(html);
    });
  } }, { width: 850, resizable: true });
  dialog.render(true);
}

async function start(chosenTokens, chosenPlan) {
  requireGM();
  if (state().phase) throw new Error('A swap or roll request already exists. Revert or cancel it first.');
  const tokens = chosenTokens ?? canvas.tokens.controlled.map(t => t.document);
  if (tokens.length < 2) return openAssignments();
  const session = { id: foundry.utils.randomID(), phase: 'preparing', entries: [], actors: [], users: [], bindings: [], imported: [], rolls: {}, dc: setting('dc'), rollType: setting('rollType'), duration: Math.max(0, Number(setting('duration')) || 0) };
  await save(session);
  try {
    const seenActors = new Set();
    const seenUsers = new Set();
    for (const token of tokens) {
      let actor = await resolveActor(token, session);
      const base = game.actors.get(actor.id);
      const users = game.users.filter(u => !u.isGM && u.character?.id === actor.id).map(u => u.id);
      if (!setting('includeEnemies') && !users.length) continue;
      if (seenActors.has(actor.uuid)) throw new Error('Select only one linked token per Actor. Unlinked tokens can participate separately.');
      seenActors.add(actor.uuid);
      for (const id of users) {
        if (seenUsers.has(id)) throw new Error('A player cannot participate through multiple bodies.');
        seenUsers.add(id);
      }
      if (!token.actor) {
        session.bindings.push({ uuid: token.uuid, actorId: token.actorId, actorLink: token.actorLink, delta: copy(token.toObject().delta ?? {}) });
        await save(session);
        await token.update({ actorId: actor.id, actorLink: true });
        actor = token.actor;
      }
      session.entries.push({ token: token.uuid, actor: actor.uuid, base: base?.uuid ?? actor.uuid, name: token.name, users });
    }
    if (session.entries.length < 2) throw new Error('Fewer than two eligible bodies remain.');
    if (chosenPlan) {
      const keys = session.entries.map(e => e.token);
      if (keys.length !== Object.keys(chosenPlan).length || keys.some(key => !keys.includes(chosenPlan[key])) || new Set(Object.values(chosenPlan)).size !== keys.length) throw new Error('Eligibility changed. Reopen the assignment window.');
      session.plan = chosenPlan;
      session.entries = session.entries.filter(e => chosenPlan[e.token] !== e.token);
      if (session.entries.length < 2) {
        await revert();
        ui.notifications.info('No bodies were changed.');
        return;
      }
    }
    session.phase = setting('resistance') ? 'rolling' : 'ready';
    await save(session);
    if (session.phase === 'rolling') {
      const buttons = session.entries.map(e => `<p>${esc(e.name)} <button type="button" data-body-swap-roll="${esc(e.token)}">Roll Constitution</button></p>`).join('');
      await chat(`<h3>Bodies are swapping!</h3><p>Roll a Constitution ${session.rollType === 'save' ? 'saving throw' : 'check'} against DC ${session.dc}. Success keeps you in your body.</p>${buttons}`, { request: session.id });
    } else await applySwap(session);
  } catch (error) {
    await revert();
    throw error;
  }
}

async function applySwap(session) {
  const entries = session.entries.filter(e => session.rolls[e.token] === undefined || session.rolls[e.token] < session.dc);
  if (entries.length < 2) {
    await revert();
    await chat('<p>Fewer than two bodies are eligible. No bodies swap.</p>');
    return;
  }
  // Check documents before making any ownership changes.
  for (const entry of entries) {
    const token = await fromUuid(entry.token);
    if (!token?.actor || token.actor.uuid !== entry.actor) throw new Error(`${entry.name} changed or was removed. Cancel and start again.`);
  }
  let mappings;
  if (session.plan) {
    const plan = restrictPlan(session.plan, entries.map(e => e.token));
    mappings = entries.filter(e => plan[e.token] !== e.token).map(source => ({ source, target: entries.find(e => e.token === plan[source.token]) }));
  } else mappings = cycle(entries);
  if (!mappings.length) {
    await revert();
    await chat('<p>No body swaps remain after resistance.</p>');
    return;
  }
  const participatingUsers = mappings.flatMap(m => m.source.users);
  // Shared sidebar Actors must grant access to every incoming player. Apply
  // those first, then the individual synthetic Actors for scene-token access.
  const baseOwners = new Map();
  const tokenOwners = new Map();
  for (const { source, target } of mappings) {
    if (!baseOwners.has(target.base)) baseOwners.set(target.base, new Set());
    for (const id of source.users) baseOwners.get(target.base).add(id);
    if (target.actor !== target.base) tokenOwners.set(target.actor, source.users);
    for (const id of source.users) session.users.push({ id, character: game.users.get(id).character?.id ?? null });
  }
  const updates = new Map();
  for (const [uuid, owners] of [...baseOwners, ...tokenOwners]) {
    const actor = await fromUuid(uuid);
    if (!actor) throw new Error(`Missing Actor: ${uuid}`);
    session.actors.push({ uuid, ownership: copy(actor.ownership) });
    updates.set(uuid, transferredOwnership(actor.ownership, participatingUsers, [...owners]));
  }
  session.phase = 'applying';
  await save(session); // Persist the entire recovery journal before mutations.
  try {
    for (const [uuid, ownership] of updates) await (await fromUuid(uuid)).update({ ownership }, { diff: false, recursive: false });
    for (const { source, target } of mappings) {
      const targetActor = await fromUuid(target.base);
      for (const id of source.users) await game.users.get(id).update({ character: targetActor.id });
    }
    session.phase = 'active';
    session.expires = session.duration ? Date.now() + session.duration * 1000 : null;
    await save(session);
    const rows = mappings.map(({ source, target }) => `<p>${esc(source.users.length ? source.users.map(id => game.users.get(id).name).join(', ') : `GM (${source.name})`)} → ${esc(target.name)}</p>`).join('');
    await chat(`<h3>Body Swap</h3>${rows}<p><span data-body-swap-active="${esc(session.id)}">${session.expires ? 'Timer running' : 'Active — manual reversion'}</span></p><button type="button" data-body-swap-active="${esc(session.id)}" hidden>Revert now</button>`, { active: session.id });
  } catch (error) {
    await revert();
    throw error;
  }
}

async function revert() {
  requireGM();
  const session = state();
  if (!session.phase) return;
  session.phase = 'reverting';
  await save(session);
  const errors = [];
  // Base Actors first, then token Actors, to preserve synthetic ownership overrides.
  for (const record of session.actors ?? []) {
    try {
      const actor = await fromUuid(record.uuid);
      if (!actor) throw new Error(`Actor missing: ${record.uuid}`);
      await actor.update({ ownership: record.ownership }, { diff: false, recursive: false });
    } catch (error) { errors.push(error.message); }
  }
  for (const record of session.users ?? []) {
    try {
      const user = game.users.get(record.id);
      if (user) await user.update({ character: record.character });
    } catch (error) { errors.push(error.message); }
  }
  for (const record of session.bindings ?? []) {
    try {
      const token = await fromUuid(record.uuid);
      if (token) await token.update({ actorId: record.actorId, actorLink: record.actorLink, delta: record.delta }, { diff: false, recursive: false });
    } catch (error) { errors.push(error.message); }
  }
  if (errors.length) throw new Error(`Reversion incomplete; recovery data retained. ${errors.join('; ')}`);
  await save({});
  ui.notifications.info('Body Swap: original assignments and permissions restored.');
}

async function cancel() {
  requireGM();
  if (state().phase === 'active') throw new Error('Use Revert Now to end an active swap.');
  await revert();
}

const rolling = new Set();
function updateActiveControl(element) {
  const session = state();
  const current = session.id === element.dataset.bodySwapActive;
  if (element.tagName === 'BUTTON') {
    element.hidden = !game.user.isGM || !current;
    element.disabled = !primary() || !current || !['active', 'reverting'].includes(session.phase);
    element.title = primary() ? 'Restore original assignments and permissions' : 'The primary active GM can revert this swap';
    return;
  }
  if (!current) element.textContent = 'Ended — original assignments restored';
  else if (session.phase === 'reverting') element.textContent = 'Restoring original assignments…';
  else if (!session.expires) element.textContent = 'Active — manual reversion';
  else {
    const seconds = Math.max(0, Math.ceil((session.expires - Date.now()) / 1000));
    element.textContent = seconds ? `Time remaining: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Time expired — awaiting GM reversion';
  }
}
Hooks.on('renderChatMessage', (message, html) => {
  if (message.getFlag(ID, 'active')) html.find('[data-body-swap-active]').each((_, element) => {
    updateActiveControl(element);
    if (element.tagName === 'BUTTON') element.addEventListener('click', () => serialized(async () => {
      requireGM();
      if (state().id === element.dataset.bodySwapActive) await revert();
    }));
  });
  const request = message.getFlag(ID, 'request');
  if (!request) return;
  html.find('[data-body-swap-roll]').each((_, button) => {
    const session = state();
    const entry = session.entries?.find(e => e.token === button.dataset.bodySwapRoll);
    button.disabled = session.id !== request || session.phase !== 'rolling' || !entry || session.rolls[entry.token] !== undefined || !(game.user.isGM || entry.users.includes(game.user.id));
    button.addEventListener('click', async () => {
      const current = state();
      if (current.id !== request || current.phase !== 'rolling' || !entry || current.rolls[entry.token] !== undefined || rolling.has(entry.token)) return;
      rolling.add(entry.token);
      button.disabled = true;
      try {
        const actor = await fromUuid(entry.actor);
        if (!actor?.isOwner) throw new Error('You do not own this body. Ask the GM to roll.');
        const method = current.rollType === 'save' ? 'rollAbilitySave' : 'rollAbilityTest';
        const roll = await actor[method]('con', { chatMessage: false });
        if (roll) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Body Swap: Constitution ${current.rollType} (DC ${current.dc})`, flags: { [ID]: { request: current.id, token: entry.token, result: true } } });
      } catch (error) { ui.notifications.error(error.message); }
      finally { rolling.delete(entry.token); button.disabled = false; }
    });
  });
});

async function acceptRoll(message) {
  const flag = message.getFlag(ID, 'result');
  if (!flag || !primary()) return;
  const session = state();
  if (session.phase !== 'rolling' || message.getFlag(ID, 'request') !== session.id) return;
  const entry = session.entries.find(e => e.token === message.getFlag(ID, 'token'));
  if (!entry || session.rolls[entry.token] !== undefined) return;
  if (!(message.user?.isGM || entry.users.includes(message.user?.id))) return;
  const total = message.rolls?.[0]?.total;
  if (!Number.isFinite(total)) return;
  session.rolls[entry.token] = total;
  await save(session);
  if (session.entries.every(e => session.rolls[e.token] !== undefined)) await applySwap(session);
}

Hooks.on('createChatMessage', message => { if (primary()) serialized(() => acceptRoll(message)); });
Hooks.once('ready', () => {
  game.modules.get(ID).api = {
    start: () => serialized(start), revert: () => serialized(revert), cancel: () => serialized(cancel),
    configure: () => serialized(openAssignments),
    status: state,
    installMacros: async () => {
      requireGM();
      for (const [name, method] of [['Body Swap: Swap Selected', 'start'], ['Body Swap: Revert Now', 'revert'], ['Body Swap: Cancel Roll Request', 'cancel']]) {
        if (!game.macros.some(m => m.getFlag(ID, 'method') === method)) await Macro.create({ name, type: 'script', img: 'icons/svg/mystery-man.svg', command: `await game.modules.get("${ID}").api.${method}();`, ownership: { default: 0 }, flags: { [ID]: { method } } });
      }
      ui.notifications.info('Body Swap macros are in the Macro Directory. Drag them to your hotbar.');
    }
  };
  if (game.system.id !== 'dnd5e') ui.notifications.error('Body Swap requires D&D 5e.');
  // A persisted journal also supports manual recovery after browser/server interruption.
  setInterval(() => {
    if (!primary()) return;
    serialized(async () => {
      const session = state();
      if (session.phase === 'active' && session.expires && Date.now() >= session.expires) await revert();
      if (session.phase === 'rolling') for (const message of game.messages.contents) await acceptRoll(message);
    });
  }, 5000);
  setInterval(() => {
    globalThis.document?.querySelectorAll('[data-body-swap-active]').forEach(updateActiveControl);
  }, 1000);
  if (primary() && ['applying', 'preparing', 'reverting'].includes(state().phase)) ui.notifications.warn('Body Swap has unfinished recovery data. Run Revert Now before starting another swap.');
});
