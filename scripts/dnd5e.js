/**
 * D&D 5e adapter: every system-specific data path and API lives here.
 * Checked against dnd5e 6.0.6 and 6.1.0.
 */

/** Item types merged into an existing stack on the recipient (dnd5e itself stacks consumables on drop). */
const STACKABLE_TYPES = new Set(["consumable", "loot"]);

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
 * Build the creation data for an item (and its contents, for containers) on another actor.
 * @param {Item} item       The item on the source actor.
 * @param {number} quantity The quantity that changes hands.
 * @returns {Promise<object[]>}  Data for `Item.createDocuments` with `keepId: true`.
 */
export async function buildItemData(item, quantity) {
  return dnd5e.documents.Item5e.createWithContents([item], {
    transformAll: doc => doc.toObject(),
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
