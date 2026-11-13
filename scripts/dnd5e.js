/**
 * D&D 5e adapter: every system-specific data path and API lives here.
 * Checked against dnd5e 6.0.6 and 6.1.0.
 */

/** Item types merged into an existing stack on the recipient (dnd5e itself stacks consumables on drop). */
const STACKABLE_TYPES = new Set(["consumable", "loot"]);

/** Loot subtypes that sell at full price by default (gemstones, art objects, trade goods, treasure). */
const VALUABLE_LOOT = new Set(["gem", "art", "trade", "treasure"]);

/** Item system fields reset when an item changes hands (same list as dnd5e's `_onDropResetData`). */
const RESET_FIELDS = ["attuned", "equipped", "prepared", "crew.value"];

/* -------------------------------------------- */
/*  Actors                                      */
/* -------------------------------------------- */

/**
 * @param {Actor} actor
 * @returns {boolean}  Whether the actor is a group actor (party, or any other group).
 */
export function isGroup(actor) {
  return actor?.type === "group";
}

/**
 * @param {Actor} actor
 * @returns {boolean}  Whether the actor can give and receive items (characters, NPCs and groups).
 */
export function canHoldItems(actor) {
  return ["character", "npc", "group"].includes(actor?.type);
}

/**
 * @returns {Actor|null}  The primary party set in dnd5e's settings.
 */
export function getPrimaryParty() {
  return game.actors.party ?? null;
}

/**
 * @param {Actor} group
 * @returns {Actor[]}  The member actors of a group actor.
 */
export function getGroupMembers(group) {
  if ( !isGroup(group) ) return [];
  return Array.from(group.system.members ?? []).map(m => m.actor).filter(a => a);
}

/**
 * @param {Actor} actor
 * @returns {boolean}  Whether the actor is a player character.
 */
