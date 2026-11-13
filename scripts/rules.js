/**
 * Who may transfer what to whom. Used by the dialogs (to list targets) and re-checked by the client that performs
 * the transfer, for the user who asked for it.
 */

import * as sys from "./dnd5e.js";
import { BUY, COMBAT, TARGETS, getSetting } from "./settings.js";

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

  return tableRules({ source, target, user, scene, remindable: kind === "item" });
}

/**
 * Distance and combat rules. They only apply between two characters, not to a group's stash. The GM is exempt.
 * @param {object} config
 * @param {Actor} config.source
 * @param {Actor} config.target
 * @param {User} config.user
 * @param {Scene|null} config.scene
 * @param {boolean} config.remindable  Whether the "remind" combat rule applies (items, not money).
 * @returns {{ok: true, remind: boolean}|{ok: false, reason: string, data?: object}}
 */
function tableRules({ source, target, user, scene, remindable }) {
  let remind = false;
  if ( !user.isGM && !sys.isGroup(source) && !sys.isGroup(target) ) {
    const maxDistance = getSetting("maxDistance");
    if ( maxDistance > 0 ) {
      const distance = tokenDistance(source, target, scene);
      if ( distance === null ) return { ok: false, reason: "NoTokens" };
      if ( distance > maxDistance ) {
        return { ok: false, reason: "TooFar", data: { distance: maxDistance, units: scene.grid.units } };
      }
    }
    const combatRule = getSetting("combatRule");
    if ( (combatRule !== COMBAT.allow) && (inCombat(source) || inCombat(target)) ) {
      if ( combatRule === COMBAT.block ) return { ok: false, reason: "InCombat" };
      remind = remindable;
    }
  }
  return { ok: true, remind };
}

/* -------------------------------------------- */
/*  Buying                                      */
/* -------------------------------------------- */

/**
 * Whether the user may buy from a seller.
 * - The GM: from any actor, and copies from the sidebar and compendiums.
 * - Players (setting "buying"): from characters, NPCs and groups they can see (Observer) but don't own, and with
 *   "all" also copies of sidebar and compendium items they can see.
 * @param {Actor|null} source  The seller, or null for a sidebar or compendium item.
 * @param {User} [user]
 * @returns {boolean}
 */
export function canBuyFrom(source, user=game.user) {
  if ( source && !sys.canHoldItems(source) ) return false;
  if ( user.isGM ) return true;
  const mode = getSetting("buying");
  if ( mode === BUY.off ) return false;
  if ( !source ) return mode === BUY.all;
  return can(source, user, "OBSERVER") && !can(source, user, "OWNER");
}

/**
 * Whether the user may sell items of this actor (into the "Sold Items" compendium, for money from nowhere). Selling is
 * meant for player characters and groups:
 * - The GM: any character or group.
 * - Players (setting "allowSelling"): characters and groups they own, and groups one of their characters is a member
 *   of when taking from groups is allowed.
 * @param {Actor} actor
 * @param {User} [user]
 * @returns {boolean}
 */
export function canSellFrom(actor, user=game.user) {
  if ( !(sys.isCharacter(actor) || sys.isGroup(actor)) || !sys.hasCurrency(actor) ) return false;
  if ( user.isGM ) return true;
  if ( !getSetting("allowSelling") ) return false;
  if ( can(actor, user, "OWNER") ) return true;
  return sys.isGroup(actor) && getSetting("allowTake") && memberGroups(user).some(g => sameActor(g, actor));
}

/** How the sale price is set. */
export const SALE_PRICE = { half: "half", full: "full", custom: "custom" };

/**
 * Check a sale for the user who asked for it, and work out the price.
 * @param {object} config
 * @param {Actor} config.source              The seller.
 * @param {Item} config.item
 * @param {number} config.quantity
 * @param {string} config.priceMode          A SALE_PRICE value.
 * @param {number|null} [config.customPrice] Total price for "custom", in the item's denomination.
 * @param {User} config.user
 * @returns {Promise<{ok: true, price: sys.Price}|{ok: false, reason: string, data?: object}>}
 */
export async function checkSale({ source, item, quantity, priceMode, customPrice=null, user }) {
  const fail = (reason, data) => ({ ok: false, reason, data });
  if ( !source || !item || (item.parent !== source) ) return fail("Missing");
  if ( !sys.isGiveable(item) ) return fail("NotGiveable");
  if ( !Number.isInteger(quantity) || (quantity < 1) || (quantity > sys.getQuantity(item)) ) {
    return fail("QuantityChanged");
  }
  if ( !canSellFrom(source, user) ) return fail("SellingDisabled");
  if ( !user.isGM && sys.isUnidentified(item) ) return fail("Unidentified");

  let price;
  if ( priceMode === SALE_PRICE.custom ) {
    const value = Number(customPrice);
    if ( (customPrice === null) || (customPrice === "") || !Number.isFinite(value) || (value < 0) ) {
      return fail("InvalidPrice");
    }
    price = { value, denomination: sys.getListedPrice(item).denomination };
  } else if ( (priceMode === SALE_PRICE.half) || (priceMode === SALE_PRICE.full) ) {
    const base = await sys.getPrice(item, quantity);
    price = { value: priceMode === SALE_PRICE.half ? base.value / 2 : base.value, denomination: base.denomination };
  }
  else return fail("InvalidPrice");
  return { ok: true, price };
}

