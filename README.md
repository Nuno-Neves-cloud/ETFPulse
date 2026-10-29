# ETFPulse

ETFPulse is a cross-platform Expo app that compares recent closing prices for:

- **SXR8.DE** — iShares Core S&P 500 UCITS ETF USD (Acc), listed on Xetra
- **EUNM.DE** — iShares MSCI Emerging Markets UCITS ETF (Acc), listed on Xetra

It shows the latest available daily close, earlier closing prices and percentage changes over 1, 5, and 20 trading days, and a score from 1 to 5. The score uses only price history:

1. Calculate the percentage price change over 1, 5, and 20 trading days.
2. Combine those changes with weights of 20%, 30%, and 50%.
3. Map the weighted change to a score:
   - **1:** −2% or less
   - **2:** greater than −2% and less than −0.5%
   - **3:** −0.5% through +0.5%
   - **4:** greater than +0.5% and less than +2%
   - **5:** +2% or more

The app loads European equity ETF names, ISINs, issuer names, distribution policy and fund currencies from the justETF ETF screener. It uses Yahoo Finance's chart endpoint for exchange-listed daily closing prices and resolves each selected fund to a European ticker such as `SXR8.DE`. Exchange prices are shown in their trading currency; the fund's base currency may differ. Directory results are cached for 24 hours. Use **Edit list** to search by fund name, ticker or ISIN and select up to 20 funds. SXR8.DE and EUNM.DE are selected initially, and the watchlist is saved on the device. Price history is closing-price data, not a live quote; the score uses only that history.

## Run the app during development

```sh
npm install
npm start
```

This starts the development server and is only needed while developing. The installed app does not need Expo Go or this server to run.

## Build a standalone app

Standalone builds include the React Native app in a normal installable app package. After installation, launch ETFPulse from the phone like any other app. It fetches ETF directory data from justETF and price history from Yahoo Finance, so the phone needs an internet connection, but does not need a development server.

### Build and run from Xcode

On a Mac with the full Xcode app installed:

1. Install Xcode from the Mac App Store, open it once, accept its license, and install its iOS platform components. In Xcode, add your Apple Account under **Settings → Accounts**. Under **Settings → Locations → Command Line Tools**, select the installed Xcode version.
2. From the project folder, install JavaScript dependencies and generate the native iOS project:
   ```sh
   npm install
   npm run prebuild:ios
   ```
   This runs Expo Prebuild to generate `ios/` and install iOS pods. If CocoaPods is not installed, install it first (for example, with `brew install cocoapods`). The generated folder is intentionally ignored by Git; rerun Prebuild after changing native app configuration or dependencies.
3. Open the generated CocoaPods workspace:
   ```sh
   open ios/ETFPulse.xcworkspace
   ```
4. In Xcode, select the **ETFPulse** project and app target, then **Signing & Capabilities**. Enable **Automatically manage signing** and select your **Team**. The configured bundle identifier is `com.marketinvestor.daymark`; change it in `app.json` if you need an identifier you own.
5. Connect and select your iPhone as the run destination, then choose **Product → Run** to build, sign, and install.

Xcode's normal Debug run uses Metro to serve JavaScript. To install a build that runs without Metro, choose the app's **Release** configuration when building. For an installable release/archive on a physical iPhone, Apple signing and provisioning apply; App Store or TestFlight distribution requires Apple Developer Program membership. A free Personal Team is suitable for on-device development, but its provisioning is limited and must be renewed periodically.

If Prebuild reports that CocoaPods or Xcode is missing, install the full Xcode app and CocoaPods, then rerun `npm run prebuild:ios`.

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

EAS is used here to compile and sign the installable package; it is not required to run the installed app. The app includes the React Native runtime and requests ETF data directly from justETF and Yahoo Finance.

The score is a simple historical price signal, not personalized financial advice or a prediction of future returns.
