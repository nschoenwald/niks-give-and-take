/**
 * Nik's Give & Take: entry point.
 */

import { MODULE_ID, QUERY, TEMPLATE_PATH } from "./constants.js";
import { openCurrencyDialog, openItemDialog } from "./dialogs.js";
import { registerEntryPoints } from "./entry-points.js";
import { getTargets } from "./rules.js";
import { registerSettings } from "./settings.js";
import { onOfferQuery, onTransferQuery, requestTransfer } from "./transfer.js";

Hooks.once("init", () => {
  registerSettings();
  CONFIG.queries[QUERY.transfer] = onTransferQuery;
  CONFIG.queries[QUERY.offer] = onOfferQuery;
  registerEntryPoints();
  foundry.applications.handlebars.loadTemplates([
    `${TEMPLATE_PATH}/targets.hbs`,
    `${TEMPLATE_PATH}/give-item.hbs`,
    `${TEMPLATE_PATH}/give-currency.hbs`,
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
   * - `getTargets(actor, user)`: the actors a user may transfer to from this actor.
   * Hook `niks-give-and-take.transferred` ({kind, source, target, item, quantity, amounts, user}) fires on the client
   * that performed a transfer.
   */
  game.modules.get(MODULE_ID).api = { openItemDialog, openCurrencyDialog, requestTransfer, getTargets };
});
