# auto-ez

<img width="348" height="114" alt="image" src="https://github.com/user-attachments/assets/4af5bfad-b4f0-4e5e-99aa-18f9f66eaa21" />
<img width="367" height="73" alt="image" src="https://github.com/user-attachments/assets/4806f6e9-f53a-4ab9-aadb-b08177cb6b01" />

Automatically taunt your lichess opponent when you win under certain conditions.

By default, sends `'ez'` in chat when you flag (win on time).

Configurable to send any message you like with configurable rules for each win (or loss) condition.

## Quick install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).
2. Open the raw userscript URL:
   **[`raw.githubusercontent.com/zdavison/auto-ez/main/dist/auto-ez.user.js`](https://raw.githubusercontent.com/zdavison/auto-ez/main/dist/auto-ez.user.js)**.
   The `.user.js` suffix makes Tampermonkey/Violentmonkey open their install page —
   click **Install**.

That's it. Updates are automatic.

## Configuring rules

<img width="378" height="218" alt="image" src="https://github.com/user-attachments/assets/67204cf3-5b5b-4cf5-b305-b4c0c0e9b05b" />

Click the floating **`ez`** button (bottom-right of any lichess page) to open the
settings panel to modify rules.

Changes save automatically and apply to the next game.

## Development

```sh
bun test          # run tests
bun run build     # produce dist/auto-ez.user.js
```
