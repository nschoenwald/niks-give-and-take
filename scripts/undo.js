/**
 * Undo: a button on transfer chat messages (GM only) that reverses what the transfer changed. The transfer stores
 * what it did in the message (`flags.niks-give-and-take.undo`, see the UndoData typedef in transfer.js).
 *
 * Everything is checked before anything changes: if the item was used, moved or sold on since, or the money was
 * spent, the undo is refused and nothing happens.
 */

import { MODULE_ID, OPERATION_OPTIONS, logError, t, tf } from "./constants.js";
import * as sys from "./dnd5e.js";
import { enqueue } from "./transfer.js";

const { DialogV2 } = foundry.applications.api;
const { escapeHTML } = foundry.utils;

/**
 * @param {string|null} uuid
 * @returns {Promise<Actor|null>}
 */
async function actorOf(uuid) {
  if ( !uuid ) return null;
  const actor = await fromUuid(uuid).catch(() => null);
  return actor instanceof Actor ? actor : null;
}

/**
 * Check the undo and work out every change, without changing anything yet.
 * @param {object} undo  UndoData from the message.
 * @returns {Promise<{ok: true, steps: Function[]}|{ok: false, reason: string, data?: object}>}
 */
async function planUndo(undo) {
  const fail = (reason, data) => ({ ok: false, reason, data });
  // Facts a player sent from their own client: only touch actors that player owns, so a forged message can't do
  // more than the player could do themselves
  const player = undo.user ? game.users.get(undo.user) : null;
  if ( undo.user && !player ) return fail("NotAllowed");
  const allowed = actor => !player || actor.testUserPermission(player, "OWNER");
  const steps = [];

  if ( undo.items ) {
    const { added, removed } = undo.items;
    const quantity = Math.round(Number(added?.quantity ?? undo.items.quantity));
    if ( !(quantity > 0) ) return fail("Missing");

    // What the recipient has to give back (nothing for sales: their copy is in the compendium)
    let takeBack = null;
    const target = undo.items.target ? await actorOf(undo.items.target) : null;
    if ( undo.items.target && !target ) return fail("Missing");
    if ( target && !allowed(target) ) return fail("NotAllowed");
    if ( target && added?.stackId ) {
      const stack = target.items.get(added.stackId);
      if ( !stack || (sys.getQuantity(stack) < quantity) ) return fail("ItemChanged", { name: target.name });
      takeBack = async () => {
        const left = sys.getQuantity(stack) - quantity;
        if ( left > 0 ) await stack.update(sys.quantityUpdate(stack, left), { ...OPERATION_OPTIONS });
        else await Item.implementation.deleteDocuments([stack.id], { ...OPERATION_OPTIONS, parent: target });
      };
    } else if ( target ) {
      const ids = Array.isArray(added?.createdIds) ? added.createdIds : [];
      const first = target.items.get(ids[0]);
      if ( !first || (sys.getQuantity(first) < quantity) ) return fail("ItemChanged", { name: target.name });
      takeBack = async () => {
        // Something may have been stacked onto the created item since: then only take the moved quantity back
        const left = sys.getQuantity(first) - quantity;
        if ( left > 0 ) await first.update(sys.quantityUpdate(first, left), { ...OPERATION_OPTIONS });
        else {
          const existing = ids.filter(id => target.items.has(id));
          await Item.implementation.deleteDocuments(existing, { ...OPERATION_OPTIONS, parent: target });
        }
      };
    }

    // What the source gets back (nothing for sidebar and compendium items)
    let giveBack = null;
    if ( undo.items.source ) {
      const source = await actorOf(undo.items.source);
      if ( !source ) return fail("Missing");
      if ( !allowed(source) ) return fail("NotAllowed");
      const original = removed?.restore ? null : source.items.get(removed?.itemId);
      const docs = removed?.restore ?? removed?.fallback ?? [];
      if ( !original && !docs.length ) return fail("Missing");
      giveBack = async () => {
        if ( original ) {
          await original.update(sys.quantityUpdate(original, sys.getQuantity(original) + quantity),
            { ...OPERATION_OPTIONS });
          return;
        }
        const keepId = docs.every(d => !d._id || !source.items.has(d._id));
        await Item.implementation.createDocuments(foundry.utils.deepClone(docs), {
          ...OPERATION_OPTIONS, parent: source, keepId
        });
      };
    }

    // Like a transfer: create on the receiving side first, then take away
    if ( giveBack ) steps.push(giveBack);
    if ( takeBack ) steps.push(takeBack);

    // Sales: remove the copy from the "Sold Items" compendium (if it's still there)
    if ( undo.items.pack ) {
      const pack = game.packs.get(undo.items.pack.id);
      if ( pack?.locked ) return fail("PackLocked", { name: pack.title });
      const ids = pack ? (undo.items.pack.ids ?? []).filter(id => pack.index.has(id)) : [];
      if ( ids.length ) {
        steps.push(() => Item.implementation.deleteDocuments(ids, { ...OPERATION_OPTIONS, pack: pack.collection }));
      }
    }
  }

  for ( const { actor: uuid, delta } of undo.currency ?? [] ) {
    const actor = await actorOf(uuid);
    if ( !actor || !sys.hasCurrency(actor) ) return fail("Missing");
    if ( !allowed(actor) ) return fail("NotAllowed");
    const have = sys.getCurrency(actor);
    const next = {};
    for ( const [key, value] of Object.entries(delta ?? {}) ) {
      if ( !(key in have) || !Number.isFinite(Number(value)) ) continue;
      next[key] = have[key] - Number(value);
      if ( next[key] < 0 ) return fail("MoneySpent", { name: actor.name });
    }
    if ( Object.keys(next).length ) {
      steps.push(() => actor.update(sys.currencyUpdate(next), { ...OPERATION_OPTIONS }));
    }
  }

  if ( !steps.length ) return fail("Missing");
  return { ok: true, steps };
}

