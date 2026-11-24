# AfterStack

AfterStack is a browser-based card stack player and editor. Choices connect cards and can change named flags.

## Play in your browser

[Open the playable build](https://byungwoongyoo.github.io/afterstack/play/). No account or installation is required.

Choose **The Last Lighthouse**, select **Search the shore**, then click **Undo** to return to the opening card. The **Edit the stack** panel contains the card editor.

## Run a local build

Use Node.js 20 or later. From the repository root, run the tests and build the standalone page.

```sh
npm test
npm run build
```

Open `dist/AfterStack.html` in a modern browser.

The repository includes the [Kiro specs and implementation notes](.kiro/specs/afterstack) and the [MIT license](LICENSE).
