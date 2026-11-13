/**
 * Transfers: routing (this client or the active GM), approval, execution and the chat message.
 *
 * A request is plain JSON so it can travel in a user query:
 * @typedef {object} TransferRequest
 * @property {"item"|"currency"} kind
 * @property {string} sourceUuid             Actor that gives (or the group that is taken from).
 * @property {string} targetUuid             Actor that receives.
 * @property {string} [itemId]               Item on the source (kind "item").
 * @property {number} [quantity]             Quantity that changes hands (kind "item").
 * @property {Record<string, number>} [amounts]  Currency per denomination (kind "currency").
 * @property {string|null} [sceneId]         Scene the requesting user is viewing (distance rule).
 *
 * A purchase request, also plain JSON:
 * @typedef {object} PurchaseRequest
 * @property {string} itemUuid               The item on the seller, or in the sidebar or a compendium.
 * @property {string} targetUuid             The buyer, who pays and receives the item.
 * @property {number} quantity
 * @property {number|null} [unitPrice]       Price per item set by the GM. Ignored for players.
 * @property {string|null} [sceneId]
 *
 * What a finished transfer changed, kept in its chat message so the GM can undo it:
 * @typedef {object} UndoData
 * @property {object} [items]
 * @property {string} items.target            Actor that received the item.
 * @property {{quantity: number, stackId?: string, createdIds?: string[]}} items.added
 *   Added to an existing stack, or created (the item and, for containers, its contents).
 * @property {string|null} items.source       Actor the item left (null for sidebar / compendium items).
 * @property {{itemId: string, restore: object[]|null, fallback: object[]}} [items.removed]
 *   `restore`: the source's item (and contents) as they were, when all of it left. `fallback`: the moved part, to
 *   recreate it if only part of a stack left and the rest is gone by now.
 * @property {{id: string, ids: string[]}} [items.pack]  Copies made in the "Sold Items" compendium (sales).
 * @property {number} [items.quantity]        Quantity, when nothing was added to an actor (sales).
 * @property {{actor: string, delta: Record<string, number>}[]} [currency]  Coins added (+) or taken (−) per actor.
 *
 * A sale request, also plain JSON:
 * @typedef {object} SaleRequest
 * @property {string} itemUuid               The item on the seller.
 * @property {number} quantity
 * @property {"half"|"full"|"custom"} priceMode
 * @property {number|null} [customPrice]     Total price for "custom", in the item's denomination.
 */

import { MODULE_ID, OFFER_TIMEOUT, OPERATION_OPTIONS, QUERY, TEMPLATE_PATH, logError, t, tf } from "./constants.js";
import * as sys from "./dnd5e.js";
import { checkGrant, checkPurchase, checkSale, checkTransfer, isTake, playerOwners } from "./rules.js";
import { APPROVAL, CHAT, getSetting } from "./settings.js";

const { renderTemplate } = foundry.applications.handlebars;

/** The world compendium sold items are kept in (`world.<name>`). Created on the first sale. */
const SOLD_PACK_NAME = "ngt-sold-items";
const { escapeHTML } = foundry.utils;

/* -------------------------------------------- */
/*  Requesting                                  */
/* -------------------------------------------- */

/**
 * Ask for a transfer. Runs it on this client when the user owns both actors (and no GM approval is needed),
 * otherwise sends it to the active GM.
 * @param {TransferRequest} request
 * @returns {Promise<object>}  The result (`status`: "done", "declined", "expired" or "error").
 */
export async function requestTransfer(request) {
  request = { ...request, sceneId: request.sceneId ?? canvas.scene?.id ?? null };
  const resolved = await resolveRequest(request);
  const check = checkTransfer({ ...resolved, user: game.user });
  if ( !check.ok ) return report({ status: "error", reason: check.reason, data: check.data });

  let result;
  if ( canRunLocally(resolved, game.user) ) result = await processTransfer(request, game.user);
  else {
    const gm = game.users.activeGM;
    if ( !gm ) return report({ status: "error", reason: "NoGM" });
    if ( !game.user.hasPermission("QUERY_USER") ) return report({ status: "error", reason: "NoQueryPermission" });
    const approval = getApproval(resolved, game.user);
    if ( approval ) ui.notifications.info(tf(`Notify.Waiting.${approval.type}`, { name: approval.name }));
    try {
      result = await gm.query(QUERY.transfer, request);
    } catch(err) {
      logError(err);
      result = { status: "error", reason: "Failed" };
    }
  }
  return report(result);
}

/**
 * Tell the requesting user how it went.
 * @param {object} result
 * @returns {object}  The result.
 */
function report(result) {
  switch ( result?.status ) {
    case "done":
      if ( getSetting("chatMessages") === CHAT.off ) ui.notifications.info(result.summary);
      break;
    case "declined":
      ui.notifications.warn(tf("Notify.Declined", { name: result.by }));
      break;
    case "expired":
      ui.notifications.warn(tf("Notify.Expired", { name: result.by }));
      break;
    default:
      ui.notifications.warn(tf(`Error.${result?.reason ?? "Failed"}`, result?.data ?? {}));
  }
  return result;
}

