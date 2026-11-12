/**
 * Who may transfer what to whom. Used by the dialogs (to list targets) and re-checked by the client that performs
 * the transfer, for the user who asked for it.
 */

import * as sys from "./dnd5e.js";
import { COMBAT, TARGETS, getSetting } from "./settings.js";

/**
 * @param {Actor} actor
 * @param {User} user
 * @param {string} level  A key of CONST.DOCUMENT_OWNERSHIP_LEVELS.
 * @returns {boolean}
 */
function can(actor, user, level) {
  return !!actor?.testUserPermission(user, level);
}

/**
 * Two actors are the same when they share a UUID, or when one is an unlinked token copy of the other's base actor.
 * @param {Actor} a
 * @param {Actor} b
 * @returns {boolean}
 */
export function sameActor(a, b) {
  if ( !a || !b ) return false;
  return (a.uuid === b.uuid) || (a.id === b.id);
}

/**
 * Whether the transfer is a "take": the user moves something out of a group they don't own into their own character.
 * @param {Actor} source
 * @param {User} [user]
 * @returns {boolean}
 */
export function isTake(source, user=game.user) {
  return sys.isGroup(source) && !can(source, user, "OWNER");
}

/**
 * Non-GM users who own an actor.
 * @param {Actor} actor
 * @returns {User[]}
 */
export function playerOwners(actor) {
  return game.users.filter(u => !u.isGM && can(actor, u, "OWNER"));
}

/**
 * The actors the user may move items or money to from the given source.
 * - From a character or NPC the user owns: the primary party actor, and its members (setting "party") or all
 *   characters owned by players plus the party's members (setting "players").
 * - From a group the user owns: its members.
 * - From a group the user doesn't own (taking): the members the user owns, if taking is allowed and the user can see
 *   the group.
 * - Groups: the GM gets every group actor in the world in all cases. A player giving from an actor they own (not
 *   taking) also gets the groups that one of their characters is a member of.
 * @param {Actor} source
 * @param {User} [user]
 * @returns {Actor[]}
 */
export function getTargets(source, user=game.user) {
  if ( !sys.canHoldItems(source) ) return [];
  const targets = new Set();

  if ( sys.isGroup(source) ) {
    const owner = can(source, user, "OWNER");
    const mayTake = getSetting("allowTake") && can(source, user, "OBSERVER");
    for ( const member of sys.getGroupMembers(source) ) {
      if ( owner || (mayTake && can(member, user, "OWNER")) ) targets.add(member);
    }
  }

  else if ( can(source, user, "OWNER") ) {
    partyPool(getSetting("giveTargets") === TARGETS.players).forEach(a => targets.add(a));
  }

  if ( user.isGM ) worldGroups().forEach(a => targets.add(a));
  else if ( can(source, user, "OWNER") ) memberGroups(user).forEach(a => targets.add(a));

  return sortTargets(Array.from(targets).filter(a => sys.canHoldItems(a) && !sameActor(a, source)));
}

/**
 * The primary party actor and its members, plus all characters owned by players when asked for or when there is no
 * primary party.
 * @param {boolean} withPlayers
 * @returns {Set<Actor>}
 */
function partyPool(withPlayers) {
  const pool = new Set();
  const party = sys.getPrimaryParty();
  if ( party ) {
    pool.add(party);
    sys.getGroupMembers(party).forEach(m => pool.add(m));
  }
  if ( !party || withPlayers ) {
    game.actors.filter(a => sys.isCharacter(a) && a.hasPlayerOwner).forEach(a => pool.add(a));
  }
  return pool;
}

/**
 * @returns {Actor[]}  All group actors in the world.
 */
function worldGroups() {
  return game.actors.filter(a => sys.isGroup(a));
}

/**
 * @param {User} user
 * @returns {Actor[]}  The world's group actors that have a member the user owns.
 */
function memberGroups(user) {
  return worldGroups().filter(g => sys.getGroupMembers(g).some(m => can(m, user, "OWNER")));
}

/**
 * Groups first, then by name.
 * @param {Actor[]} actors
 * @returns {Actor[]}
 */
function sortTargets(actors) {
  return actors.sort((a, b) => Number(sys.isGroup(b)) - Number(sys.isGroup(a))
    || a.name.localeCompare(b.name, game.i18n.lang));
}

/**
 * Who the GM can hand out a copy of a sidebar or compendium item to: every group actor in the world, the primary
 * party's members and all player characters. Players can't, since that would create items.
 * @param {User} [user]
 * @returns {Actor[]}
 */
export function getGrantTargets(user=game.user) {
  if ( !user.isGM ) return [];
  const pool = partyPool(true);
  worldGroups().forEach(a => pool.add(a));
  return sortTargets(Array.from(pool).filter(a => sys.canHoldItems(a)));
}

