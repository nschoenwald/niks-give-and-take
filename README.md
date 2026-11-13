# Nik's Give & Take

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-V14-orange.svg)](https://foundryvtt.com)
[![D&D 5e](https://img.shields.io/badge/D%26D%205e-6.0.6%2B-red.svg)](https://github.com/foundryvtt/dnd5e)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/nschoenwald/niks-give-and-take?color=purple)](https://github.com/nschoenwald/niks-give-and-take/releases/latest)

Lets players hand items and money to other characters and to the party, take them from the party's shared stash, buy items for their price and sell loot, for **Foundry VTT (v14)** and **D&D 5e**. Players don't need to own the other character: the GM's client does the transfer in the background.

---

> [!NOTE]
> Moving items between actors needs a **GM to be online**, unless the player owns both characters. Players need the **Query Users** permission, which Foundry gives to every player role by default.

---

## ⚡ Quick Navigation

- [🎒 Giving Items](#-giving-items)
- [🎁 Handing Out Items (GM)](#-handing-out-items-gm)
- [💰 Giving Money](#-giving-money)
- [🏕️ Taking from the Party](#️-taking-from-the-party)
- [🛒 Buying](#-buying)
- [🪙 Selling](#-selling)
- [✅ Approval](#-approval)
- [↩️ Undo (GM)](#️-undo-gm)
- [⚙️ Settings](#️-settings)
- [🧩 For Module Developers](#-for-module-developers)
- [📦 Installation](#-installation)
- [❤️ Modules by Nik](#️-modules-by-nik)

---

## 🎒 Giving Items

There are two ways to give an item:

- **Context menu**: right-click an item in the inventory and choose **Give to…**.
- **Drop onto a token**: drag an item from your sheet onto another character's token on the canvas. The give dialog opens with that character already selected. Players can turn this off for themselves.

The dialog lists everyone you can give to: the primary party actor and the party's members (or all player characters, if the GM sets it that way). Any other group one of your characters belongs to is listed too. The GM sees every group actor in the world. For stacks, a slider picks how many change hands; the rest stays with you.

What happens to the item:

- Only physical items can be given: weapons, equipment, consumables, tools, loot and containers. Spells, features and classes can't.
- It arrives unequipped and unattuned. If it was inside a bag, it leaves the bag.
- A **container** goes with everything inside it.
- **Consumables and loot stack**: if the recipient already has the same item, the quantity is added to it instead of creating a second entry.
- **Unidentified** items stay unidentified, and their real name doesn't show up in the dialog or the chat message.
- The item's own effects (e.g. a magic item's bonuses) travel with it.

A chat message tells the table what happened, e.g. *"Aria gave 3× Potion of Healing to Bren."* The item in the message is a link. The GM posts these messages, so players can't edit or delete them (without a GM online, the player's own client posts it).

With **[Nik's Tiny Change Logs](https://github.com/nschoenwald/niks-tiny-changelogs)** 14.19.0 or newer, a transfer doesn't also show up there as an "added" and a "deleted" line.

## 🎁 Handing Out Items (GM)

The GM can hand out loot straight from the **Items sidebar**, an **item compendium** or D&D 5e's **compendium browser**: right-click a physical item and choose **Give to…**. Pick the recipient (any group actor in the world, the party's members or any player character) and how many. The recipient gets a copy; the item in the sidebar or compendium stays where it is. The copy stacks onto a matching item the recipient already has, containers come with their contents, and the chat message reads e.g. *"Bren received 3× Potion of Healing."*

Players don't see this option, since it creates new items.

## 💰 Giving Money

Open the sheet's header menu (the **⋮** button) and choose **Give Money**. Enter how much of each coin to hand over, from what the character has, and pick the recipient.

## 🏕️ Taking from the Party

Players who can see the party's group actor (at least **Observer** access) can take from its stash into a character they own:

- **Items**: right-click an item on the group sheet and choose **Take…**, or drag it onto your own token.
- **Money**: choose **Take Money** in the group sheet's header menu.

Giving to the party works like giving to a character: it's always in the recipient list. Neither giving to the party nor taking from it waits for another player's answer.

## 🛒 Buying

Right-click an item and choose **Buy…** to buy it for its price. This works on:

- **Other actors' sheets**: any character, NPC or group whose sheet you can see (at least **Observer** access) but don't own, including other players' characters. The item moves to the buyer and the money goes to the seller.
- **The Items sidebar, item compendiums and D&D 5e's compendium browser**: the buyer gets a copy and the money is simply spent.

Pick who buys it (one of your characters, or a group one of your characters belongs to, which then pays from its own funds) and, for stacks, how many. The dialog shows the price per item and the total. Players can't buy unidentified items or items without a price, and don't see Buy… on them.

How the price is worked out: like in D&D 5e, an item's **Price** is for the item as listed, not for each one. *Arrows* with a quantity of 20 and a price of 1 gp cost 0.05 gp each.

- **Sidebar and compendium items**: the price is for their own quantity, and the dialog starts with that many (20 arrows for 1 gp). You can buy more or fewer.
- **Items on a sheet**: the price is for the quantity of the sidebar or compendium item they came from, so a merchant's 60 arrows still sell for 0.05 gp each. Items that didn't come from one are priced per item.
- **Containers** cost their own price plus everything inside them.

The buyer pays from their coins and gets change, the way D&D 5e's own currency handling does it (paying 5 sp with only gold takes 1 gp and gives 5 sp back). If they can't afford it, nothing happens. The seller receives the price in the item's own coin, or in smaller coins for fractions (0.5 gp → 5 sp). The chat message reads e.g. *"Bren bought 2× Potion of Healing from Mira the Merchant for 100 gp."*

- **Buying from another player's character** always needs that player's OK (the GM answers when they're offline).
- In the **GM approval** mode the GM approves every purchase. Otherwise purchases from NPCs, groups, the sidebar and compendiums happen right away.
- The **distance** and **combat** rules apply between two characters as they do for giving.

**For the GM**: Buy… is on every item, also on players' own sheets, so the GM can run a sale between any two actors. The GM's list of buyers holds the party, its members, all player characters, every group and every actor with a token on the current scene. The GM can change the price per item in the dialog (for haggling or discounts), and can sell items without a price.

## 🪙 Selling

Selling is for player characters and the party: right-click an item on a character or group sheet and choose **Sell…**. Players can sell from their own characters, and from groups one of their characters belongs to when **Taking from the Party** is on.

Pick how many (for stacks) and the price:

- **Half price** (default): half of what the item is worth, worked out the same way as for buying (per item, containers with their contents).
- **Full price**: the default for **gemstones, art objects, trade goods and treasure** (loot of those kinds).
- **Custom price**: any total.

The seller gets the money and the item is gone from the sheet. It isn't lost: a copy goes into the **Sold Items** world compendium, in a folder named after the seller, so the GM can see what was sold and bring it back. The compendium is created on the first sale. The chat message reads e.g. *"Aria sold Silver Ring for 12.5 gp."* and links to the copy in the compendium.

Players can't sell unidentified items. In the **GM approval** mode the GM approves every sale. The GM can undo a sale like any other transfer: the item returns, the money is taken back and the compendium copy is removed.

## ✅ Approval

The GM picks who has to agree before something changes hands between two characters:

| Mode | What happens |
|---|---|
| **Nobody** (default) | Transfers happen right away. |
| **The recipient's player** | The recipient's player gets a dialog to accept or decline. If they're offline, the GM answers instead. Giving to a character you own yourself needs no answer. |
| **The GM** | The GM accepts or declines every give, take, purchase and sale by a player. |

Unanswered requests close after a minute, and nothing is transferred. The GM never needs approval.

## ↩️ Undo (GM)

Every transfer's chat message has a small **undo** button (↺) that only the GM sees. It works for giving, taking, money, handed-out items and purchases. After a confirmation, everything goes back:

- The item returns to where it came from (to the same stack if part of a stack moved, or as it was, with its contents, if all of it moved). Handed-out and bought copies from the sidebar or a compendium are simply removed, and a sold item's copy is removed from the Sold Items compendium.
- Money goes back too: a purchase refunds the buyer exactly (including taking back the change) and takes the price back from the seller.
- The message stays in the log, struck through, with *"Undone by …"*.

Undo is refused, and nothing changes, if things have moved on since: the recipient no longer has all of the item (used, passed on or sold), or someone no longer has the money. Approval, distance and combat rules don't apply to an undo. Transfers made with chat messages turned off, or before version 14.4.0, can't be undone.

## ⚙️ Settings

All settings are in Foundry's **Configure Settings** window, under **Nik's Give & Take**.

| Setting | Default | What it does |
|---|---|---|
| **Approval** | Nobody | See [Approval](#-approval). |
| **Players Can Give To** | Members of the primary party | Or all player characters and party members. Without a primary party, players can give to all player characters. |
| **Taking from the Party** | On | Players can take items and money from a group actor they can see. |
| **Selling** | On | Players can sell items of their characters (and of their groups, if taking from the party is on). |
| **Buying** | Also from the Items sidebar and compendiums | Where players can buy: off, from characters, NPCs and groups only, or also copies from the Items sidebar and compendiums. The GM can always buy. |
| **Money Transfers** | On | Turns giving and taking money on or off. |
| **Maximum Distance** | 0 (off) | How close two characters' tokens must be on the current scene, in grid units. Doesn't apply to the party actor or to the GM. |
| **During Combat** | Allow | Or allow with a reminder in the chat message that handing over an item uses the object interaction, or block transfers while one of the two characters is in combat. Doesn't apply to the party actor or to the GM. |
| **Chat Messages** | Everyone sees them | Or only the players involved and the GM, or off. With messages off, the player who asked gets a notification instead. |
| **Give by Dropping onto a Token** | On (per player) | Each player can turn off the token drop for themselves. |

## 🧩 For Module Developers

The API is available at `game.modules.get("niks-give-and-take").api` once the `ready` hook has fired:

| Function | Description |
|---|---|
| `openItemDialog(item, {target})` | Opens the give (or take) dialog for an owned item, or the GM's hand-out dialog for a sidebar or compendium item. `target` preselects a recipient actor. |
| `openCurrencyDialog(actor, {target})` | Opens the give (or take) money dialog for an actor. |
| `requestTransfer(request)` | Transfers without a dialog, with the same checks and approval. `request`: `{kind: "item", sourceUuid, targetUuid, itemId, quantity}` or `{kind: "currency", sourceUuid, targetUuid, amounts: {gp: 5}}`. Resolves to `{status: "done" \| "declined" \| "expired" \| "error"}`. |
| `openBuyDialog(item, {target})` | Opens the buy dialog for an item on an actor, in the sidebar or in a compendium. `target` preselects the buyer. |
| `requestPurchase(request)` | Buys without a dialog, with the same checks and approval. `request`: `{itemUuid, targetUuid, quantity, unitPrice}`; `unitPrice` (per item, in the item's denomination) is only used for the GM. Resolves like `requestTransfer`. |
| `openSellDialog(item)` | Opens the sell dialog for an item of a character or group. |
| `requestSale(request)` | Sells without a dialog, with the same checks and approval. `request`: `{itemUuid, quantity, priceMode: "half" \| "full" \| "custom", customPrice}`; `customPrice` is the total, in the item's denomination. |
| `getTargets(actor, user)` | The actors a user may transfer to from this actor. |

The hook `niks-give-and-take.undone` fires on the GM's client after an undo, with `{message, transfer}` (`transfer` is the message's `flags["niks-give-and-take"].transfer`).

The hook `niks-give-and-take.transferred` fires on the client that performed a transfer, with `{kind, source, target, item, quantity, amounts, price, user}`. `item` is the item on the recipient. `kind` is `"item"`, `"currency"`, `"grant"` (a GM handed out a sidebar or compendium item; `source` is `null`) `"buy"` (`target` bought the item from `source`, or from the sidebar or a compendium when `source` is `null`; `price` is `{value, denomination}`) or `"sell"` (`source` sold the item; `target` is `null`, `item` is the copy in the Sold Items compendium).

## 📦 Installation

### Via Foundry VTT Package Browser
1. In the Foundry setup menu, navigate to **Add-on Modules** > **Install Module**.
2. Search for **Nik's Give & Take**.
3. Click **Install**.

### Via Manifest URL
Paste the following manifest URL into Foundry's **Manifest URL** field:
```
https://github.com/nschoenwald/niks-give-and-take/releases/latest/download/module.json
```

## ❤️ Modules by Nik

### 🧩 Nik's Tweaks
* **[Nik's Foundry Tweaks](https://github.com/nschoenwald/niks-foundry-tweaks)** – System-independent quality-of-life tweaks and the shared settings dashboard of Nik's Tweaks modules.

### 🎲 D&D 5e Specific
* **[Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks)** – Consolidated collection of quality-of-life enhancements and combat automation tweaks for DnD5e.
* **[Nik's Give & Take](https://github.com/nschoenwald/niks-give-and-take)** – Players hand items and money to other characters and the party, and take them from the party's stash.

### ⚔️ Combat & Token Tools
* **[Nik's Action HUD](https://github.com/nschoenwald/niks-action-hud)** – Sleek, modern canvas-docked Action HUD for quick access to attacks, spells, inventory, and utility rolls.
* **[Nik's Effects Panel](https://github.com/nschoenwald/niks-effects-panel)** – Floating panel next to the sidebar that shows the selected token's active effects, to check, disable or remove them without opening the character sheet.
* **[Nik's Token Tags](https://github.com/nschoenwald/niks-token-tags)** – Automatically numbers duplicate combatant NPCs (A, B, C…) with color-coded letter overlays.
* **[Nik's Shared NPC Initiative](https://github.com/nschoenwald/niks-shared-npc-initiative)** – Groups NPCs of the same type in combat so they share a single initiative roll.
* **[Nik's Movement Control](https://github.com/nschoenwald/niks-movement-control)** – GM controls to toggle player movement and automatically restrict/allow movement on combat start and end.
* **[Nik's Token Motion](https://github.com/nschoenwald/niks-token-motion)** – Tokens hop square by square like miniatures, lift and set down like chess pieces, or glide smoothly, and long moves no longer crawl across the map.
* **[Nik's Tiny Change Logs](https://github.com/nschoenwald/niks-tiny-changelogs)** – Compact, single-line chat messages logging token HP and Temp HP changes.

### 🎨 Visuals & Display
* **[Nik's Dynamic Roll Area](https://github.com/nschoenwald/niks-dynamic-roll-area)** – Dynamically restricts Dice So Nice 3D dice rolling area to exclude the sidebar / chat log across all screen resolutions and window sizes.

### ⚙️ Utilities & System Management
* **[Nik's Settings Locks](https://github.com/nschoenwald/niks-settings-locks)** – Soft-lock and hard-lock client settings and keybindings across all connected players.
* **[Nik's Compendium Search Tweaks](https://github.com/nschoenwald/niks-compendium-search-tweaks)** – Configure which compendium packs are included or excluded from native sidebar search.
* **[Nik's Copy Environment](https://github.com/nschoenwald/niks-copy-environment)** – Copy the list of systems, modules, and versions, and export/import game and player settings.
* **[Nik's Show & Tell](https://github.com/nschoenwald/niks-show-and-tell)** – Share popout images to chat and paste image files directly into chat messages.
* **[Nik's Zoom / Pan Options](https://github.com/nschoenwald/niks-zoom-pan-options)** – Touchpad and scroll wheel pan/zoom controls and canvas navigation enhancements.
* **[Nik's Scene Transformations](https://github.com/nschoenwald/niks-scene-transformations)** – Rotate scenes or add playable space around them, with tokens, walls, lights, tiles and regions moved along so everything stays in place.
* **[Nik's Wall Height](https://github.com/nschoenwald/niks-wall-height)** – Give walls a bottom and top elevation, so tokens, lights and sounds above or below a wall ignore it.
* **[Nik's Scene Defaults](https://github.com/nschoenwald/niks-scene-defaults)** – Set your own defaults for new scenes (grid, vision, fog, lighting, background and more), so you don't have to change them on every scene.
