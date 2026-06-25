# auto-ez

<img width="348" height="114" alt="image" src="https://github.com/user-attachments/assets/4af5bfad-b4f0-4e5e-99aa-18f9f66eaa21" />
<img width="367" height="73" alt="image" src="https://github.com/user-attachments/assets/4806f6e9-f53a-4ab9-aadb-b08177cb6b01" />

Automatically taunt your lichess opponent when you win under certain conditions.

By default, sends `'ez'` in chat when you flag (win on time).

Configurable to send any message you like with configurable rules for each win (or loss) condition.

## Quick install (gist)

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).
2. Copy the contents of [`dist/auto-ez.user.js`](dist/auto-ez.user.js) into a new
   **public** [gist](https://gist.github.com/), naming the gist file
   `auto-ez.user.js`.
3. On the gist page, click **Raw**. The address bar will read something like
   `https://gist.githubusercontent.com/<user>/<id>/raw/auto-ez.user.js`.
4. Tampermonkey detects the `.user.js` suffix and opens its install page — click
   **Install**. (If it doesn't trigger automatically, paste that raw URL into a new
   tab.)

To update later, edit the gist and reopen the raw URL; Tampermonkey re-prompts when
the `@version` in the metadata block is bumped.

## Configuring rules

<img width="378" height="218" alt="image" src="https://github.com/user-attachments/assets/67204cf3-5b5b-4cf5-b305-b4c0c0e9b05b" />

Click the floating **`ez`** button (bottom-right of any lichess page) to open the
settings panel. There you can flip the master on/off switch, add or delete rules,
toggle each rule, edit its message, and set its **outcome** and **method** conditions
from dropdowns (`—` means "any"). 

Changes save automatically and apply to the next game.

## Development

```sh
bun test          # run tests
bun run build     # produce dist/auto-ez.user.js
```

See `docs/superpowers/specs/` for the design spec.