/* -------------------------------------------- */
/*  Resolving and routing                       */
/* -------------------------------------------- */

/**
 * Turn a request into documents. Never trusts anything but the UUIDs and numbers.
 * @param {TransferRequest} request
 * @returns {Promise<object>}  Arguments for `checkTransfer` (without the user).
 */
async function resolveRequest(request) {
  const source = await fromUuid(request.sourceUuid);
  const target = await fromUuid(request.targetUuid);
  const isActor = doc => doc instanceof Actor;
  const amounts = {};
  for ( const [key, value] of Object.entries(request.amounts ?? {}) ) amounts[key] = Number(value);
  return {
    kind: request.kind,
    source: isActor(source) ? source : null,
    target: isActor(target) ? target : null,
    item: isActor(source) ? (source.items.get(request.itemId) ?? null) : null,
    quantity: Number(request.quantity),
    amounts,
    scene: game.scenes.get(request.sceneId) ?? null
  };
}

/**
 * A user may run a transfer on their own client when they own both actors and no GM approval is required.
 * @param {object} resolved
 * @param {User} user
 * @returns {boolean}
 */
function canRunLocally({ source, target }, user) {
  if ( user.isGM ) return true;
  if ( getSetting("approvalMode") === APPROVAL.gm ) return false;
  return source.testUserPermission(user, "OWNER") && target.testUserPermission(user, "OWNER");
}

/**
 * Who has to agree before the transfer happens.
 * - GM approval mode: the GM, for every give and take by a player.
 * - Recipient mode: the recipient's player, when a player gives to a character they don't own. Giving to the party
 *   and taking from it need no answer. Without an active player, the GM answers.
 * @param {object} resolved
 * @param {User} user  The requesting user.
 * @returns {{type: "GM"|"Recipient", user: User|null, name: string}|null}  null when no approval is needed.
 */
function getApproval({ source, target }, user) {
  if ( user.isGM ) return null;
  const mode = getSetting("approvalMode");
  const gm = game.users.activeGM;
  if ( mode === APPROVAL.gm ) return { type: "GM", user: gm, name: gm?.name ?? t("GM") };
  if ( mode !== APPROVAL.recipient ) return null;
  if ( sys.isGroup(target) || sys.isGroup(source) || target.testUserPermission(user, "OWNER") ) return null;
  const owners = playerOwners(target).filter(u => u.active && (u !== user));
  const recipient = owners.find(u => u.character?.id === target.id) ?? owners[0];
  if ( recipient ) return { type: "Recipient", user: recipient, name: recipient.name };
  return { type: "GM", user: gm, name: gm?.name ?? t("GM") };
}

/* -------------------------------------------- */
/*  Processing                                  */
/* -------------------------------------------- */

/** Transfers run one after the other, so two requests can't move the same item at once. */
let queue = Promise.resolve();

/**
 * Run a change after all changes that are already waiting. Also used by undo.
 * @param {Function} fn
 * @returns {Promise<*>}
 */
