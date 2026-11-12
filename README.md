# Nik's Give & Take

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-V14-orange.svg)](https://foundryvtt.com)
[![D&D 5e](https://img.shields.io/badge/D%26D%205e-6.0.6%2B-red.svg)](https://github.com/foundryvtt/dnd5e)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/nschoenwald/niks-give-and-take?color=purple)](https://github.com/nschoenwald/niks-give-and-take/releases/latest)

Lets players hand items and money to other characters and to the party, and take them from the party's shared stash, for **Foundry VTT (v14)** and **D&D 5e**. Players don't need to own the other character: the GM's client does the transfer in the background.

---

> [!NOTE]
> Moving items between actors needs a **GM to be online**, unless the player owns both characters. Players need the **Query Users** permission, which Foundry gives to every player role by default.

---

## ⚡ Quick Navigation

- [🎒 Giving Items](#-giving-items)
- [🎁 Handing Out Items (GM)](#-handing-out-items-gm)
- [💰 Giving Money](#-giving-money)
- [🏕️ Taking from the Party](#️-taking-from-the-party)
- [✅ Approval](#-approval)
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

The GM can hand out loot straight from the **Items sidebar** or an **item compendium**: right-click a physical item and choose **Give to…**. Pick the recipient (any group actor in the world, the party's members or any player character) and how many. The recipient gets a copy; the item in the sidebar or compendium stays where it is. The copy stacks onto a matching item the recipient already has, containers come with their contents, and the chat message reads e.g. *"Bren received 3× Potion of Healing."*

Players don't see this option, since it creates new items.

## 💰 Giving Money

Open the sheet's header menu (the **⋮** button) and choose **Give Money**. Enter how much of each coin to hand over, from what the character has, and pick the recipient.

## 🏕️ Taking from the Party

Players who can see the party's group actor (at least **Observer** access) can take from its stash into a character they own:

- **Items**: right-click an item on the group sheet and choose **Take…**, or drag it onto your own token.
- **Money**: choose **Take Money** in the group sheet's header menu.

Giving to the party works like giving to a character: it's always in the recipient list. Neither giving to the party nor taking from it waits for another player's answer.

## ✅ Approval

The GM picks who has to agree before something changes hands between two characters:

| Mode | What happens |
|---|---|
| **Nobody** (default) | Transfers happen right away. |
| **The recipient's player** | The recipient's player gets a dialog to accept or decline. If they're offline, the GM answers instead. Giving to a character you own yourself needs no answer. |
| **The GM** | The GM accepts or declines every give and take by a player. |

Unanswered requests close after a minute, and nothing is transferred. The GM never needs approval.

## ⚙️ Settings

All settings are in Foundry's **Configure Settings** window, under **Nik's Give & Take**.

| Setting | Default | What it does |
|---|---|---|
| **Approval** | Nobody | See [Approval](#-approval). |
| **Players Can Give To** | Members of the primary party | Or all player characters and party members. Without a primary party, players can give to all player characters. |
| **Taking from the Party** | On | Players can take items and money from a group actor they can see. |
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
| `getTargets(actor, user)` | The actors a user may transfer to from this actor. |

The hook `niks-give-and-take.transferred` fires on the client that performed a transfer, with `{kind, source, target, item, quantity, amounts, user}`. `item` is the item on the recipient. `kind` is `"item"`, `"currency"` or `"grant"` (a GM handed out a sidebar or compendium item; `source` is `null`).

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
