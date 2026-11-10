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
 */

import { MODULE_ID, OFFER_TIMEOUT, OPERATION_OPTIONS, QUERY, TEMPLATE_PATH, logError, t, tf } from "./constants.js";
import * as sys from "./dnd5e.js";
import { checkTransfer, isTake, playerOwners } from "./rules.js";
import { APPROVAL, CHAT, getSetting } from "./settings.js";

const { renderTemplate } = foundry.applications.handlebars;
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
 * @param {Function} fn
 * @returns {Promise<*>}
 */
function enqueue(fn) {
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
        remind: check.remind
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
 * @returns {Promise<{item: Item}>}  The item on the target (a new item, or the stack it was added to).
 */
async function moveItem({ source, target, item, quantity }) {
  const available = sys.getQuantity(item);
  const [first, ...contents] = await sys.buildItemData(item, quantity);
  if ( !first ) throw new Error(`Could not prepare ${item.uuid} for transfer`);

  let received;
  const stack = contents.length ? null : sys.findStack(target, first);
  if ( stack ) {
    await stack.update(sys.quantityUpdate(stack, sys.getQuantity(stack) + quantity), { ...OPERATION_OPTIONS });
    received = stack;
  } else {
    [received] = await Item.implementation.createDocuments([first, ...contents], {
      ...OPERATION_OPTIONS, parent: target, keepId: true
    });
  }

  if ( quantity >= available ) {
    const ids = await sys.getDeleteIds(item);
    await Item.implementation.deleteDocuments(ids, { ...OPERATION_OPTIONS, parent: source });
  }
  else await item.update(sys.quantityUpdate(item, available - quantity), { ...OPERATION_OPTIONS });
  return { item: received };
}

/**
 * Move currency from the source to the target. Adds to the target first, then subtracts from the source.
 * @param {object} resolved
 * @returns {Promise<{amounts: Record<string, number>}>}
 */
async function moveCurrency({ source, target, amounts }) {
  const have = sys.getCurrency(source);
  const gets = sys.getCurrency(target);
  const moved = Object.fromEntries(Object.entries(amounts).filter(([, v]) => v > 0));
  const added = Object.fromEntries(Object.entries(moved).map(([k, v]) => [k, gets[k] + v]));
  const left = Object.fromEntries(Object.entries(moved).map(([k, v]) => [k, have[k] - v]));
  await target.update(sys.currencyUpdate(added), { ...OPERATION_OPTIONS });
  await source.update(sys.currencyUpdate(left), { ...OPERATION_OPTIONS });
  return { amounts: moved };
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
 * Ask the recipient's player or the GM. Runs on the client that processes the transfer.
 * @param {{type: string, user: User|null}} approval
 * @param {object} resolved
 * @param {User} user
 * @returns {Promise<boolean|null>}  true to accept, false to decline, null without an answer.
 */
async function askApproval(approval, resolved, user) {
  const data = offerData(resolved, user, approval.type);
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
 * Show an offer and wait for the answer. Closes itself after the timeout.
 * @param {object} data  From `offerData`.
 * @returns {Promise<boolean|null>}
 */
async function showOffer(data) {
  const action = data.take ? "Take" : "Give";
  const text = data.type === "GM"
    ? tf(`Offer.GM.${action}`, { user: data.user, source: data.source, target: data.target, what: data.what })
    : tf("Offer.Recipient", { source: data.source, what: data.what });
  const content = await renderTemplate(`${TEMPLATE_PATH}/offer.hbs`, { img: data.img, text, hint: t("Offer.Hint") });
  let timer;
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: t(`Offer.Title.${data.type}`), icon: "fa-solid fa-hand-holding-hand" },
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
 * @returns {{text: string, html: string}}
 */
function describe({ kind, take, source, target, item, quantity, amounts }) {
  const key = `Chat.${take ? "Took" : "Gave"}`;
  const plainWhat = kind === "item" ? itemLabel(item.name, quantity) : sys.formatCurrency(amounts);
  const htmlWhat = kind === "item"
    ? itemLabel(`@UUID[${item.uuid}]{${escapeHTML(item.name)}}`, quantity)
    : `<strong>${escapeHTML(plainWhat)}</strong>`;
  return {
    text: tf(key, { source: source.name, target: target.name, what: plainWhat }),
    html: tf(key, {
      source: `<strong>${escapeHTML(source.name)}</strong>`,
      target: `<strong>${escapeHTML(target.name)}</strong>`,
      what: htmlWhat
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
  const source = await fromUuid(note.sourceUuid);
  const target = await fromUuid(note.targetUuid);
  const item = note.itemUuid ? await fromUuid(note.itemUuid) : null;
  if ( !(source instanceof Actor) || !(target instanceof Actor) ) return;
  if ( (note.kind === "item") && (item?.parent !== target) ) return;
  // Only someone involved in the transfer can have it announced
  if ( !user.isGM && !source.testUserPermission(user, "OWNER") && !target.testUserPermission(user, "OWNER") ) return;

  const quantity = Math.max(1, Math.round(Number(note.quantity)) || 1);
  const amounts = {};
  for ( const [k, v] of Object.entries(note.amounts ?? {}) ) {
    const value = Math.round(Number(v));
    if ( value > 0 ) amounts[k] = value;
  }
  const take = !!note.take;
  const summary = describe({ kind: note.kind, take, source, target, item, quantity, amounts });
  const actor = take ? target : source;
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
      [MODULE_ID]: { transfer: { kind: note.kind, source: source.uuid, target: target.uuid, item: item?.uuid ?? null } }
    }
  };
  if ( mode === CHAT.whisper ) {
    const ids = new Set([user.id, ...playerOwners(source).map(u => u.id), ...playerOwners(target).map(u => u.id)]);
    game.users.filter(u => u.isGM).forEach(u => ids.add(u.id));
    data.whisper = Array.from(ids);
  }
  await ChatMessage.implementation.create(data);
}