export function enqueue(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

/**
 * The GM-side handler of the transfer query.
 * @param {TransferRequest} request
 * @param {{user: User}} context
 * @returns {Promise<object>}
 */
export async function onTransferQuery(request, { user }) {
  if ( !game.user.isActiveGM ) return { status: "error", reason: "NoGM" };
  return processTransfer(request, user);
}

/**
 * Check, ask for approval, then perform a transfer for the user who requested it.
 * @param {TransferRequest} request
 * @param {User} user
 * @returns {Promise<object>}
 */
async function processTransfer(request, user) {
  let resolved = await resolveRequest(request);
  let check = checkTransfer({ ...resolved, user });
  if ( !check.ok ) return { status: "error", reason: check.reason, data: check.data };

  // Ask outside the queue, so a pending offer doesn't hold up other transfers
  const approval = getApproval(resolved, user);
  if ( approval ) {
    const answer = await askApproval(approval, resolved, user);
    if ( answer === null ) return { status: "expired", by: approval.name };
    if ( !answer ) return { status: "declined", by: approval.name };
  }

  return enqueue(async () => {
    // Things may have changed while waiting for an answer or for the queue
    resolved = await resolveRequest(request);
    check = checkTransfer({ ...resolved, user });
    if ( !check.ok ) return { status: "error", reason: check.reason, data: check.data };
    try {
      const outcome = resolved.kind === "item" ? await moveItem(resolved) : await moveCurrency(resolved);
      const note = {
        kind: resolved.kind,
        take: isTake(resolved.source, user),
        sourceUuid: resolved.source.uuid,
        targetUuid: resolved.target.uuid,
        itemUuid: outcome.item?.uuid ?? null,
        quantity: resolved.quantity,
        amounts: outcome.amounts ?? null,
        remind: check.remind,
        undo: outcome.undo
      };
      const summary = describe({ ...note, source: resolved.source, target: resolved.target, item: outcome.item });
      await announce(note);
      Hooks.callAll(`${MODULE_ID}.transferred`, {
        kind: resolved.kind, source: resolved.source, target: resolved.target, item: outcome.item ?? null,
        quantity: resolved.quantity, amounts: outcome.amounts ?? null, user
      });
      return { status: "done", summary: summary.text };
    } catch(err) {
      logError(err);
      return { status: "error", reason: "Failed" };
    }
  });
}

/**
 * Move an item (or part of a stack, or a container with its contents) from the source to the target.
 * Creates on the target first, then reduces or deletes on the source.
 * @param {object} resolved
 * @returns {Promise<{item: Item, undo: UndoData}>}  The item on the target (a new item, or the stack it was added to).
 */
async function moveItem({ source, target, item, quantity }) {
  const added = await addItem(target, item, quantity);
  const removed = await removeItem(source, item, quantity);
  return { item: added.item, undo: { items: itemsUndo(target, added, source, removed) } };
}

/**
 * @param {Actor} target
 * @param {object} added           From `addItem`.
 * @param {Actor|null} source
 * @param {object|null} removed    From `removeItem`.
 * @returns {object}  `UndoData#items`.
 */
function itemsUndo(target, added, source, removed) {
  return {
    target: target.uuid,
    added: added.record,
    source: source?.uuid ?? null,
    removed: removed ? { ...removed, fallback: added.data } : null
  };
}

/**
 * Create a copy of the item (with its contents) on an actor, or add to a matching stack there.
 * @param {Actor} target
 * @param {Item} item      The item on another actor, or in the sidebar or a compendium.
 * @param {number} quantity
 * @returns {Promise<{item: Item, record: object, data: object[]}>}  The new item or the stack it was added to,
 *   what was done (for undo), and the creation data of the moved part.
 */
async function addItem(target, item, quantity) {
  const data = await sys.buildItemData(item, quantity);
  const [first, ...contents] = data;
  if ( !first ) throw new Error(`Could not prepare ${item.uuid} for transfer`);
  const stack = contents.length ? null : sys.findStack(target, first);
  if ( stack ) {
    await stack.update(sys.quantityUpdate(stack, sys.getQuantity(stack) + quantity), { ...OPERATION_OPTIONS });
    return { item: stack, record: { quantity, stackId: stack.id }, data };
  }
  const created = await Item.implementation.createDocuments([first, ...contents], {
    ...OPERATION_OPTIONS, parent: target, keepId: true
  });
  return { item: created[0], record: { quantity, createdIds: created.map(i => i.id) }, data };
}

/**
 * Reduce the item's stack on its actor, or delete it (with its contents) when all of it leaves.
 * @param {Actor} source
 * @param {Item} item
 * @param {number} quantity
 * @returns {Promise<{itemId: string, restore: object[]|null}>}  For undo: a copy of what was deleted.
 */
async function removeItem(source, item, quantity) {
  const available = sys.getQuantity(item);
  if ( quantity >= available ) {
    const ids = await sys.getDeleteIds(item);
    const restore = ids.map(id => source.items.get(id)?.toObject()).filter(d => d);
    await Item.implementation.deleteDocuments(ids, { ...OPERATION_OPTIONS, parent: source });
    return { itemId: item.id, restore };
  }
  await item.update(sys.quantityUpdate(item, available - quantity), { ...OPERATION_OPTIONS });
  return { itemId: item.id, restore: null };
}

/**
 * Move currency from the source to the target. Adds to the target first, then subtracts from the source.
 * @param {object} resolved
 * @returns {Promise<{amounts: Record<string, number>, undo: UndoData}>}
 */
async function moveCurrency({ source, target, amounts }) {
  const have = sys.getCurrency(source);
  const gets = sys.getCurrency(target);
  const moved = Object.fromEntries(Object.entries(amounts).filter(([, v]) => v > 0));
  const added = Object.fromEntries(Object.entries(moved).map(([k, v]) => [k, gets[k] + v]));
  const left = Object.fromEntries(Object.entries(moved).map(([k, v]) => [k, have[k] - v]));
  await target.update(sys.currencyUpdate(added), { ...OPERATION_OPTIONS });
  await source.update(sys.currencyUpdate(left), { ...OPERATION_OPTIONS });
  const negate = amounts => Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, -v]));
  return {
    amounts: moved,
    undo: { currency: [{ actor: target.uuid, delta: moved }, { actor: source.uuid, delta: negate(moved) }] }
  };
}

/* -------------------------------------------- */
/*  Handing out sidebar / compendium items      */
/* -------------------------------------------- */

/**
 * Give a copy of an item from the sidebar or a compendium to an actor. GM only; runs on the GM's client.
 * @param {object} request
 * @param {string} request.itemUuid    The item in the sidebar or a compendium.
 * @param {string} request.targetUuid  The actor that receives the copy.
 * @param {number} request.quantity
 * @returns {Promise<object>}  The result (`status`: "done" or "error").
 */
