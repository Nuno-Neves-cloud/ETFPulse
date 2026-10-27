import AsyncStorage from '@react-native-async-storage/async-storage';
import { ETF } from './marketData';

export const MAX_SELECTED_ETFS = 20;

export const DEFAULT_FUNDS: ETF[] = [
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust' },
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF' },
];

const WATCHLIST_STORAGE_KEY = '@daymark/selected-etfs-v1';

export async function loadSavedFunds(): Promise<ETF[]> {
  const savedValue = await AsyncStorage.getItem(WATCHLIST_STORAGE_KEY);
  if (savedValue === null) return DEFAULT_FUNDS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(savedValue);
  } catch {
    throw new Error('Saved ETF selections are unreadable. Clear the app data and try again.');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > MAX_SELECTED_ETFS ||
    !parsed.every(
      (fund): fund is ETF =>
        typeof fund?.symbol === 'string' &&
        typeof fund?.name === 'string' &&
        fund.symbol.length > 0 &&
        fund.name.length > 0,
    )
  ) {
    throw new Error('Saved ETF selections are invalid. Clear the app data and try again.');
  }

  return parsed;
}

export async function saveSelectedFunds(funds: ETF[]): Promise<void> {
  if (funds.length > MAX_SELECTED_ETFS) {
    throw new Error(`Choose no more than ${MAX_SELECTED_ETFS} ETFs.`);
  }
  await AsyncStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(funds));
}
