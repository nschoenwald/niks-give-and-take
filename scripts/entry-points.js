/**
 * Where players start a transfer: the item context menu, dropping an item onto a token, the sheet header menu, the
 * Items sidebar and compendiums, and dnd5e's compendium browser.
 */

import { t } from "./constants.js";
import * as sys from "./dnd5e.js";
import { openBuyDialog, openCurrencyDialog, openItemDialog, openSellDialog } from "./dialogs.js";
import { canBuyFrom, canSellFrom, getBuyers, getTargets, isAllowedTarget, isTake, sameActor } from "./rules.js";
import { getSetting } from "./settings.js";

/** Menu icons. */
const ICON = {
  give: "fa-solid fa-hand-holding-hand fa-fw",
  take: "fa-solid fa-hand-holding fa-fw",
  buy: "fa-solid fa-sack-dollar fa-fw",
  sell: "fa-solid fa-hand-holding-dollar fa-fw"
};

/**
 * "Give to…" / "Take…", "Buy…" and "Sell…" in the context menu of inventory items (character, NPC and group sheets).
 * @param {Item} item
 * @param {object[]} options
 */
function onItemContextOptions(item, options) {
  if ( item.pack || !sys.isGiveable(item) ) return;
  if ( getTargets(item.actor).length ) {
    const take = isTake(item.actor);
    options.push({
      label: t(take ? "Menu.Take" : "Menu.Give"),
      icon: take ? ICON.take : ICON.give,
      group: "action",
      onClick: () => openItemDialog(item)
    });
  }
  // Players can't buy unidentified items or items without a price
  const playerMayBuy = sys.hasPrice(item) && !sys.isUnidentified(item);
  if ( canBuyFrom(item.actor) && (game.user.isGM || playerMayBuy) && getBuyers(item.actor).length ) {
    options.push({ label: t("Menu.Buy"), icon: ICON.buy, group: "action", onClick: () => openBuyDialog(item) });
  }
  // Selling is for characters and groups; players can't sell unidentified items
  if ( canSellFrom(item.actor) && (game.user.isGM || !sys.isUnidentified(item)) ) {
    options.push({ label: t("Menu.Sell"), icon: ICON.sell, group: "action", onClick: () => openSellDialog(item) });
  }
}

/**
 * Menu entries for a sidebar or compendium item: "Give to…" (GM only, hands out a copy) and "Buy…" (buys a copy).
 * @param {function(HTMLElement): (object|undefined)} entry       The item or index entry of a menu target.
 * @param {function(HTMLElement): Promise<Item|null>} getItem   Loads the item of a menu target.
 * @returns {object[]}
 */
function unownedItemOptions(entry, getItem) {
  const physical = li => sys.isPhysicalType(entry(li)?.type);
  const options = [];
  if ( game.user.isGM ) options.push({
    label: t("Menu.Give"),
    icon: ICON.give,
    group: "system",
    visible: physical,
    onClick: async (event, li) => {
      const item = await getItem(li);
      if ( item ) openItemDialog(item);
    }
  });
  options.push({
    label: t("Menu.Buy"),
    icon: ICON.buy,
    group: "system",
    visible: li => physical(li) && canBuyFrom(null) && (game.user.isGM || !sys.isUnidentified(entry(li)))
      && (getBuyers(null).length > 0),
    onClick: async (event, li) => {
      const item = await getItem(li);
      if ( item ) openBuyDialog(item);
    }
  });
  return options;
}

/**
 * "Give to…" and "Buy…" in the context menu of the Items sidebar and of item compendiums.
 * @param {DocumentDirectory} app  The Items sidebar or a compendium window.
 * @param {object[]} options
 */
function onDirectoryContextOptions(app, options) {
  const isPack = app.collection instanceof foundry.documents.collections.CompendiumCollection;
  const entry = li => (isPack ? app.collection.index.get(li.dataset.entryId) : game.items.get(li.dataset.entryId));
  const getItem = async li => (isPack ? app.collection.getDocument(li.dataset.entryId)
    : game.items.get(li.dataset.entryId)) ?? null;
  options.push(...unownedItemOptions(entry, getItem));
}

/**
 * dnd5e's compendium browser has no context menu of its own, so add one to its result rows with "Give to…" (GM)
 * and "Buy…". Attached once per browser window; the menu listens on the window, so re-rendered results keep it.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
function onRenderCompendiumBrowser(app, element) {
  if ( app._ngtContextMenu ) return;
  const isItem = li => foundry.utils.parseUuid(li.dataset.uuid ?? "")?.type === "Item";
  const entry = li => (isItem(li) ? fromUuidSync(li.dataset.uuid) : undefined);
  const getItem = async li => {
    if ( !isItem(li) ) return null;
    const item = await fromUuid(li.dataset.uuid);
    return item instanceof Item ? item : null;
  };
  const options = unownedItemOptions(entry, getItem);
  app._ngtContextMenu = new foundry.applications.ux.ContextMenu.implementation(element, "li.item[data-uuid]",
    options, { jQuery: false, fixed: true });
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
  Hooks.on("renderCompendiumBrowser", onRenderCompendiumBrowser);
}