export async function requestGrant({ itemUuid, targetUuid, quantity }) {
  const item = await fromUuid(itemUuid);
  const target = await fromUuid(targetUuid);
  const resolved = {
    item: item instanceof Item ? item : null,
    target: target instanceof Actor ? target : null,
    quantity: Number(quantity)
  };
  const check = checkGrant({ ...resolved, user: game.user });
  if ( !check.ok ) return report({ status: "error", reason: check.reason });

  const result = await enqueue(async () => {
    try {
      const added = await addItem(resolved.target, resolved.item, resolved.quantity);
      const received = added.item;
      const note = {
        kind: "grant", take: false, sourceUuid: null, targetUuid: resolved.target.uuid, itemUuid: received.uuid,
        quantity: resolved.quantity, amounts: null, remind: false,
        undo: { items: itemsUndo(resolved.target, added, null, null) }
      };
      const summary = describe({ ...note, source: null, target: resolved.target, item: received });
      await announce(note);
      Hooks.callAll(`${MODULE_ID}.transferred`, {
        kind: "grant", source: null, target: resolved.target, item: received, quantity: resolved.quantity,
        amounts: null, user: game.user
      });
      return { status: "done", summary: summary.text };
    } catch(err) {
      logError(err);
      return { status: "error", reason: "Failed" };
    }
  });
  return report(result);
}

/* -------------------------------------------- */
/*  Buying                                      */
/* -------------------------------------------- */

/**
 * Ask for a purchase. The GM runs it on their own client; players send it to the active GM, who owns the seller.
 * @param {PurchaseRequest} request
 * @returns {Promise<object>}  The result (`status`: "done", "declined", "expired" or "error").
 */
export async function requestPurchase(request) {
  request = { ...request, sceneId: request.sceneId ?? canvas.scene?.id ?? null };
  const resolved = await resolvePurchase(request);
  const check = await checkPurchase({ ...resolved, user: game.user });
  if ( !check.ok ) return report({ status: "error", reason: check.reason, data: check.data });

  let result;
  if ( game.user.isGM ) result = await processPurchase(request, game.user);
  else {
    const gm = game.users.activeGM;
    if ( !gm ) return report({ status: "error", reason: "NoGM" });
    if ( !game.user.hasPermission("QUERY_USER") ) return report({ status: "error", reason: "NoQueryPermission" });
    const approval = getPurchaseApproval(resolved, game.user);
    if ( approval ) ui.notifications.info(tf(`Notify.Waiting.${approval.type}`, { name: approval.name }));
    try {
      result = await gm.query(QUERY.buy, request);
    } catch(err) {
      logError(err);
      result = { status: "error", reason: "Failed" };
    }
  }
  return report(result);
}

/**
 * Turn a purchase request into documents.
 * @param {PurchaseRequest} request
 * @returns {Promise<object>}  Arguments for `checkPurchase` (without the user).
 */
async function resolvePurchase(request) {
  const item = await fromUuid(request.itemUuid);
  const target = await fromUuid(request.targetUuid);
  const isItem = item instanceof Item;
  const unitPrice = request.unitPrice ?? null;
  return {
    item: isItem ? item : null,
    source: (isItem && (item.parent instanceof Actor)) ? item.parent : null,
    target: target instanceof Actor ? target : null,
    quantity: Number(request.quantity),
    unitPrice: (unitPrice === null) || (unitPrice === "") ? null : Number(unitPrice),
    scene: game.scenes.get(request.sceneId) ?? null
  };
}

/**
 * Who has to agree before a purchase happens.
 * - GM approval mode: the GM, for every purchase by a player.
 * - Buying from a character a player owns (and the buyer doesn't): that player, always, so nobody's things are
 *   bought away without asking. Without an active player, the GM answers.
 * - Otherwise nobody.
 * @param {object} resolved
 * @param {User} user  The buyer's user.
 * @returns {{type: "GM"|"Seller", user: User|null, name: string}|null}
 */
function getPurchaseApproval({ source }, user) {
  if ( user.isGM ) return null;
  const gm = game.users.activeGM;
  const asGM = { type: "GM", user: gm, name: gm?.name ?? t("GM") };
  if ( getSetting("approvalMode") === APPROVAL.gm ) return asGM;
  if ( !source || source.testUserPermission(user, "OWNER") ) return null;
  const owners = playerOwners(source);
  if ( !owners.length ) return null;
  const active = owners.filter(u => u.active && (u !== user));
  const seller = active.find(u => u.character?.id === source.id) ?? active[0];
  return seller ? { type: "Seller", user: seller, name: seller.name } : asGM;
}

/**
 * The GM-side handler of the buy query.
 * @param {PurchaseRequest} request
 * @param {{user: User}} context
 * @returns {Promise<object>}
 */
export async function onBuyQuery(request, { user }) {
  if ( !game.user.isActiveGM ) return { status: "error", reason: "NoGM" };
  return processPurchase(request, user);
}

/**
 * Check, ask for approval, then perform a purchase: the buyer gets the item, the seller gets the money (a sidebar or
 * compendium item has no seller, so the money is just spent), then the item leaves the seller.
 * @param {PurchaseRequest} request
 * @param {User} user
 * @returns {Promise<object>}
 */
