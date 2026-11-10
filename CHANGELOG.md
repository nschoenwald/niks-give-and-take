# Changelog

All notable changes to this project will be documented in this file.

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