export function isCharacter(actor) {
  return actor?.type === "character";
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

/**
 * Physical items (weapons, equipment, consumables, tools, loot, containers) have a quantity; spells, features and
 * classes don't. dnd5e 6.1 has `system.isPhysical`, 6.0.6 doesn't, so check the field.
 * @param {Item} item
 * @returns {boolean}  Whether the item can change hands.
 */
export function isGiveable(item) {
  if ( !item?.actor || !item.system ) return false;
  return ("quantity" in item.system) && (getQuantity(item) > 0);
}

/**
 * Whether items of a type are physical, from the type's data model (works for compendium index entries too).
 * @param {string} type
 * @returns {boolean}
 */
export function isPhysicalType(type) {
  return !!CONFIG.Item.dataModels[type]?.schema?.fields?.quantity;
}

/**
 * @param {Item} item  An item in the sidebar or a compendium.
 * @returns {boolean}  Whether the GM can hand out a copy of it.
 */
export function isGrantable(item) {
  return !!item && !item.parent && isPhysicalType(item.type);
}

/**
 * @param {Item} item
 * @returns {number}
 */
export function getQuantity(item) {
  return Number(item.system?.quantity ?? 1) || 0;
}

/**
 * @param {Item} item
 * @returns {boolean}  Whether the item is a container (moves with its contents).
 */
export function isContainer(item) {
  return item?.type === "container";
}

/**
 * @param {Item} item
 * @returns {Promise<number>}  Number of items inside a container, including nested ones.
 */
export async function countContents(item) {
  if ( !isContainer(item) ) return 0;
  const contents = await item.system.allContainedItems;
  return contents?.size ?? 0;
}

/**
 * IDs of the item and, for containers, everything inside it (nested too). dnd5e's own `deleteContents` deletes the
 * contents in a second operation without the original options, so a transfer deletes them in one call itself.
 * @param {Item} item
 * @returns {Promise<string[]>}
 */
export async function getDeleteIds(item) {
  if ( !isContainer(item) ) return [item.id];
  const contents = await item.system.allContainedItems;
  return [item.id, ...(contents ? Array.from(contents.map(i => i.id)) : [])];
}

/**
 * Build the creation data for an item (and its contents, for containers) on another actor.
 * @param {Item} item       The item on the source actor, or in the sidebar or a compendium.
 * @param {number} quantity The quantity that changes hands.
 * @returns {Promise<object[]>}  Data for `Item.createDocuments` with `keepId: true`.
 */
export async function buildItemData(item, quantity) {
  // Sidebar and compendium items go through core's import cleanup, which records the compendium source (stacking)
  const transformAll = item.parent ? doc => doc.toObject()
    : doc => game.items.fromCompendium(doc, { clearFolder: true, keepId: true });
  return dnd5e.documents.Item5e.createWithContents([item], {
    transformAll,
    transformFirst: data => {
      for ( const field of RESET_FIELDS ) foundry.utils.deleteProperty(data.system ?? {}, field);
      if ( data.system && ("quantity" in data.system) ) data.system.quantity = quantity;
      return data;
    }
  });
}

/**
 * Find an item on the recipient that the given item should stack onto instead of becoming a second entry.
 * @param {Actor} actor     The recipient.
 * @param {object} data     Creation data of the item (from `buildItemData`, first entry).
 * @returns {Item|null}
 */
export function findStack(actor, data) {
  if ( !STACKABLE_TYPES.has(data.type) ) return null;
  const sourceId = data._stats?.compendiumSource ?? data.flags?.core?.sourceId ?? null;
  const identified = data.system?.identified ?? true;
  const spent = data.system?.uses?.spent ?? 0;
  return actor.items.find(i => (i.type === data.type)
    && (i._source.name === data.name)
    && ((i.system.container ?? null) === null)
    && ((i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? null) === sourceId)
    && ((i.system.identified ?? true) === identified)
    && ((i.system.uses?.spent ?? 0) === spent)) ?? null;
}

/**
 * @param {Item} item
 * @param {number} quantity
 * @returns {object}  Update data setting the item's quantity.
 */
export function quantityUpdate(item, quantity) {
  return { "system.quantity": quantity };
}

/* -------------------------------------------- */
/*  Currency                                    */
/* -------------------------------------------- */

/**
 * @param {Actor} actor
 * @returns {boolean}  Whether the actor has a currency field.
 */
export function hasCurrency(actor) {
  return !!actor?.system?.currency;
}

/**
 * @returns {{key: string, label: string, abbr: string, icon: string|null}[]}  Denominations, highest first.
 */
export function getDenominations() {
  return Object.entries(CONFIG.DND5E.currencies)
    .sort(([, a], [, b]) => (a.conversion ?? 1) - (b.conversion ?? 1))
    .map(([key, c]) => ({
      key,
      label: game.i18n.localize(c.label),
      abbr: game.i18n.localize(c.abbreviation ?? key),
      icon: c.icon ?? null
    }));
}

/**
 * @param {Actor} actor
 * @returns {Record<string, number>}  The actor's currency, one entry per denomination.
 */
export function getCurrency(actor) {
  const currency = actor?.system?.currency ?? {};
  return Object.fromEntries(getDenominations().map(({ key }) => [key, Number(currency[key]) || 0]));
}

/**
 * @param {Record<string, number>} currency  The new values.
 * @returns {object}  Update data setting the actor's currency.
 */
export function currencyUpdate(currency) {
  return Object.fromEntries(Object.entries(currency).map(([k, v]) => [`system.currency.${k}`, v]));
}

/* -------------------------------------------- */
/*  Prices                                      */
/* -------------------------------------------- */

/**
 * A price: an amount (may be fractional) in one denomination.
 * @typedef {{value: number, denomination: string}} Price
 */

/**
 * @param {string} denomination
 * @returns {number}  How many of this denomination make one of the base currency (gp = 1, sp = 10).
 */
function conversionOf(denomination) {
  return CONFIG.DND5E.currencies[denomination]?.conversion ?? 1;
}

/**
 * @param {Item} item
 * @returns {Price}  The item's `system.price` as entered. dnd5e never multiplies it by the quantity: it is the price
 *   of the item as listed, e.g. 1 gp for Arrows with a quantity of 20.
 */
export function getListedPrice(item) {
  const price = item?.system?.price ?? {};
  const denomination = isDenomination(price.denomination) ? price.denomination : CONFIG.DND5E.defaultCurrency;
  return { value: Math.max(0, Number(price.value) || 0), denomination };
}

/**
 * @param {Item|object} item  An item or a compendium index entry.
 * @returns {boolean}  Whether the item has a price above 0.
 */
export function hasPrice(item) {
  return Number(item?.system?.price?.value) > 0;
}

/**
 * @param {Item|object} item  An item or a compendium index entry.
 * @returns {boolean}  Whether the item is unidentified.
 */
export function isUnidentified(item) {
  return item?.system?.identified === false;
}

/**
 * @param {Item} item
 * @returns {boolean}  Whether the item is a valuable (gemstone, art object, trade good, treasure), which sells at full
 *   price by default instead of half.
 */
export function isValuable(item) {
  return (item?.type === "loot") && VALUABLE_LOOT.has(item.system?.type?.value);
}

/**
 * How many items the listed price is for.
 * - Sidebar and compendium items: their own quantity (Arrows: 20).
 * - Items on an actor: the quantity of the sidebar or compendium item they were created from, since their own
 *   quantity changes as they're used or sold. Without one, the price is for a single item.
 * @param {Item} item
 * @returns {Promise<number>}
 */
async function bundleSize(item) {
  if ( !item.parent ) return Math.max(1, getQuantity(item));
  const sourceId = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
  if ( !sourceId ) return 1;
  try {
    const original = await fromUuid(sourceId);
    if ( (original instanceof Item) && !original.parent ) return Math.max(1, getQuantity(original));
  } catch(err) {
    // The original's compendium may be gone; fall back to a single item
  }
  return 1;
}

/**
 * @param {Item} item
 * @returns {Promise<Price>}  The price of a single item: the listed price divided by the bundle it is for.
 */
export async function getUnitPrice(item) {
  const { value, denomination } = getListedPrice(item);
  return { value: value / await bundleSize(item), denomination };
}

/**
 * The price of buying a quantity of an item. Containers add the price of everything inside them.
 * @param {Item} item
 * @param {number} quantity
 * @returns {Promise<Price>}  In the item's own denomination.
 */
export async function getPrice(item, quantity) {
  const { value, denomination } = await getUnitPrice(item);
  let total = value * quantity;
  if ( isContainer(item) ) {
    const contents = await item.system.allContainedItems;
    for ( const inner of contents ?? [] ) {
      const price = await getUnitPrice(inner);
      total += price.value * getQuantity(inner) * conversionOf(denomination) / conversionOf(price.denomination);
    }
  }
  return { value: total, denomination };
}

/**
 * What the buyer's currency is after paying, making change from bigger coins where needed (dnd5e's own logic).
 * @param {Actor} actor
 * @param {Price} price
 * @returns {Record<string, number>|null}  The buyer's new currency, or null if they can't afford it.
 */
export function getPayment(actor, { value, denomination }) {
  if ( !hasCurrency(actor) ) return null;
  if ( !(value > 0) ) return getCurrency(actor);
  const updates = dnd5e.applications.CurrencyManager.getActorCurrencyUpdates(actor, value, denomination,
    { makeChange: true });
  if ( (updates.remainder > 0) && !updates.remainder.almostEqual(0) ) return null;
  return Object.fromEntries(Object.keys(getCurrency(actor)).map(k => [k, updates.system.currency[k] ?? 0]));
}

/**
 * The coins a price is paid with, in the price's denomination or, for fractions, the next smaller one that comes out
 * even (0.5 gp → 5 sp).
 * @param {Price} price
 * @returns {Record<string, number>}
 */
export function toCoins({ value, denomination }) {
  if ( !(value > 0) ) return {};
  const base = conversionOf(denomination);
  const candidates = Object.keys(CONFIG.DND5E.currencies)
    .map(key => ({ key, ratio: conversionOf(key) / base }))
    .filter(({ ratio }) => (ratio >= 1) && Number.isInteger(Math.round(Math.log10(ratio) * 1e6) / 1e6))
    .sort((a, b) => a.ratio - b.ratio);
  for ( const { key, ratio } of candidates ) {
    const amount = value * ratio;
    if ( amount.almostEqual(Math.round(amount)) ) return { [key]: Math.round(amount) };
  }
  const last = candidates.at(-1) ?? { key: denomination, ratio: 1 };
  return { [last.key]: Math.max(1, Math.round(value * last.ratio)) };
}

/**
 * @param {Price} price
 * @returns {string}  e.g. "12.5 gp".
 */
export function formatPrice({ value, denomination }) {
  const number = new Intl.NumberFormat(game.i18n.lang, { maximumFractionDigits: 2 }).format(value);
  return `${number} ${denominationAbbr(denomination)}`;
}

/**
 * @param {string} denomination
 * @returns {boolean}  Whether this is a currency denomination of the system.
 */
export function isDenomination(denomination) {
  return Object.hasOwn(CONFIG.DND5E.currencies, denomination ?? "");
}

/**
 * @param {string} denomination
 * @returns {string}  The denomination's abbreviation, e.g. "gp".
 */
export function denominationAbbr(denomination) {
  return game.i18n.localize(CONFIG.DND5E.currencies[denomination]?.abbreviation ?? denomination);
}

/**
 * @param {Record<string, number>} amounts
 * @returns {string}  e.g. "12 gp, 5 sp".
 */
export function formatCurrency(amounts) {
  return getDenominations()
    .filter(({ key }) => amounts[key] > 0)
    .map(({ key, abbr }) => `${amounts[key]} ${abbr}`)
    .join(", ");
}
