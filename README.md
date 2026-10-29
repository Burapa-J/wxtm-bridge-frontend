# The Tari Bridge

## 🌉 What is the Tari Bridge? 
The Tari Bridge allows you to wrap your XTM from the Tari network into wXTM (Wrapped XTM) on Ethereum. It’s a one-way bridge currently available only inside the Tari Universe desktop app.

## 📖 User Guide & FAQ
If you want to learn more and get to know the Tari Bridge better, please **[visit our FAQ & User Guide website](https://tarilabs.notion.site/Tari-Universe-Bridge-x-User-Guide-FAQs-2014e6c995c38094b4e4e98a1a3e8ec1)**.

## Environment
See `.env.example`. `NEXT_PUBLIC_ALLOW_UNIVERSE_DEV_ORIGIN=true` lets a Tari Universe dev build (`pnpm tauri dev`, origin `http://localhost:1420`) frame the bridge; it is read at build time and must not be set for release builds.
