# Daymark

Daymark is a cross-platform Expo app that compares recent closing prices for:

- **SPY** — an ETF tracking the S&P 500
- **EEM** — an ETF tracking emerging markets

It shows the latest available daily close, earlier closing prices and percentage changes over 1, 5, and 20 trading days, and a score from 1 to 5. The score uses only price history:

1. Calculate the percentage price change over 1, 5, and 20 trading days.
2. Combine those changes with weights of 20%, 30%, and 50%.
3. Map the weighted change to a score:
   - **1:** −2% or less
   - **2:** greater than −2% and less than −0.5%
   - **3:** −0.5% through +0.5%
   - **4:** greater than +0.5% and less than +2%
   - **5:** +2% or more

Daily price history is requested from Nasdaq's public ETF historical-prices endpoint. Prices are closing values, not a live quote. The app reports data errors instead of inventing a price or score.

## Run the app during development

```sh
npm install
npm start
```

This starts the development server and is only needed while developing. The installed app does not need Expo Go or this server to run.

## Build a standalone app

Standalone builds include the React Native app in a normal installable app package. After installation, launch Daymark from the phone like any other app. It fetches prices directly from Nasdaq, so the phone needs an internet connection, but does not need a development server.

### Android phone (APK)

1. Create a free account at [expo.dev](https://expo.dev/signup) and sign in:
   ```sh
   npx eas-cli@latest login
   ```
2. Connect this project to your Expo account (one-time):
   ```sh
   npx eas-cli@latest build:configure
   ```
3. Build the standalone APK:
   ```sh
   npx eas-cli@latest build --platform android --profile preview
   ```
4. Open the build link on your Android phone and install the APK. Android may ask you to allow installs from that source.

### iPhone

Build and install a standalone iPhone app with:

```sh
npx eas-cli@latest build --platform ios --profile preview
```

Installing on a physical iPhone requires Apple signing credentials and an eligible provisioning method; EAS will guide you through the signing setup. Apple restricts direct device installation, and distribution through the App Store requires Apple Developer Program membership. For iOS Simulator instead, build a simulator app:

```sh
npx eas-cli@latest build --platform ios --profile simulator --local
```

Local iOS builds require macOS and Xcode. To publish to the stores, use the `production` profile. Before publishing, replace the example app identifiers in `app.json` with identifiers you control.

EAS is used here to compile and sign the installable package; it is not required to run the installed app. The app includes the React Native runtime and requests price data directly from Nasdaq.

The score is a simple historical price signal, not personalized financial advice or a prediction of future returns.
