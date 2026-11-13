/**
 * Nik's Give & Take: entry point.
 */

import { MODULE_ID, QUERY, TEMPLATE_PATH } from "./constants.js";
import { openBuyDialog, openCurrencyDialog, openItemDialog, openSellDialog } from "./dialogs.js";
import { registerEntryPoints } from "./entry-points.js";
import { getTargets } from "./rules.js";
import { registerSettings } from "./settings.js";
import { registerUndo } from "./undo.js";
import {
  onBuyQuery, onMessageQuery, onOfferQuery, onSellQuery, onTransferQuery, requestPurchase, requestSale, requestTransfer
} from "./transfer.js";

Hooks.once("init", () => {
  registerSettings();
  CONFIG.queries[QUERY.transfer] = onTransferQuery;
  CONFIG.queries[QUERY.offer] = onOfferQuery;
  CONFIG.queries[QUERY.message] = onMessageQuery;
  CONFIG.queries[QUERY.buy] = onBuyQuery;
  CONFIG.queries[QUERY.sell] = onSellQuery;
  registerEntryPoints();
  registerUndo();
  foundry.applications.handlebars.loadTemplates([
    `${TEMPLATE_PATH}/targets.hbs`,
    `${TEMPLATE_PATH}/give-item.hbs`,
    `${TEMPLATE_PATH}/give-currency.hbs`,
    `${TEMPLATE_PATH}/buy-item.hbs`,
    `${TEMPLATE_PATH}/sell-item.hbs`,
    `${TEMPLATE_PATH}/offer.hbs`,
    `${TEMPLATE_PATH}/chat-card.hbs`
  ]);
});

Hooks.once("ready", () => {
  /**
   * Public API: `game.modules.get("niks-give-and-take").api`.
   * - `openItemDialog(item, {target})`: open the give / take dialog for an item.
   * - `openCurrencyDialog(actor, {target})`: open the give / take money dialog for an actor.
   * - `requestTransfer(request)`: transfer without a dialog (see the TransferRequest typedef in transfer.js).
   * - `openBuyDialog(item, {target})`: open the buy dialog for an item on an actor, in the sidebar or a compendium.
   * - `requestPurchase(request)`: buy without a dialog (see the PurchaseRequest typedef in transfer.js).
   * - `openSellDialog(item)`: open the sell dialog for an item of a character or group.
   * - `requestSale(request)`: sell without a dialog (see the SaleRequest typedef in transfer.js).
   * - `getTargets(actor, user)`: the actors a user may transfer to from this actor.
   * Hook `niks-give-and-take.transferred` ({kind, source, target, item, quantity, amounts, price, user}) fires on the
   * client that performed a transfer. Hook `niks-give-and-take.undone` ({message, transfer}) fires on the GM's client
   * after an undo.
   */
  game.modules.get(MODULE_ID).api = {
    openItemDialog, openCurrencyDialog, requestTransfer, openBuyDialog, requestPurchase, openSellDialog, requestSale,
    getTargets
  };
});
