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

## Run the app

```sh
npm install
npm start
```

Then use Expo Go or a simulator to open the iOS or Android app. Press **Refresh** or pull down on the screen to request updated prices.

The score is a simple historical price signal, not personalized financial advice or a prediction of future returns.
