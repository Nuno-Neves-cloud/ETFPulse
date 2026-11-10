# ETFPulse

ETFPulse is a cross-platform app for checking recent closing prices for European ETFs. It shows each selected fund's latest daily close, price changes over 1, 5, and 20 trading days, and a simple price-momentum score. You can search for funds by name, ticker, or ISIN and save a watchlist of up to 20 funds on your device. SXR8.DE and EUNM.DE are selected by default.

## How the score works

The base score combines the percentage price changes over 1, 5, and 20 trading days, weighted at 20%, 30%, and 50%, respectively. The weighted change maps to a score from 1 to 5:

| Base score | Weighted price change |
|---|---|
| 1 | −2% or less |
| 2 | Greater than −2% and less than −0.5% |
| 3 | −0.5% through +0.5% |
| 4 | Greater than +0.5% and less than +2% |
| 5 | +2% or more |

The score gains one point, up to 5, when the latest 5-trading-day return is at least 0.1 percentage points better than the 5-day-equivalent return implied by the preceding 15 trading days. This recognizes improving momentum, including a decline that is slowing; it does not mean the price has stopped falling.

ETF directory details come from the justETF screener, while Yahoo Finance is used to find exchange listings and retrieve daily closing prices. Prices are shown in the exchange trading currency, which may differ from the fund's base currency. Data may be delayed or unavailable, and the providers may change their endpoints. This score reflects historical prices only; it is not investment advice or a prediction of future returns.

## Standalone builds

Build an installable ETFPulse app with EAS Build. A standalone app runs without Expo Go or a development server. It still needs an internet connection to load ETF and price data.

## One-time setup

Install the project dependencies, sign in to an Expo account, and configure EAS for this project:

```sh
npm ci
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

## Android

Build an installable APK with the `preview` profile:

```sh
npx eas-cli@latest build --platform android --profile preview
```

When the build finishes, open its EAS build link on the Android device and install the APK. The device may ask you to allow installation from that source.

## iPhone

For an internal iPhone build, run:

```sh
npx eas-cli@latest build --platform ios --profile preview
```

Follow EAS prompts to configure Apple signing. The internal iOS build uses ad hoc provisioning and can only be installed on devices included in its provisioning profile. Register any test device with EAS and rebuild if needed. Open the build link on a registered iPhone to install it.

## Store distribution

The `production` profile is configured for Android App Bundles and iOS store builds:

```sh
npx eas-cli@latest build --platform all --profile production
```

Store release requires the corresponding developer accounts, signing credentials, and store submission steps. Before distributing your own app, replace the sample iOS bundle identifier and Android package in `app.json` with identifiers you control. Keep them unchanged if you need to update an existing installation.

## Version history

| Version | Changes |
|---|---|
| 1.0.1 | Improved momentum scoring to recognize when a price decline is slowing. |
| 1.0.0 | Initial release. |