async function processPurchase(request, user) {
  let resolved = await resolvePurchase(request);
  let check = await checkPurchase({ ...resolved, user });
  if ( !check.ok ) return { status: "error", reason: check.reason, data: check.data };

  const approval = getPurchaseApproval(resolved, user);
  if ( approval ) {
    const answer = await askApproval(approval, resolved, user, check.price);
    if ( answer === null ) return { status: "expired", by: approval.name };
    if ( !answer ) return { status: "declined", by: approval.name };
  }

  return enqueue(async () => {
    resolved = await resolvePurchase(request);
    check = await checkPurchase({ ...resolved, user });
    if ( !check.ok ) return { status: "error", reason: check.reason, data: check.data };
    const { source, target, item, quantity } = resolved;
    try {
      const currency = [];
      const added = await addItem(target, item, quantity);
      const received = added.item;
      if ( source && sys.hasCurrency(source) ) {
        const gets = sys.getCurrency(source);
        const coins = sys.toCoins(check.price);
        const more = Object.fromEntries(Object.entries(coins).map(([k, v]) => [k, (gets[k] ?? 0) + v]));
        await source.update(sys.currencyUpdate(more), { ...OPERATION_OPTIONS });
        currency.push({ actor: source.uuid, delta: coins });
      }
      const before = sys.getCurrency(target);
      await target.update(sys.currencyUpdate(check.payment), { ...OPERATION_OPTIONS });
      const paid = Object.fromEntries(Object.entries(check.payment)
        .map(([k, v]) => [k, v - (before[k] ?? 0)]).filter(([, v]) => v !== 0));
      currency.push({ actor: target.uuid, delta: paid });
      const removed = source ? await removeItem(source, item, quantity) : null;

      const note = {
        kind: "buy", take: false, sourceUuid: source?.uuid ?? null, targetUuid: target.uuid,
        itemUuid: received.uuid, quantity, amounts: null, price: check.price, remind: check.remind,
        undo: { items: itemsUndo(target, added, source, removed), currency }
      };
      const summary = describe({ ...note, source, target, item: received });
      await announce(note);
      Hooks.callAll(`${MODULE_ID}.transferred`, {
        kind: "buy", source, target, item: received, quantity, amounts: null, price: check.price, user
      });
      return { status: "done", summary: summary.text };
    } catch(err) {
      logError(err);
      return { status: "error", reason: "Failed" };
    }
  });
}

/* -------------------------------------------- */
/*  Selling                                     */
/* -------------------------------------------- */

/**
 * Ask for a sale. Always runs on a GM's client, since only a GM can write to the world compendium.
 * @param {SaleRequest} request
 * @returns {Promise<object>}  The result (`status`: "done", "declined", "expired" or "error").
 */
export async function requestSale(request) {
  const resolved = await resolveSale(request);
  const check = await checkSale({ ...resolved, user: game.user });
  if ( !check.ok ) return report({ status: "error", reason: check.reason, data: check.data });

  let result;
  if ( game.user.isGM ) result = await processSale(request, game.user);
  else {
    const gm = game.users.activeGM;
    if ( !gm ) return report({ status: "error", reason: "NoGM" });
    if ( !game.user.hasPermission("QUERY_USER") ) return report({ status: "error", reason: "NoQueryPermission" });
    const approval = getSaleApproval(game.user);
    if ( approval ) ui.notifications.info(tf(`Notify.Waiting.${approval.type}`, { name: approval.name }));
    try {
      result = await gm.query(QUERY.sell, request);
    } catch(err) {
      logError(err);
      result = { status: "error", reason: "Failed" };
    }
  }
  return report(result);
}

/**
 * Turn a sale request into documents.
 * @param {SaleRequest} request
 * @returns {Promise<object>}  Arguments for `checkSale` (without the user).
 */
async function resolveSale(request) {
  const item = await fromUuid(request.itemUuid);
  const owned = (item instanceof Item) && (item.parent instanceof Actor);
  const custom = request.customPrice;
  return {
    item: owned ? item : null,
    source: owned ? item.parent : null,
    quantity: Number(request.quantity),
    priceMode: String(request.priceMode ?? ""),
    customPrice: ((custom === null) || (custom === undefined) || (custom === "")) ? null : Number(custom)
  };
}

/**
 * Who has to agree before a player's sale: the GM in the GM approval mode, otherwise nobody. A custom price needs no
 * extra approval: players can already change the money on their own sheets.
 * @param {User} user
 * @returns {{type: "GM", user: User|null, name: string}|null}
 */
function getSaleApproval(user) {
  if ( user.isGM || (getSetting("approvalMode") !== APPROVAL.gm) ) return null;
  const gm = game.users.activeGM;
  return { type: "GM", user: gm, name: gm?.name ?? t("GM") };
}

/**
 * The GM-side handler of the sell query.
 * @param {SaleRequest} request
 * @param {{user: User}} context
 * @returns {Promise<object>}
 */
export async function onSellQuery(request, { user }) {
  if ( !game.user.isActiveGM ) return { status: "error", reason: "NoGM" };
  return processSale(request, user);
}

/**
 * The "Sold Items" world compendium, created on first use.
 * @returns {Promise<CompendiumCollection>}
 */
