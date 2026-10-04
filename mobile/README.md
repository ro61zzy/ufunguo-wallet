# Ufunguo mobile

Bare React Native (TypeScript, no Expo) client for the Ufunguo regtest wallet. All Bitcoin logic runs in Rust; this app renders it and explains it.

See the repository [README](../README.md#mobile-app) for setup, [docs/mobile-architecture.md](../docs/mobile-architecture.md) for the design, and [docs/mobile-demo.md](../docs/mobile-demo.md) for the demo script.

```text
src/
├── api/          contract types, repository interface, HTTP + mock implementations
├── components/   design system primitives (Button, Card, Badge, ExplainCard, Timeline, …)
├── content/      Explain Mode copy
├── hooks/        TanStack Query hooks
├── navigation/   root stack, bottom tabs, deep links
├── screens/      one file per screen
├── state/        app settings (selected wallet, Explain Mode, data source)
└── theme/        design tokens
```

```bash
npm start          # Metro
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run lint
npm run typecheck
npm test -- --runInBand
```