/**
 * @param {ChatMessage} message
 * @param {User} [user]
 * @returns {boolean}  Whether the user may undo this message's transfer: GM only, not yet undone.
 */
function canUndo(message, user=game.user) {
  return user.isGM && !!message?.getFlag(MODULE_ID, "undo") && !message.getFlag(MODULE_ID, "undone");
}

/**
 * Ask, then undo a transfer and mark its message as undone. GM only, runs in the transfer queue.
 * @param {ChatMessage} message
 */
export async function undoTransfer(message) {
  if ( !canUndo(message) ) return;
  const confirmed = await DialogV2.confirm({
    window: { title: t("Undo.Title"), icon: "fa-solid fa-rotate-left" },
    content: `<p>${t("Undo.Confirm")}</p>`,
    rejectClose: false
  });
  if ( !confirmed ) return;

  const result = await enqueue(async () => {
    // Another GM may have undone it while this one was asked
    if ( message.getFlag(MODULE_ID, "undone") ) return { ok: false, reason: "AlreadyUndone" };
    const plan = await planUndo(message.getFlag(MODULE_ID, "undo"));
    if ( !plan.ok ) return plan;
    try {
      for ( const step of plan.steps ) await step();
    } catch(err) {
      logError(err);
      return { ok: false, reason: "Failed" };
    }
    await message.update({ [`flags.${MODULE_ID}.undone`]: { user: game.user.id, time: Date.now() } });
    return { ok: true };
  });

  if ( !result.ok ) {
    ui.notifications.warn(tf(`Undo.Error.${result.reason}`, result.data ?? {}));
    return;
  }
  Hooks.callAll(`${MODULE_ID}.undone`, { message, transfer: message.getFlag(MODULE_ID, "transfer") ?? null });
}

/**
 * Add the undo button (GM, not yet undone) or the "undone" note to a transfer message.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function onRenderChatMessageHTML(message, html) {
  const card = html.querySelector(".ngt-card");
  if ( !card ) return;
  const undone = message.getFlag(MODULE_ID, "undone");
  if ( undone ) {
    card.classList.add("ngt-undone");
    const name = game.users.get(undone.user)?.name ?? t("GM");
    const note = document.createElement("p");
    note.className = "ngt-card-undone";
    note.innerHTML = `<i class="fa-solid fa-rotate-left" inert></i> ${escapeHTML(tf("Undo.Done", { name }))}`;
    card.querySelector(".ngt-card-body")?.append(note);
    return;
  }
  if ( !canUndo(message) ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ngt-undo-button";
  button.dataset.tooltip = t("Undo.Button");
  button.setAttribute("aria-label", t("Undo.Button"));
  button.innerHTML = '<i class="fa-solid fa-rotate-left" inert></i>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    undoTransfer(message);
  });
  card.append(button);
}

/**
 * Register the hooks. Called in `init`.
 */
export function registerUndo() {
  Hooks.on("renderChatMessageHTML", onRenderChatMessageHTML);
}
