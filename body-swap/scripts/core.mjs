export function cycle(entries, random = Math.random) {
  if (entries.length < 2) return [];
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.map((source, i) => ({ source, target: shuffled[(i + 1) % shuffled.length] }));
}

export function transferredOwnership(original, participatingUsers, incomingUsers) {
  const result = { ...original };
  for (const id of participatingUsers) result[id] = 0;
  for (const id of incomingUsers) result[id] = 3;
  return result;
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A destination change exchanges two destinations, keeping the mapping bijective.
export function reassign(plan, source, destination) {
  const next = { ...plan };
  if (!(source in next) || !Object.values(next).includes(destination)) throw new Error('Unknown body.');
  const displaced = Object.keys(next).find(key => next[key] === destination);
  next[displaced] = next[source];
  next[source] = destination;
  return next;
}

// Remove resistant bodies from each cycle without duplicating destinations.
export function restrictPlan(plan, eligible) {
  const allowed = new Set(eligible);
  const result = {};
  for (const source of eligible) {
    let target = plan[source];
    const visited = new Set();
    while (!allowed.has(target)) {
      if (visited.has(target) || !(target in plan)) throw new Error('Invalid body assignment.');
      visited.add(target);
      target = plan[target];
    }
    result[source] = target;
  }
  return result;
}
