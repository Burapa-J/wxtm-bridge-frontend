# The Tari Bridge

## 🌉 What is the Tari Bridge? 
The Tari Bridge allows you to wrap your XTM from the Tari network into wXTM (Wrapped XTM) on Ethereum. It’s a one-way bridge currently available only inside the Tari Universe desktop app.

## 📖 User Guide & FAQ
If you want to learn more and get to know the Tari Bridge better, please **[visit our FAQ & User Guide website](https://tarilabs.notion.site/Tari-Universe-Bridge-x-User-Guide-FAQs-2014e6c995c38094b4e4e98a1a3e8ec1)**.

## Environment
See `.env.example`. `NEXT_PUBLIC_ALLOW_UNIVERSE_DEV_ORIGIN=true` lets a Tari Universe dev build (`pnpm tauri dev`, origin `http://localhost:1420`) frame the bridge; it is read at build time and must not be set for release builds.

## Contract addresses and ABIs

`contracts/abis.ts` and `contracts/deployments.json` are vendored from `tari-project/wxtm-bridge-contracts` (the source commit is recorded in both files). They are the trust anchor that backend chain parameters are checked against in `utils/bridge-route.ts`. To update them, compile the contracts repo and run:

```sh
(cd ../wxtm-bridge-contracts && npx hardhat compile)
node scripts/sync-contracts.mjs ../wxtm-bridge-contracts
```

Review the address diff against the contracts deployment record before committing.
