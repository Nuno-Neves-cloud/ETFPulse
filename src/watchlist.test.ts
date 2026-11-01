import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_FUNDS, loadSavedFunds, saveSelectedFunds } from './watchlist';

describe('saved watchlist', () => {
  beforeEach(async () => {
    // Start from an empty device store so tests do not depend on execution order.
    await AsyncStorage.clear();
  });

  test('uses the default funds when no watchlist has been saved', async () => {
    await expect(loadSavedFunds()).resolves.toEqual(DEFAULT_FUNDS);
  });

  test('saves and reloads the selected funds', async () => {
    const funds = [DEFAULT_FUNDS[1]];

    await saveSelectedFunds(funds);

    await expect(loadSavedFunds()).resolves.toEqual(funds);
  });

  test('reports invalid saved JSON instead of silently resetting the watchlist', async () => {
    await AsyncStorage.setItem('@daymark/selected-etfs-europe-v2', '{');

    await expect(loadSavedFunds()).rejects.toThrow('Saved ETF selections are unreadable');
  });

  test('rejects a selection above the configured limit', async () => {
    // Generate one more fund than the watchlist's maximum allowed size.
    const funds = Array.from({ length: 21 }, (_, index) => ({
      ...DEFAULT_FUNDS[0],
      symbol: `ETF${index}`,
    }));

    await expect(saveSelectedFunds(funds)).rejects.toThrow('Choose no more than 20 ETFs.');
  });
});