async function getSoldPack() {
  const pack = game.packs.get(`world.${SOLD_PACK_NAME}`);
  if ( pack ) return pack;
  return foundry.documents.collections.CompendiumCollection.createCompendium({
    label: t("Sell.Compendium"), name: SOLD_PACK_NAME, type: "Item"
  });
}

/**
 * The folder for an actor's sold items in the compendium (one per actor name), created on first use.
 * @param {CompendiumCollection} pack
 * @param {string} name
 * @returns {Promise<Folder>}
 */
async function getSoldFolder(pack, name) {
  const existing = pack.folders.find(f => f.name === name);
  if ( existing ) return existing;
  return Folder.implementation.create({ name, type: "Item" }, { pack: pack.collection });
}

/**
 * Check, ask for approval, then perform a sale: a copy goes into the "Sold Items" compendium (folder per seller),
 * the seller gets the money, then the item leaves the seller.
 * @param {SaleRequest} request
 * @param {User} user
 * @returns {Promise<object>}
 */
async function processSale(request, user) {
  let resolved = await resolveSale(request);
  let check = await checkSale({ ...resolved, user });
  if ( !check.ok ) return { status: "error", reason: check.reason, data: check.data };

  const approval = getSaleApproval(user);
  if ( approval ) {
    const answer = await sendOffer(approval, {
      type: approval.type, take: false, kind: "sell", source: resolved.source.name, target: null, user: user.name,
      img: resolved.item.img, what: itemLabel(resolved.item.name, resolved.quantity), price: sys.formatPrice(check.price)
    });
    if ( answer === null ) return { status: "expired", by: approval.name };
    if ( !answer ) return { status: "declined", by: approval.name };
  }

  return enqueue(async () => {
    resolved = await resolveSale(request);
    check = await checkSale({ ...resolved, user });
    if ( !check.ok ) return { status: "error", reason: check.reason, data: check.data };
    const { source, item, quantity } = resolved;
    try {
      const pack = await getSoldPack();
      if ( !pack ) return { status: "error", reason: "Failed" };
      if ( pack.locked ) return { status: "error", reason: "PackLocked", data: { name: pack.title } };
      const folder = await getSoldFolder(pack, source.name);
      const data = await sys.buildItemData(item, quantity);
      if ( !data?.length ) throw new Error(`Could not prepare ${item.uuid} for sale`);
      const packData = data.map(d => ({ ...foundry.utils.deepClone(d), folder: folder?.id ?? null }));
      const created = await Item.implementation.createDocuments(packData, {
        ...OPERATION_OPTIONS, pack: pack.collection, keepId: true
      });

      const coins = sys.toCoins(check.price);
      const have = sys.getCurrency(source);
      const more = Object.fromEntries(Object.entries(coins).map(([k, v]) => [k, (have[k] ?? 0) + v]));
      if ( Object.keys(more).length ) await source.update(sys.currencyUpdate(more), { ...OPERATION_OPTIONS });
      const removed = await removeItem(source, item, quantity);

      const note = {
        kind: "sell", take: false, sourceUuid: source.uuid, targetUuid: null, itemUuid: created[0].uuid, quantity,
        amounts: null, price: check.price, remind: false,
        undo: {
          items: {
            target: null, added: null, quantity, source: source.uuid, removed: { ...removed, fallback: data },
            pack: { id: pack.collection, ids: created.map(i => i.id) }
          },
          currency: [{ actor: source.uuid, delta: coins }]
        }
      };
      const summary = describe({ ...note, source, target: null, item: created[0] });
      await announce(note);
      Hooks.callAll(`${MODULE_ID}.transferred`, {
        kind: "sell", source, target: null, item: created[0], quantity, amounts: null, price: check.price, user
      });
      return { status: "done", summary: summary.text };
    } catch(err) {
      logError(err);
      return { status: "error", reason: "Failed" };
    }
  });
}

/* -------------------------------------------- */
/*  Approval                                    */
/* -------------------------------------------- */

/**
 * The data an offer dialog needs. Plain strings, localized on the client that shows the dialog.
 * @param {object} resolved
 * @param {User} user
 * @param {"GM"|"Recipient"} type
 * @returns {object}
 */
function offerData({ kind, source, target, item, quantity, amounts }, user, type) {
  return {
    type,
    take: isTake(source, user),
    kind,
    source: source.name,
    target: target.name,
    user: user.name,
    img: kind === "item" ? item.img : (source.img ?? null),
    what: kind === "item" ? itemLabel(item.name, quantity) : sys.formatCurrency(amounts)
  };
}

/**
 * The data an offer dialog for a purchase needs.
 * @param {object} resolved  From `resolvePurchase`.
 * @param {User} user
 * @param {"GM"|"Seller"} type
 * @param {sys.Price} price
 * @returns {object}
 */
function purchaseOfferData({ source, target, item, quantity }, user, type, price) {
  return {
    type,
    take: false,
    kind: "buy",
    source: source?.name ?? null,
    target: target.name,
    user: user.name,
    img: item.img,
    what: itemLabel(item.name, quantity),
    price: sys.formatPrice(price)
  };
}

