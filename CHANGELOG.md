# Changelog

All notable changes to this project will be documented in this file.

## [14.4.0] - 2026-11-13

### Added
- **Buying**: Right-click an item and choose "Buy…" to buy it for its price. Players can buy from any character, NPC or group whose sheet they can see (including other players' characters, who have to agree first), and copies of items from the Items sidebar, compendiums and the compendium browser. The buyer can be one of their characters or a group they belong to. Prices follow D&D 5e: Arrows listed at 1 gp for 20 cost 0.05 gp each. Unidentified items can't be bought by players. The money goes to the seller, change is made automatically, and a chat message tells the table who bought what for how much. A new setting controls where players can buy from.
- **Buying for the GM**: The GM can use "Buy…" on any item to run a sale between any two actors, change the price, and sell items that have no price.
- **Compendium Browser**: "Give to…" (GM) and "Buy…" now also work in D&D 5e's compendium browser.
- **Selling**: "Sell…" in the item menu of character and group sheets sells an item for half price, full price or a custom price. Half price is the default; gemstones, art objects, trade goods and treasure default to full price. The seller gets the money, and the item is kept in a new "Sold Items" world compendium, in a folder per seller. Players can't sell unidentified items. A new setting turns selling on or off for players.
- **Undo**: The GM gets an undo button on every transfer message. It puts items and money back where they came from, including refunds for purchases, and strikes the message through. It refuses if the item was used or passed on, or the money spent, in the meantime.

### Changed
- **Approval**: The GM approval mode now also covers purchases and sales.

## [14.3.0] - 2026-11-12

### Added
- **More Groups to Give To**: Besides the primary party, players can now give items and money to any other group one of their characters belongs to. Players don't see groups none of their characters are in.
- **Groups for the GM**: Every "Give to…" list the GM opens now includes all group actors in the world: handing out items from the Items sidebar or a compendium, giving items from any inventory (including from one group to another), dropping an item onto a group's token, and Give Money.

## [14.2.1] - 2026-11-12

### Changed
- **Compatibility**: Verified with D&D 5e 6.1. Nothing changes in how the module works.

## [14.2.0] - 2026-11-10

### Added
- **Hand Out Items**: GMs can right-click a physical item in the Items sidebar or in a compendium and choose "Give to…" to give a copy to the party, a party member or any player character, with a quantity of their choice.

## [14.1.0] - 2026-11-10

### Added
- **Nik's Tiny Change Logs**: Transfers no longer show up a second time as "added" and "deleted" lines in Tiny Change Logs (needs Tiny Change Logs 14.19.0 or newer).

### Changed
- **Chat Messages**: The GM now posts every transfer message, also when a player hands something between two of their own characters, so players can't edit or delete them.

### Fixed
- **Chat Messages**: Transfer messages show the giving character's name in the header again, instead of the GM's name, when that character has a token on the scene.

## [14.0.0] - 2026-11-10

### Added
- **Give Items**: Right-click an item in your inventory and choose "Give to…", or drag it onto another character's token. Pick who gets it and, for stacks, how many. You don't need to own the other character. Items arrive unequipped, containers go with their contents, consumables and loot stack onto the same item, and unidentified items stay unidentified.
- **Give Money**: "Give Money" in the sheet's header menu hands coins to another character or to the party.
- **Take from the Party**: Players who can see the party's group actor can take items ("Take…" in the item menu, or drag onto your token) and money ("Take Money" in the header menu) into their own character.
- **Approval**: Transfers happen right away by default. The GM can instead let the recipient's player accept or decline, or approve every transfer themselves. Requests without an answer close after a minute.
- **Chat Messages**: Every transfer posts a short chat message with a link to the item. It can be whispered to the players involved and the GM, or turned off.
- **Table Rules**: Optional settings for who players can give to (party members or all player characters), a maximum distance between the two tokens, and what happens during combat (allow, remind about the object interaction, or block).
