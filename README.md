# binnacle

A terminal surface for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh), mounted as a profile bundle and drawn with [pi-tui](https://github.com/earendil-works/pi).

What is on screen says what can be done with it. A long command that was cut can be expanded; one that fits offers nothing, and no key or click reaches it. One table gives every gesture its meaning, so every screen answers the same way. A dsh preset can run a different tool loop, and an agent can draw what it logs with the same components this surface is built from.

How it is built is [the architecture](docs/architecture.md), and why is [the decision records](docs/adr/). Nothing runs yet.

## Working here

```sh
pnpm install && pnpm refs   # install, and fetch the repositories binnacle is read against
pnpm test                   # every gate and every test
pnpm build && pnpm dsh:profile  # build the bundle and create the `binnacle` dsh profile
dsh --profile binnacle      # run it, under the dsh launcher at the release references.json pins
```

Agents start at [`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE)
