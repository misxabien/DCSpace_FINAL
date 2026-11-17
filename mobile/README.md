# DC Space mobile app

Native Android / iOS shell that loads the same responsive UI from production:

**https://dcspace-final.vercel.app**

No separate React Native UI — the phone app is your existing mobile web layout inside Capacitor.

## Prerequisites

- Node.js 20+
- [Android Studio](https://developer.android.com/studio) (Android builds)
- Xcode + CocoaPods (iOS builds on macOS): `brew install cocoapods`

## Setup

```bash
cd mobile
npm install
npx cap sync
```

### Android

```bash
npm run open:android
```

Then Run ▶ in Android Studio (emulator or USB device).

From the repo root you can also use `npm run mobile:android`.

### iOS (macOS)

Install CocoaPods first, then:

```bash
npx cap add ios
npx cap sync
npm run open:ios
```

Open the workspace in Xcode and Run on a simulator or device.

## How it works

`capacitor.config.ts` sets `server.url` to the live Vercel site, so login, cookies, and `/api` calls behave like Chrome/Safari on mobile. Ship web updates on Vercel — reopen the app to get them (no store rebuild required for UI changes).

## Install without stores (PWA)

On the phone browser, open https://dcspace-final.vercel.app/login → Share / menu → **Add to Home Screen**. That uses the web app manifest (`standalone` display) with the same UI.

## Change the wrapped URL

Edit `server.url` in `capacitor.config.ts`, then `npx cap sync`.