/**
 * Check handing out a copy of a sidebar or compendium item.
 * @param {object} config
 * @param {Item} config.item
 * @param {Actor} config.target
 * @param {number} config.quantity
 * @param {User} config.user
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function checkGrant({ item, target, quantity, user }) {
  if ( !user.isGM ) return { ok: false, reason: "NotAllowed" };
  if ( !item || !target ) return { ok: false, reason: "Missing" };
  if ( !sys.isGrantable(item) ) return { ok: false, reason: "NotGiveable" };
  if ( !getGrantTargets(user).some(a => sameActor(a, target)) ) return { ok: false, reason: "NotAllowed" };
  if ( !Number.isInteger(quantity) || (quantity < 1) ) return { ok: false, reason: "InvalidQuantity" };
  return { ok: true };
}

/**
 * @param {Actor} source
 * @param {Actor} target
 * @param {User} [user]
 * @returns {boolean}  Whether the target is one of the source's allowed targets for this user.
 */
export function isAllowedTarget(source, target, user=game.user) {
  return getTargets(source, user).some(a => sameActor(a, target));
}

/**
 * Tokens of an actor on a scene.
 * @param {Actor} actor
 * @param {Scene} scene
 * @returns {TokenDocument[]}
 */
function tokensOf(actor, scene) {
  if ( actor.isToken ) return actor.token?.parent === scene ? [actor.token] : [];
  return scene.tokens.filter(t => t.actorLink && (t.actorId === actor.id));
}

/**
 * Shortest distance between the two actors' tokens on the scene, or null if one of them has no token there.
 * @param {Actor} a
 * @param {Actor} b
 * @param {Scene} scene
 * @returns {number|null}
 */
function tokenDistance(a, b, scene) {
  if ( !scene ) return null;
  const tokensA = tokensOf(a, scene);
  const tokensB = tokensOf(b, scene);
  let best = null;
  for ( const ta of tokensA ) {
    for ( const tb of tokensB ) {
      const { distance } = scene.grid.measurePath([ta.getCenterPoint(), tb.getCenterPoint()]);
      if ( (best === null) || (distance < best) ) best = distance;
    }
  }
  return best;
}

/**
 * @param {Actor} actor
 * @returns {boolean}  Whether the actor is a combatant in a started combat.
 */
function inCombat(actor) {
  return game.combats.some(c => c.started && c.combatants.some(cb => cb.actor && sameActor(cb.actor, actor)));
}

/**
 * Check a transfer for the user who asked for it.
 * @param {object} config
 * @param {"item"|"currency"} config.kind
 * @param {Actor} config.source
 * @param {Actor} config.target
 * @param {Item} [config.item]
 * @param {number} [config.quantity]
 * @param {Record<string, number>} [config.amounts]
 * @param {User} config.user
 * @param {Scene|null} [config.scene]  The scene the user was looking at (for the distance rule).
 * @returns {{ok: true, remind: boolean}|{ok: false, reason: string, data?: object}}
 *   `reason` is a key below `NGT.Error.`.
 */
export function checkTransfer({ kind, source, target, item, quantity, amounts, user, scene }) {
  const fail = (reason, data) => ({ ok: false, reason, data });
  if ( !source || !target ) return fail("Missing");
  if ( sameActor(source, target) ) return fail("SameActor");
  if ( !isAllowedTarget(source, target, user) ) return fail("NotAllowed");

  if ( kind === "item" ) {
    if ( !item || (item.parent !== source) ) return fail("Missing");
    if ( !sys.isGiveable(item) ) return fail("NotGiveable");
    const available = sys.getQuantity(item);
    if ( !Number.isInteger(quantity) || (quantity < 1) || (quantity > available) ) return fail("QuantityChanged");
  }

  else if ( kind === "currency" ) {
    if ( !getSetting("allowCurrency") ) return fail("CurrencyDisabled");
    if ( !sys.hasCurrency(source) || !sys.hasCurrency(target) ) return fail("NoCurrency");
    const have = sys.getCurrency(source);
    let total = 0;
    for ( const [key, value] of Object.entries(amounts ?? {}) ) {
      if ( !(key in have) || !Number.isInteger(value) || (value < 0) ) return fail("InvalidAmount");
      if ( value > have[key] ) return fail("NotEnoughCurrency");
      total += value;
    }
    if ( !total ) return fail("InvalidAmount");
  }

  else return fail("Missing");

  // Distance and combat rules only apply between two characters, not to the party's stash. The GM is exempt.
  let remind = false;
  if ( !user.isGM && !sys.isGroup(source) && !sys.isGroup(target) ) {
    const maxDistance = getSetting("maxDistance");
    if ( maxDistance > 0 ) {
      const distance = tokenDistance(source, target, scene);
      if ( distance === null ) return fail("NoTokens");
      if ( distance > maxDistance ) return fail("TooFar", { distance: maxDistance, units: scene.grid.units });
    }
    const combatRule = getSetting("combatRule");
    if ( (combatRule !== COMBAT.allow) && (inCombat(source) || inCombat(target)) ) {
      if ( combatRule === COMBAT.block ) return fail("InCombat");
      remind = kind === "item";
    }
  }

  return { ok: true, remind };
}