/**
 * Ask the recipient's player or the GM. Runs on the client that processes the transfer.
 * @param {{type: string, user: User|null}} approval
 * @param {object} resolved
 * @param {User} user
 * @param {sys.Price} [price]  For purchases.
 * @returns {Promise<boolean|null>}  true to accept, false to decline, null without an answer.
 */
async function askApproval(approval, resolved, user, price) {
  const data = price ? purchaseOfferData(resolved, user, approval.type, price) : offerData(resolved, user, approval.type);
  return sendOffer(approval, data);
}

/**
 * Show an offer to the user who has to answer it (or on this client, if that's us).
 * @param {{user: User|null}} approval
 * @param {object} data  Offer data, see `offerData`.
 * @returns {Promise<boolean|null>}
 */
async function sendOffer(approval, data) {
  const asker = approval.user;
  if ( !asker?.active ) return null;
  if ( asker.isSelf ) return showOffer(data);
  try {
    return await asker.query(QUERY.offer, data, { timeout: OFFER_TIMEOUT + 5000 });
  } catch(err) {
    logError(err);
    return null;
  }
}

/**
 * The handler of the offer query, on the recipient's or the GM's client. Only the active GM may ask.
 * @param {object} data
 * @param {{user: User}} context
 * @returns {Promise<boolean|null>}
 */
export async function onOfferQuery(data, { user }) {
  if ( !user?.isGM ) throw new Error("Only a GM can send offers");
  return showOffer(data);
}

/**
 * @param {object} data  From `offerData` or `purchaseOfferData`.
 * @returns {string}  The question of an offer dialog.
 */
function offerText(data) {
  const args = { user: data.user, source: data.source, target: data.target, what: data.what, price: data.price };
  if ( data.kind === "sell" ) return tf("Offer.GM.Sell", args);
  if ( data.kind === "buy" ) {
    if ( data.type === "Seller" ) return tf("Offer.Seller", args);
    return tf(data.source ? "Offer.GM.Buy" : "Offer.GM.BuyNoSeller", args);
  }
  if ( data.type === "GM" ) return tf(`Offer.GM.${data.take ? "Take" : "Give"}`, args);
  return tf("Offer.Recipient", args);
}

/**
 * Show an offer and wait for the answer. Closes itself after the timeout.
 * @param {object} data  From `offerData`.
 * @returns {Promise<boolean|null>}
 */
