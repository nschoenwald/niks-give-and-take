/**
 * Where players start a transfer: the item context menu, dropping an item onto a token, and the sheet header menu.
 */

import { t } from "./constants.js";
import * as sys from "./dnd5e.js";
import { openCurrencyDialog, openItemDialog } from "./dialogs.js";
import { getTargets, isAllowedTarget, isTake, sameActor } from "./rules.js";
import { getSetting } from "./settings.js";

/**
 * "Give to…" / "Take…" in the context menu of inventory items (character, NPC and group sheets).
 * @param {Item} item
 * @param {object[]} options
 */
function onItemContextOptions(item, options) {
  if ( item.pack || !sys.isGiveable(item) ) return;
  if ( !getTargets(item.actor).length ) return;
  const take = isTake(item.actor);
  options.push({
    label: t(take ? "Menu.Take" : "Menu.Give"),
    icon: `fa-solid ${take ? "fa-hand-holding" : "fa-hand-holding-hand"} fa-fw`,
    group: "action",
    onClick: () => openItemDialog(item)
  });
}

/**
 * "Give to…" in the context menu of the Items sidebar and of item compendiums (GM only): hands out a copy.
 * @param {DocumentDirectory} app  The Items sidebar or a compendium window.
 * @param {object[]} options
 */
function onDirectoryContextOptions(app, options) {
  if ( !game.user.isGM ) return;
  const isPack = app.collection instanceof foundry.documents.collections.CompendiumCollection;
  const entry = li => (isPack ? app.collection.index.get(li.dataset.entryId) : game.items.get(li.dataset.entryId));
  options.push({
    label: t("Menu.Give"),
    icon: "fa-solid fa-hand-holding-hand fa-fw",
    group: "system",
    visible: li => sys.isPhysicalType(entry(li)?.type),
    onClick: async (event, li) => {
      const item = isPack ? await app.collection.getDocument(li.dataset.entryId) : game.items.get(li.dataset.entryId);
      if ( item ) openItemDialog(item);
    }
  });
}

/**
 * Dropping an owned item onto another actor's token opens the dialog with that actor selected. Must answer
 * synchronously, so it only handles drops it can decide on right away.
 * @param {Canvas} canvas
 * @param {object} data
 * @returns {boolean|void}  false when the drop was handled here.
 */
function onDropCanvasData(canvas, data) {
  if ( (data.type !== "Item") || !data.uuid || !getSetting("tokenDrop") ) return;
  const item = fromUuidSync(data.uuid);
  const source = item?.actor;
  if ( !source || !sys.isGiveable(item) ) return;

  const token = canvas.tokens.placeables
    .filter(tk => tk.visible && tk.actor && !sameActor(tk.actor, source) && tk.bounds.contains(data.x, data.y))
    .sort((a, b) => (a.document.sort ?? 0) - (b.document.sort ?? 0))
    .at(-1);
  if ( !token || !isAllowedTarget(source, token.actor) ) return;

  openItemDialog(item, { target: token.actor });
  return false;
}

/**
 * "Give money" / "Take money" in the header menu of sheets whose actor has currency.
 * @param {ApplicationV2} app
 * @param {object[]} controls
 */
function onActorSheetHeaderControls(app, controls) {
  const actor = app.document;
  if ( !(actor instanceof Actor) || !getSetting("allowCurrency") || !sys.hasCurrency(actor) ) return;
  if ( !getTargets(actor).some(a => sys.hasCurrency(a)) ) return;
  const take = isTake(actor);
  controls.push({
    icon: "fa-solid fa-coins",
    label: t(take ? "Menu.TakeCurrency" : "Menu.GiveCurrency"),
    action: "ngtCurrency",
    onClick: () => openCurrencyDialog(actor)
  });
}

/**
 * Register the hooks. Called in `init`.
 */
export function registerEntryPoints() {
  Hooks.on("dnd5e.getItemContextOptions", onItemContextOptions);
  Hooks.on("getItemContextOptions", onDirectoryContextOptions);
  Hooks.on("dropCanvasData", onDropCanvasData);
  Hooks.on("getHeaderControlsActorSheetV2", onActorSheetHeaderControls);
}
