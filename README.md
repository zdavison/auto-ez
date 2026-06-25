# auto-bm

A userscript for [lichess.org](https://lichess.org) that automatically sends a chat
message when a game ends and a configured rule matches.

Out of the box: when you **win a real-time game on time** (your opponent flags), it
says **`ez`** in chat.

> ⚠️ Taunting can be reported on lichess. Use responsibly. There's a master on/off
> toggle in the Tampermonkey menu and a per-rule `enabled` flag.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).
2. Build the script: `bun install && bun run build`.
3. Open `dist/auto-bm.user.js` and install it into your userscript manager
   (Tampermonkey → *Create a new script* → paste, or drag the file in).

## How it works

| Stage     | What happens                                                                 |
| --------- | ---------------------------------------------------------------------------- |
| Detect    | Hooks the round WebSocket, reads the `endData` frame (status + winner).       |
| Scope     | Only acts in real-time games vs a human that **you** are playing.             |
| Match     | Evaluates your rules, most-specific-first; the first full match wins.         |
| Gate      | One message per game; global + optional per-rule cooldown.                    |
| Send      | Types the message into the chat input after a short randomized delay.         |

## Configuring rules

Click the floating **`ez`** button (bottom-right of any lichess page) to open the
settings panel. There you can flip the master on/off switch, add or delete rules,
toggle each rule, edit its message, and set its **outcome** and **method** conditions
from dropdowns (`—` means "any"). Changes save automatically and apply to the next
game — no reload.

Under the hood, rules live in storage as JSON (key `auto-bm:config`). A rule is:

```jsonc
{
  "id": "ez-on-flag",
  "enabled": true,
  "order": 0,
  "when": [
    { "type": "outcome", "value": "win" },      // win | loss | draw
    { "type": "method",  "value": "outoftime" } // mate | resign | outoftime | ...
  ],
  "message": "ez"
}
```

Rules are ranked by **number of conditions** (more = more specific), then by
**property priority** (e.g. `country` > `username` > `material` > `method` >
`outcome`), then by `order`. The first rule whose conditions all match sends its
message. More condition types (country, username, material advantage) are planned;
the engine accepts them without changes.

## Development

```sh
bun test          # run tests
bun run build     # produce dist/auto-bm.user.js
```

See `docs/superpowers/specs/` for the design spec.
