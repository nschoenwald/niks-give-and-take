/**
 * Settings, registered in Foundry's own settings window (not in the Nik's Tweaks dashboard).
 */

import { MODULE_ID } from "./constants.js";

/** Approval modes for giving to another character. */
export const APPROVAL = { instant: "instant", recipient: "recipient", gm: "gm" };

/** Which characters a player may give to (the party actor is always a target when there is one). */
export const TARGETS = { party: "party", players: "players" };

/** Behaviour during combat for transfers between characters. */
export const COMBAT = { allow: "allow", remind: "remind", block: "block" };

/** Where players may buy from. The GM can always buy. */
export const BUY = { off: "off", actors: "actors", all: "all" };

/** Who sees the chat message about a transfer. */
export const CHAT = { public: "public", whisper: "whisper", off: "off" };

/**
 * Read a setting of this module.
 * @param {string} key
 * @returns {*}
 */
export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * Register the settings. Called in `init`.
 */
export function registerSettings() {
  const choices = (prefix, values) => Object.fromEntries(
    Object.values(values).map(v => [v, `NGT.Settings.${prefix}.Choices.${v}`])
  );

  game.settings.register(MODULE_ID, "approvalMode", {
    name: "NGT.Settings.ApprovalMode.Name",
    hint: "NGT.Settings.ApprovalMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: choices("ApprovalMode", APPROVAL),
    default: APPROVAL.instant
  });

  game.settings.register(MODULE_ID, "giveTargets", {
    name: "NGT.Settings.GiveTargets.Name",
    hint: "NGT.Settings.GiveTargets.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: choices("GiveTargets", TARGETS),
    default: TARGETS.party
  });

  game.settings.register(MODULE_ID, "allowTake", {
    name: "NGT.Settings.AllowTake.Name",
    hint: "NGT.Settings.AllowTake.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "allowCurrency", {
    name: "NGT.Settings.AllowCurrency.Name",
    hint: "NGT.Settings.AllowCurrency.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "buying", {
    name: "NGT.Settings.Buying.Name",
    hint: "NGT.Settings.Buying.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: choices("Buying", BUY),
    default: BUY.all
  });

  game.settings.register(MODULE_ID, "allowSelling", {
    name: "NGT.Settings.AllowSelling.Name",
    hint: "NGT.Settings.AllowSelling.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "maxDistance", {
    name: "NGT.Settings.MaxDistance.Name",
    hint: "NGT.Settings.MaxDistance.Hint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.NumberField({ min: 0, step: 1, initial: 0, nullable: false }),
    default: 0
  });

  game.settings.register(MODULE_ID, "combatRule", {
    name: "NGT.Settings.CombatRule.Name",
    hint: "NGT.Settings.CombatRule.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: choices("CombatRule", COMBAT),
    default: COMBAT.allow
  });

  game.settings.register(MODULE_ID, "chatMessages", {
    name: "NGT.Settings.ChatMessages.Name",
    hint: "NGT.Settings.ChatMessages.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: choices("ChatMessages", CHAT),
    default: CHAT.public
  });

  game.settings.register(MODULE_ID, "tokenDrop", {
    name: "NGT.Settings.TokenDrop.Name",
    hint: "NGT.Settings.TokenDrop.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
}