/**
 * Whether the user can see a sidebar or compendium item.
 * @param {Item} item
 * @param {User} user
 * @returns {boolean}
 */
function canSeeUnowned(item, user) {
  if ( user.isGM ) return true;
  if ( item.pack ) return !!game.packs.get(item.pack)?.testUserPermission(user, "OBSERVER");
  return item.testUserPermission(user, "OBSERVER");
}

/**
 * Who can pay for and receive a purchase.
 * - The GM: the primary party, its members, all player characters, every group, and every actor with a token on the
 *   current scene (for merchants on the map).
 * - Players: the actors they own and the groups one of their characters is a member of.
 * The seller itself and actors without currency are left out.
 * @param {Actor|null} source  The seller, or null for a sidebar or compendium item.
 * @param {User} [user]
 * @returns {Actor[]}
 */
export function getBuyers(source, user=game.user) {
  if ( !canBuyFrom(source, user) ) return [];
  let pool;
  if ( user.isGM ) {
    pool = partyPool(true);
    worldGroups().forEach(a => pool.add(a));
    for ( const token of canvas?.scene?.tokens ?? [] ) if ( token.actor ) pool.add(token.actor);
  } else {
    pool = new Set(game.actors.filter(a => can(a, user, "OWNER")));
    memberGroups(user).forEach(a => pool.add(a));
  }
  const buyers = Array.from(pool).filter(a => sys.canHoldItems(a) && sys.hasCurrency(a) && !sameActor(a, source));
  return sortTargets(buyers.filter((a, i) => buyers.findIndex(b => b.uuid === a.uuid) === i));
}

/**
 * Check a purchase for the user who asked for it, and work out the price and the buyer's payment.
 * @param {object} config
 * @param {Actor|null} config.source   The seller, or null for a sidebar or compendium item.
 * @param {Actor} config.target        The buyer.
 * @param {Item} config.item
 * @param {number} config.quantity
 * @param {number|null} [config.unitPrice]  A price per item set by the GM (in the item's denomination). Ignored for
 *                                          players, who always pay the item's own price.
 * @param {User} config.user
 * @param {Scene|null} [config.scene]
 * @returns {Promise<{ok: true, remind: boolean, price: sys.Price, payment: Record<string, number>}
 *   |{ok: false, reason: string, data?: object}>}
 */
export async function checkPurchase({ source, target, item, quantity, unitPrice=null, user, scene }) {
  const fail = (reason, data) => ({ ok: false, reason, data });
  if ( !item || !target ) return fail("Missing");
  if ( source ) {
    if ( item.parent !== source ) return fail("Missing");
    if ( !sys.isGiveable(item) ) return fail("NotGiveable");
    if ( !Number.isInteger(quantity) || (quantity < 1) || (quantity > sys.getQuantity(item)) ) {
      return fail("QuantityChanged");
    }
  } else {
    if ( !sys.isGrantable(item) ) return fail("NotGiveable");
    if ( !canSeeUnowned(item, user) ) return fail("NotAllowed");
    if ( !Number.isInteger(quantity) || (quantity < 1) ) return fail("InvalidQuantity");
  }
  if ( !user.isGM && sys.isUnidentified(item) ) return fail("Unidentified");
  if ( !canBuyFrom(source, user) ) return fail("BuyingDisabled");
  if ( !getBuyers(source, user).some(a => sameActor(a, target)) ) return fail("NotAllowed");

  let price;
  if ( user.isGM && (unitPrice !== null) && (unitPrice !== "") ) {
    const value = Number(unitPrice);
    if ( !Number.isFinite(value) || (value < 0) ) return fail("InvalidPrice");
    price = { value: value * quantity, denomination: sys.getListedPrice(item).denomination };
  }
  else price = await sys.getPrice(item, quantity);
  if ( !user.isGM && !(price.value > 0) ) return fail("NoPrice");

  const payment = sys.getPayment(target, price);
  if ( !payment ) return fail("CantAfford", { name: target.name, price: sys.formatPrice(price) });

  const rules = source ? tableRules({ source, target, user, scene, remindable: true }) : { ok: true, remind: false };
  if ( !rules.ok ) return rules;
  return { ok: true, remind: rules.remind, price, payment };
}
