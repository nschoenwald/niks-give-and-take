/**
 * Shared constants and small helpers. No imports from other module files.
 */

export const MODULE_ID = "niks-give-and-take";

/** User queries (CONFIG.queries). Names are prefixed with the module id, as core requires. */
export const QUERY = {
  /** Player → active GM: perform a transfer the player can't perform themselves. */
  transfer: `${MODULE_ID}.transfer`,
  /** GM → recipient's player (or the GM's own client): accept or decline an offer. */
  offer: `${MODULE_ID}.offer`,
  /** Player → active GM: perform a purchase (the GM owns the seller and moves the money). */
  buy: `${MODULE_ID}.buy`,
  /** Player → active GM: perform a sale (only a GM can write to the "Sold Items" compendium). */
  sell: `${MODULE_ID}.sell`,
  /** Player → active GM: post the chat message of a transfer the player performed, so the GM authors it. */
  message: `${MODULE_ID}.message`
};

/**
 * Operation options added to every create, update and delete of a transfer. Nik's Tiny Change Logs skips these
 * operations, since the transfer posts its own message.
 */
export const OPERATION_OPTIONS = Object.freeze({ niksTinyChangelogs: Object.freeze({ skip: true }) });

/** How long a recipient or the GM has to answer an offer, in milliseconds. */
export const OFFER_TIMEOUT = 60_000;

/** Path prefix of the module's templates. */
export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates`;

/**
 * Localize a key below `NGT.`.
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  return game.i18n.localize(`NGT.${key}`);
}

/**
 * Localize and format a key below `NGT.`.
 * @param {string} key
 * @param {object} data
 * @returns {string}
 */
export function tf(key, data) {
  return game.i18n.format(`NGT.${key}`, data);
}

/**
 * Log to the console with the module prefix.
 * @param {...any} args
 */
export function log(...args) {
  console.log(`${MODULE_ID} |`, ...args);
}

/**
 * Log an error to the console with the module prefix.
 * @param {...any} args
 */
export function logError(...args) {
  console.error(`${MODULE_ID} |`, ...args);
}
