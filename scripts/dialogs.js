/**
 * The give / take dialogs for items and currency.
 */

import { TEMPLATE_PATH, t, tf } from "./constants.js";
import * as sys from "./dnd5e.js";
import { getTargets, isTake, sameActor } from "./rules.js";
import { requestTransfer } from "./transfer.js";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/**
 * Target entries for the template.
 * @param {Actor[]} targets
 * @param {Actor|null} preset  Target to select (e.g. the token an item was dropped on).
 * @returns {object[]}
 */
function prepareTargets(targets, preset) {
  const selected = targets.find(a => preset && sameActor(a, preset)) ?? (targets.length === 1 ? targets[0] : null);
  return targets.map(actor => ({
    uuid: actor.uuid,
    name: actor.name,
    img: actor.img,
    group: sys.isGroup(actor),
    checked: actor === selected
  }));
}

/**
 * Keep the range and number inputs of the quantity row in sync.
 * @param {HTMLElement} root
 */
function syncQuantity(root) {
  const range = root.querySelector("input[type=range][data-quantity]");
  const number = root.querySelector("input[type=number][data-quantity]");
  if ( !range || !number ) return;
  range.addEventListener("input", () => number.value = range.value);
  number.addEventListener("input", () => {
    const value = Math.clamp(Number(number.value) || 1, Number(number.min), Number(number.max));
    range.value = value;
  });
}

/**
 * Read the dialog's form.
 * @param {HTMLButtonElement} button
 * @returns {object}
 */
function readForm(button) {
  return new foundry.applications.ux.FormDataExtended(button.form).object;
}

/**
 * Open the dialog to give an item (or take it from a group).
 * @param {Item} item
 * @param {object} [options]
 * @param {Actor} [options.target]  Preselected recipient.
 * @returns {Promise<object|null>}  The transfer result, or null if cancelled.
 */
export async function openItemDialog(item, { target=null }={}) {
  const source = item?.actor;
  if ( !source || !sys.isGiveable(item) ) return null;
  const targets = getTargets(source);
  if ( !targets.length ) {
    ui.notifications.warn(t("Error.NoTargets"));
    return null;
  }

  const take = isTake(source);
  const max = sys.getQuantity(item);
  const contents = await sys.countContents(item);
  const fixedQuantity = (max <= 1) || (contents > 0);
  const content = await renderTemplate(`${TEMPLATE_PATH}/give-item.hbs`, {
    item: { name: item.name, img: item.img, stack: max > 1 ? tf("Dialog.Owned", { quantity: max }) : null },
    contents: contents ? tf("Dialog.Contents", { count: contents }) : null,
    targets: prepareTargets(targets, target),
    targetLabel: t(take ? "Dialog.TakeFor" : "Dialog.GiveTo"),
    quantity: fixedQuantity ? null : { max, value: max }
  });

  const verb = take ? "Take" : "Give";
  const result = await DialogV2.wait({
    window: { title: tf(`Dialog.${verb}ItemTitle`, { name: item.name }), icon: "fa-solid fa-hand-holding-hand" },
    classes: ["ngt-dialog"],
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "confirm", label: t(`Dialog.${verb}`), icon: "fa-solid fa-hand-holding-hand", default: true,
        callback: (event, button) => readForm(button)
      },
      { action: "cancel", label: t("Dialog.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false,
    render: (event, dialog) => syncQuantity(dialog.element)
  });
  if ( !result || (result === "cancel") ) return null;
  if ( !result.target ) {
    ui.notifications.warn(t("Error.PickTarget"));
    return null;
  }

  return requestTransfer({
    kind: "item",
    sourceUuid: source.uuid,
    targetUuid: result.target,
    itemId: item.id,
    quantity: fixedQuantity ? max : Math.round(Number(result.quantity))
  });
}

/**
 * Open the dialog to give currency (or take it from a group).
 * @param {Actor} source
 * @param {object} [options]
 * @param {Actor} [options.target]  Preselected recipient.
 * @returns {Promise<object|null>}  The transfer result, or null if cancelled.
 */
export async function openCurrencyDialog(source, { target=null }={}) {
  if ( !sys.hasCurrency(source) ) return null;
  const targets = getTargets(source).filter(a => sys.hasCurrency(a));
  if ( !targets.length ) {
    ui.notifications.warn(t("Error.NoTargets"));
    return null;
  }

  const take = isTake(source);
  const have = sys.getCurrency(source);
  if ( !Object.values(have).some(v => v > 0) ) {
    ui.notifications.warn(tf("Error.NoMoney", { name: source.name }));
    return null;
  }
  const content = await renderTemplate(`${TEMPLATE_PATH}/give-currency.hbs`, {
    source: { name: source.name, img: source.img },
    available: t("Dialog.Available"),
    denominations: sys.getDenominations().map(d => ({ ...d, max: have[d.key], disabled: !have[d.key] })),
    targets: prepareTargets(targets, target),
    targetLabel: t(take ? "Dialog.TakeFor" : "Dialog.GiveTo")
  });

  const verb = take ? "Take" : "Give";
  const result = await DialogV2.wait({
    window: { title: tf(`Dialog.${verb}CurrencyTitle`, { name: source.name }), icon: "fa-solid fa-coins" },
    classes: ["ngt-dialog"],
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "confirm", label: t(`Dialog.${verb}`), icon: "fa-solid fa-coins", default: true,
        callback: (event, button) => readForm(button)
      },
      { action: "cancel", label: t("Dialog.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !result || (result === "cancel") ) return null;
  if ( !result.target ) {
    ui.notifications.warn(t("Error.PickTarget"));
    return null;
  }

  const amounts = {};
  for ( const { key } of sys.getDenominations() ) {
    const value = Math.round(Number(result[`amount.${key}`] ?? result.amount?.[key]) || 0);
    if ( value > 0 ) amounts[key] = value;
  }
  if ( !Object.keys(amounts).length ) {
    ui.notifications.warn(t("Error.InvalidAmount"));
    return null;
  }

  return requestTransfer({ kind: "currency", sourceUuid: source.uuid, targetUuid: result.target, amounts });
}
