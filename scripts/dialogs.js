/**
 * The give / take dialogs for items and currency.
 */

import { TEMPLATE_PATH, t, tf } from "./constants.js";
import * as sys from "./dnd5e.js";
import { SALE_PRICE, canSellFrom, getBuyers, getGrantTargets, getTargets, isTake, sameActor } from "./rules.js";
import { requestGrant, requestPurchase, requestSale, requestTransfer } from "./transfer.js";

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
 * Open the dialog to give an item (or take it from a group). Items in the sidebar or a compendium open the GM's
 * dialog to hand out a copy instead.
 * @param {Item} item
 * @param {object} [options]
 * @param {Actor} [options.target]  Preselected recipient.
 * @returns {Promise<object|null>}  The transfer result, or null if cancelled.
 */
export async function openItemDialog(item, { target=null }={}) {
  if ( item && !item.parent ) return openGrantDialog(item, { target });
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
 * Open the GM's dialog to hand out a copy of a sidebar or compendium item.
 * @param {Item} item
 * @param {object} [options]
 * @param {Actor} [options.target]  Preselected recipient.
 * @returns {Promise<object|null>}  The result, or null if cancelled.
 */
async function openGrantDialog(item, { target=null }={}) {
  if ( !sys.isGrantable(item) ) return null;
  const targets = getGrantTargets();
  if ( !targets.length ) {
    ui.notifications.warn(t("Error.NoTargets"));
    return null;
  }

  const contents = await sys.countContents(item);
  const content = await renderTemplate(`${TEMPLATE_PATH}/give-item.hbs`, {
    item: { name: item.name, img: item.img, stack: null },
    contents: contents ? tf("Dialog.Contents", { count: contents }) : null,
    targets: prepareTargets(targets, target),
    targetLabel: t("Dialog.GiveTo"),
    quantity: contents ? null : { max: null, value: Math.max(1, sys.getQuantity(item)) }
  });

  const result = await DialogV2.wait({
    window: { title: tf("Dialog.GiveItemTitle", { name: item.name }), icon: "fa-solid fa-hand-holding-hand" },
    classes: ["ngt-dialog"],
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "confirm", label: t("Dialog.Give"), icon: "fa-solid fa-hand-holding-hand", default: true,
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

  const quantity = contents ? Math.max(1, sys.getQuantity(item)) : Math.round(Number(result.quantity));
  return requestGrant({ itemUuid: item.uuid, targetUuid: result.target, quantity });
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

/**
 * Keep the total of the buy dialog in step with the quantity and (for the GM) the price per item.
 * @param {HTMLElement} root
 * @param {string} denomination
 */
function syncTotal(root, denomination) {
  const form = root.querySelector(".ngt-buy");
  const total = form?.querySelector("[data-total]");
  if ( !total ) return;
  const update = () => {
    const quantityInput = form.querySelector("input[type=number][data-quantity]");
    const quantity = quantityInput ? Math.max(1, Math.round(Number(quantityInput.value)) || 1)
      : Number(form.dataset.fixedQuantity) || 1;
    // The field shows a rounded price; until the GM changes it, the exact price counts
    const priceInput = form.querySelector("input[data-unit-price]");
    const changed = priceInput && (Number(priceInput.value) !== Number(form.dataset.shownUnit));
    const unit = Math.max(0, Number(changed ? priceInput.value : form.dataset.unitPrice) || 0);
    total.textContent = sys.formatPrice({ value: unit * quantity, denomination });
  };
  form.addEventListener("input", update);
  update();
}

/**
 * Open the dialog to buy an item: from another actor, or a copy of a sidebar or compendium item. The buyer pays the
 * item's price (the GM can change it). Containers are bought with their contents, at their combined price.
 * @param {Item} item
 * @param {object} [options]
 * @param {Actor} [options.target]  Preselected buyer.
 * @returns {Promise<object|null>}  The result, or null if cancelled.
 */
export async function openBuyDialog(item, { target=null }={}) {
  const source = item?.parent instanceof Actor ? item.parent : null;
  if ( source ? !sys.isGiveable(item) : !sys.isGrantable(item) ) return null;
  const buyers = getBuyers(source);
  if ( !buyers.length ) {
    ui.notifications.warn(t("Error.NoBuyers"));
    return null;
  }

  const isGM = game.user.isGM;
  const contents = await sys.countContents(item);
  const max = source ? sys.getQuantity(item) : null;
  let fixedQuantity = null;
  if ( contents > 0 ) fixedQuantity = Math.max(1, sys.getQuantity(item));
  else if ( source && (max <= 1) ) fixedQuantity = max;
  const priceQuantity = fixedQuantity ?? 1;
  const total = await sys.getPrice(item, priceQuantity);
  const unit = { value: total.value / priceQuantity, denomination: total.denomination };
  if ( !isGM && sys.isUnidentified(item) ) {
    ui.notifications.warn(t("Error.Unidentified"));
    return null;
  }
  if ( !isGM && !(unit.value > 0) ) {
    ui.notifications.warn(t("Error.NoPrice"));
    return null;
  }

  const shownUnit = Math.round(unit.value * 100) / 100;
  const content = await renderTemplate(`${TEMPLATE_PATH}/buy-item.hbs`, {
    item: {
      name: item.name, img: item.img, stack: (max > 1) ? tf("Dialog.Owned", { quantity: max }) : null
    },
    seller: source ? tf("Dialog.SoldBy", { name: source.name }) : null,
    contents: contents ? tf("Dialog.Contents", { count: contents }) : null,
    targets: prepareTargets(buyers, target),
    targetLabel: t("Dialog.BuyFor"),
    fixedQuantity,
    // Sidebar and compendium items default to the bundle their price is for (Arrows: 20)
    quantity: fixedQuantity ? null : { max, value: source ? 1 : Math.max(1, sys.getQuantity(item)) },
    price: {
      label: t(fixedQuantity === 1 ? "Dialog.Price" : "Dialog.UnitPrice"),
      editable: isGM,
      unit: shownUnit,
      exact: unit.value,
      unitText: sys.formatPrice(unit),
      abbr: sys.denominationAbbr(unit.denomination),
      totalText: sys.formatPrice(total)
    }
  });

  const result = await DialogV2.wait({
    window: { title: tf("Dialog.BuyItemTitle", { name: item.name }), icon: "fa-solid fa-sack-dollar" },
    classes: ["ngt-dialog"],
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "confirm", label: t("Dialog.Buy"), icon: "fa-solid fa-sack-dollar", default: true,
        callback: (event, button) => readForm(button)
      },
      { action: "cancel", label: t("Dialog.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false,
    render: (event, dialog) => {
      syncQuantity(dialog.element);
      syncTotal(dialog.element, unit.denomination);
    }
  });
  if ( !result || (result === "cancel") ) return null;
  if ( !result.target ) {
    ui.notifications.warn(t("Error.PickBuyer"));
    return null;
  }

  const quantity = fixedQuantity ?? Math.round(Number(result.quantity));
  // Only send the GM's price when they changed it, so the rounded display value doesn't replace an exact price
  let unitPrice = null;
  if ( isGM && (result.unitPrice !== undefined) && (result.unitPrice !== null) && (result.unitPrice !== "")
    && (Number(result.unitPrice) !== shownUnit) ) unitPrice = Number(result.unitPrice);
  return requestPurchase({ itemUuid: item.uuid, targetUuid: result.target, quantity, unitPrice });
}

/**
 * Keep the half / full amounts of the sell dialog in step with the quantity; typing a custom price picks "custom".
 * @param {HTMLElement} root
 * @param {string} denomination
 */
function syncSale(root, denomination) {
  const form = root.querySelector(".ngt-sell");
  if ( !form ) return;
  const custom = form.querySelector("input[name=customPrice]");
  const update = () => {
    const quantityInput = form.querySelector("input[type=number][data-quantity]");
    const quantity = quantityInput ? Math.max(1, Math.round(Number(quantityInput.value)) || 1)
      : Number(form.dataset.fixedQuantity) || 1;
    const total = (Number(form.dataset.unitPrice) || 0) * quantity;
    for ( const amount of form.querySelectorAll("[data-factor]") ) {
      amount.textContent = sys.formatPrice({ value: total * Number(amount.dataset.factor), denomination });
    }
  };
  form.addEventListener("input", event => {
    if ( event.target === custom ) form.querySelector("input[name=priceMode][value=custom]").checked = true;
    update();
  });
  update();
}

/**
 * Open the dialog to sell an item of a character or group. The item goes into the "Sold Items" compendium and the
 * seller gets the money: half the price by default, full price for valuables, or a custom price. Containers are sold
 * with their contents.
 * @param {Item} item
 * @returns {Promise<object|null>}  The result, or null if cancelled.
 */
export async function openSellDialog(item) {
  const source = item?.parent instanceof Actor ? item.parent : null;
  if ( !source || !sys.isGiveable(item) || !canSellFrom(source) ) return null;
  const isGM = game.user.isGM;
  if ( !isGM && sys.isUnidentified(item) ) {
    ui.notifications.warn(t("Error.Unidentified"));
    return null;
  }

  const max = sys.getQuantity(item);
  const contents = await sys.countContents(item);
  const fixedQuantity = ((max <= 1) || (contents > 0)) ? max : null;
  const priceQuantity = fixedQuantity ?? max;
  const total = await sys.getPrice(item, priceQuantity);
  const unit = total.value / priceQuantity;
  const priced = unit > 0;
  let mode = SALE_PRICE.custom;
  if ( priced ) mode = sys.isValuable(item) ? SALE_PRICE.full : SALE_PRICE.half;
  const startValue = mode === SALE_PRICE.half ? total.value / 2 : total.value;

  const content = await renderTemplate(`${TEMPLATE_PATH}/sell-item.hbs`, {
    item: { name: item.name, img: item.img, stack: (max > 1) ? tf("Dialog.Owned", { quantity: max }) : null },
    contents: contents ? tf("Dialog.Contents", { count: contents }) : null,
    fixedQuantity,
    quantity: fixedQuantity ? null : { max, value: max },
    price: {
      exact: unit,
      abbr: sys.denominationAbbr(total.denomination),
      customValue: Math.round(startValue * 100) / 100
    },
    options: [
      { value: SALE_PRICE.half, label: t("Dialog.HalfPrice"), factor: 0.5, checked: mode === SALE_PRICE.half,
        disabled: !priced },
      { value: SALE_PRICE.full, label: t("Dialog.FullPrice"), factor: 1, checked: mode === SALE_PRICE.full,
        disabled: !priced },
      { value: SALE_PRICE.custom, label: t("Dialog.CustomPrice"), custom: true, checked: mode === SALE_PRICE.custom }
    ]
  });

  const result = await DialogV2.wait({
    window: { title: tf("Dialog.SellItemTitle", { name: item.name }), icon: "fa-solid fa-hand-holding-dollar" },
    classes: ["ngt-dialog"],
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "confirm", label: t("Dialog.Sell"), icon: "fa-solid fa-hand-holding-dollar", default: true,
        callback: (event, button) => readForm(button)
      },
      { action: "cancel", label: t("Dialog.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false,
    render: (event, dialog) => {
      syncQuantity(dialog.element);
      syncSale(dialog.element, total.denomination);
    }
  });
  if ( !result || (result === "cancel") ) return null;

  const priceMode = Object.values(SALE_PRICE).includes(result.priceMode) ? result.priceMode : mode;
  const customPrice = priceMode === SALE_PRICE.custom ? Number(result.customPrice) : null;
  if ( (priceMode === SALE_PRICE.custom) && !(Number.isFinite(customPrice) && (customPrice >= 0)) ) {
    ui.notifications.warn(t("Error.InvalidPrice"));
    return null;
  }
  return requestSale({
    itemUuid: item.uuid,
    quantity: fixedQuantity ?? Math.round(Number(result.quantity)),
    priceMode,
    customPrice
  });
}