async function showOffer(data) {
  const text = offerText(data);
  const content = await renderTemplate(`${TEMPLATE_PATH}/offer.hbs`, { img: data.img, text, hint: t("Offer.Hint") });
  let timer;
  const answer = await foundry.applications.api.DialogV2.wait({
    window: {
      title: t(`Offer.Title.${data.type}`),
      icon: { buy: "fa-solid fa-sack-dollar", sell: "fa-solid fa-hand-holding-dollar" }[data.kind]
        ?? "fa-solid fa-hand-holding-hand"
    },
    classes: ["ngt-dialog", "ngt-offer"],
    position: { width: 400 },
    content,
    buttons: [
      { action: "accept", label: t("Offer.Accept"), icon: "fa-solid fa-check", default: true },
      { action: "decline", label: t("Offer.Decline"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false,
    render: (event, dialog) => {
      timer = setTimeout(() => dialog.close(), OFFER_TIMEOUT);
    }
  });
  clearTimeout(timer);
  if ( answer === "accept" ) return true;
  if ( answer === "decline" ) return false;
  return null;
}

/* -------------------------------------------- */
/*  Chat message                                */
/* -------------------------------------------- */

/**
 * @param {string} name
 * @param {number} quantity
 * @returns {string}  e.g. "3× Potion of Healing".
 */
function itemLabel(name, quantity) {
  return quantity > 1 ? tf("Quantity", { quantity, name }) : name;
}

/**
 * Text of a finished transfer: plain (for notifications) and HTML (for the chat card).
 * @param {object} info
 * @param {"item"|"currency"} info.kind
 * @param {boolean} info.take
 * @param {Actor} info.source
 * @param {Actor} info.target
 * @param {Item|null} info.item         The item on the target.
 * @param {number} info.quantity
 * @param {Record<string, number>|null} info.amounts
 * @param {sys.Price} [info.price]       For purchases.
 * @returns {{text: string, html: string}}
 */
function describe({ kind, take, source, target, item, quantity, amounts, price }) {
  let key;
  if ( kind === "sell" ) key = "Chat.Sold";
  else if ( kind === "buy" ) key = source ? "Chat.Bought" : "Chat.BoughtNoSeller";
  else key = `Chat.${kind === "grant" ? "Received" : (take ? "Took" : "Gave")}`;
  const priceText = price ? sys.formatPrice(price) : "";
  const isItem = kind !== "currency";
  const plainWhat = isItem ? itemLabel(item.name, quantity) : sys.formatCurrency(amounts);
  const htmlWhat = isItem
    ? itemLabel(`@UUID[${item.uuid}]{${escapeHTML(item.name)}}`, quantity)
    : `<strong>${escapeHTML(plainWhat)}</strong>`;
  return {
    text: tf(key, { source: source?.name, target: target?.name, what: plainWhat, price: priceText }),
    html: tf(key, {
      source: `<strong>${escapeHTML(source?.name ?? "")}</strong>`,
      target: `<strong>${escapeHTML(target?.name ?? "")}</strong>`,
      what: htmlWhat,
      price: `<strong>${escapeHTML(priceText)}</strong>`
    })
  };
}

/**
 * Post the chat message of a finished transfer. The active GM creates it, so players can't edit or delete it: a
 * player who performed the transfer on their own client sends the facts to the GM, who builds the message from the
 * documents. Without an active GM, the player creates it.
 * @param {object} note  Plain facts of the transfer (UUIDs and numbers), see `processTransfer`.
 */
async function announce(note) {
  if ( getSetting("chatMessages") === CHAT.off ) return;
  if ( !game.user.isGM ) {
    const gm = game.users.activeGM;
    if ( gm && game.user.hasPermission("QUERY_USER") ) {
      try {
        await gm.query(QUERY.message, note);
        return;
      } catch(err) {
        logError(err);
      }
    }
  }
  await createMessage(note, game.user);
}

/**
 * The GM-side handler of the message query.
 * @param {object} note
 * @param {{user: User}} context
 * @returns {Promise<boolean>}
 */
export async function onMessageQuery(note, { user }) {
  if ( !game.user.isActiveGM ) throw new Error("Not the active GM");
  await createMessage(note, user);
  return true;
}

/**
 * The speaker of a transfer message: the actor, without a token. Built by hand rather than with
 * `ChatMessage.getSpeaker`, which picks one of the actor's tokens; in Nik's world a module then replaced the alias of
 * token speakers with the GM's name.
 * @param {Actor} actor
 * @returns {object}
 */
function speakerFor(actor) {
  const token = actor.isToken ? actor.token : null;
  return { scene: token?.parent?.id ?? null, actor: actor.id, token: token?.id ?? null, alias: actor.name };
}

/**
 * Build and create the chat message from the transfer's facts.
 * @param {object} note
 * @param {User} user  The user who performed the transfer.
 */
async function createMessage(note, user) {
  const mode = getSetting("chatMessages");
  if ( mode === CHAT.off ) return;
  const grant = note.kind === "grant";
  const buy = note.kind === "buy";
  const sell = note.kind === "sell";
  const source = (grant || (buy && !note.sourceUuid)) ? null : await fromUuid(note.sourceUuid);
  const target = sell ? null : await fromUuid(note.targetUuid);
  const item = note.itemUuid ? await fromUuid(note.itemUuid) : null;
  if ( (!sell && !(target instanceof Actor)) || (note.sourceUuid && !(source instanceof Actor)) ) return;
  if ( !grant && !buy && !source ) return;
  // A sold item is the copy in the "Sold Items" compendium; everything else is the item on the recipient
  if ( sell ? (item?.pack !== `world.${SOLD_PACK_NAME}`)
    : ((note.kind !== "currency") && (item?.parent !== target)) ) return;
  // Only the GM hands out items and runs purchases and sales; only someone involved in a transfer can announce it
  if ( (grant || buy || sell) ? !user.isGM
    : (!user.isGM && !source.testUserPermission(user, "OWNER") && !target.testUserPermission(user, "OWNER")) ) return;
  let price = null;
  if ( buy || sell ) {
    const value = Number(note.price?.value);
    const denomination = note.price?.denomination;
    if ( !Number.isFinite(value) || !sys.isDenomination(denomination) ) return;
    price = { value, denomination };
  }

  const quantity = Math.max(1, Math.round(Number(note.quantity)) || 1);
  const amounts = {};
  for ( const [k, v] of Object.entries(note.amounts ?? {}) ) {
    const value = Math.round(Number(v));
    if ( value > 0 ) amounts[k] = value;
  }
  const take = !!note.take;
  const summary = describe({ kind: note.kind, take, source, target, item, quantity, amounts, price });
  const actor = (take || grant || buy) ? target : source;
  const content = await renderTemplate(`${TEMPLATE_PATH}/chat-card.hbs`, {
    img: item?.img ?? null,
    icon: item ? null : "fa-solid fa-coins",
    text: summary.html,
    reminder: note.remind ? tf("Chat.CombatReminder", { name: actor.name }) : null
  });
  const data = {
    author: game.user.id,
    speaker: speakerFor(actor),
    content,
    flags: {
      [MODULE_ID]: {
        transfer: {
          kind: note.kind, source: source?.uuid ?? null, target: target?.uuid ?? null, item: item?.uuid ?? null, price
        },
        // A player who ran the transfer on their own client sent these facts; undo then only touches actors that
        // player owns (see undo.js)
        undo: note.undo ? { ...note.undo, user: user.isGM ? null : user.id } : null
      }
    }
  };
  if ( mode === CHAT.whisper ) {
    const ids = new Set([user.id, ...(target ? playerOwners(target).map(u => u.id) : [])]);
    if ( source ) playerOwners(source).forEach(u => ids.add(u.id));
    game.users.filter(u => u.isGM).forEach(u => ids.add(u.id));
    data.whisper = Array.from(ids);
  }
  await ChatMessage.implementation.create(data);
}
