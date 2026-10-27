import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ETF,
  MarketSnapshot,
  fetchETFDirectory,
  fetchMarketSnapshot,
  formatPrice,
  formatReturn,
  getScoreLabel,
} from './src/marketData';
import {
  DEFAULT_FUNDS,
  loadSavedFunds,
  MAX_SELECTED_ETFS,
  saveSelectedFunds,
} from './src/watchlist';

async function requestSnapshots(funds: ETF[]): Promise<{
  snapshots: Record<string, MarketSnapshot>;
  errors: Record<string, string>;
}> {
  const results: Array<
    | { symbol: string; snapshot: MarketSnapshot }
    | { symbol: string; error: string }
  > = [];
  for (let index = 0; index < funds.length; index += 4) {
    const batch = await Promise.all(
      funds.slice(index, index + 4).map(async (fund) => {
        try {
          return { symbol: fund.symbol, snapshot: await fetchMarketSnapshot(fund) };
        } catch (error) {
          return {
            symbol: fund.symbol,
            error: error instanceof Error ? error.message : 'Could not load market prices.',
          };
        }
      }),
    );
    results.push(...batch);
  }

  const snapshots: Record<string, MarketSnapshot> = {};
  const errors: Record<string, string> = {};
  for (const result of results) {
    if ('snapshot' in result && result.snapshot) {
      snapshots[result.symbol] = result.snapshot;
    } else if ('error' in result) {
      errors[result.symbol] = result.error;
    }
  }
  return { snapshots, errors };
}

function Trend({ item }: { item: MarketSnapshot['returns'][number] }) {
  const positive = item.value !== null && item.value >= 0;
  return (
    <View>
      <Text style={[styles.trendValue, positive ? styles.positive : styles.negative]}>
        {formatReturn(item.value)}
      </Text>
      {item.previousClose !== null && (
        <Text style={styles.trendReference}>
          {formatPrice(item.previousClose)} · {item.previousDateLabel}
        </Text>
      )}
    </View>
  );
}

function FundCard({
  fund,
  snapshot,
  error,
}: {
  fund: ETF;
  snapshot: MarketSnapshot | undefined;
  error: string | undefined;
}) {
  return (
    <View style={styles.fundCard}>
      <View style={styles.fundHeader}>
        <View style={styles.fundIdentity}>
          <View style={styles.tickerMark}>
            <Text style={styles.tickerMarkText}>{fund.symbol.slice(0, 1)}</Text>
          </View>
          <View style={styles.fundTitleWrap}>
            <Text style={styles.fundName} numberOfLines={2}>
              {fund.name}
            </Text>
            <Text style={styles.fundDetails}>{fund.symbol} · U.S.-listed · USD</Text>
          </View>
        </View>
      </View>

      {snapshot ? (
        <>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(snapshot.latestClose)}</Text>
            <View
              style={[
                styles.scoreBadge,
                snapshot.score >= 4
                  ? styles.scorePositive
                  : snapshot.score <= 2
                    ? styles.scoreNegative
                    : styles.scoreNeutral,
              ]}
            >
              <Text style={styles.scoreNumber}>{snapshot.score}</Text>
              <Text style={styles.scoreOutOf}>/ 5</Text>
            </View>
          </View>
          <Text style={styles.quoteDate}>Latest close · {snapshot.latestDateLabel}</Text>
          <Text style={styles.signal}>{getScoreLabel(snapshot.score)}</Text>

          <View style={styles.divider} />
          <View style={styles.performanceHeader}>
            <Text style={styles.performanceTitle}>PRICE CHANGE</Text>
            <Text style={styles.performanceBasis}>vs. earlier close</Text>
          </View>
          <View style={styles.trendRow}>
            {snapshot.returns.map((item) => (
              <View key={item.days} style={styles.trendCell}>
                <Text style={styles.trendPeriod}>
                  {item.days}D · {item.previousDateLabel}
                </Text>
                <Trend item={item} />
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.cardMessage}>
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <ActivityIndicator color="#2463A6" />
          )}
        </View>
      )}
    </View>
  );
}

export default function App() {
  const [selectedFunds, setSelectedFunds] = useState<ETF[]>(DEFAULT_FUNDS);
  const [snapshots, setSnapshots] = useState<Record<string, MarketSnapshot>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [directory, setDirectory] = useState<ETF[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryProgress, setDirectoryProgress] = useState({ loaded: 0, total: 0 });
  const [searchText, setSearchText] = useState('');
  const [draftSymbols, setDraftSymbols] = useState<Set<string>>(new Set());
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const priceRequestId = useRef(0);

  const loadPrices = useCallback(async () => {
    const requestId = ++priceRequestId.current;
    setLoading(true);
    setErrors({});
    const result = await requestSnapshots(selectedFunds);
    if (requestId !== priceRequestId.current) return;
    setSnapshots(result.snapshots);
    setErrors(result.errors);
    if (Object.keys(result.snapshots).length > 0) {
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, [selectedFunds]);

  useEffect(() => {
    let active = true;
    void loadSavedFunds()
      .then((funds) => {
        if (active) setSelectedFunds(funds);
      })
      .catch((error: unknown) => {
        if (active) {
          setPreferencesError(
            error instanceof Error ? error.message : 'Could not load saved ETF selections.',
          );
        }
      })
      .finally(() => {
        if (active) setPreferencesLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    let active = true;
    const requestId = ++priceRequestId.current;
    void requestSnapshots(selectedFunds).then((result) => {
      if (!active || requestId !== priceRequestId.current) return;
      setSnapshots(result.snapshots);
      setErrors(result.errors);
      if (Object.keys(result.snapshots).length > 0) {
        setLastUpdated(new Date());
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [preferencesLoaded, selectedFunds]);

  useEffect(() => {
    if (!pickerVisible || directory.length > 0) return;
    let active = true;
    setDirectoryLoading(true);
    setDirectoryError(null);
    void fetchETFDirectory((loaded, total) => {
      if (active) setDirectoryProgress({ loaded, total });
    })
      .then((funds) => {
        if (active) setDirectory(funds);
      })
      .catch((error: unknown) => {
        if (active) {
          setDirectoryError(
            error instanceof Error ? error.message : 'Could not load the Nasdaq ETF directory.',
          );
        }
      })
      .finally(() => {
        if (active) setDirectoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [directory.length, pickerVisible]);

  const openPicker = () => {
    setDraftSymbols(new Set(selectedFunds.map((fund) => fund.symbol)));
    setSearchText('');
    setSelectionError(null);
    setPickerVisible(true);
  };

  const toggleFund = (fund: ETF) => {
    setSelectionError(null);
    const next = new Set(draftSymbols);
    if (next.has(fund.symbol)) {
      next.delete(fund.symbol);
    } else if (next.size >= MAX_SELECTED_ETFS) {
      setSelectionError(`You can select up to ${MAX_SELECTED_ETFS} ETFs.`);
      return;
    } else {
      next.add(fund.symbol);
    }
    setDraftSymbols(next);
  };

  const applySelection = async () => {
    const fundsBySymbol = new Map(directory.map((fund) => [fund.symbol, fund]));
    const funds = [...draftSymbols]
      .map((symbol) => fundsBySymbol.get(symbol) ?? selectedFunds.find((fund) => fund.symbol === symbol))
      .filter((fund): fund is ETF => fund !== undefined);
    try {
      await saveSelectedFunds(funds);
      setSelectedFunds(funds);
      setPreferencesError(null);
      setPickerVisible(false);
      setLoading(true);
    } catch (error) {
      setSelectionError(
        error instanceof Error ? error.message : 'Could not save your ETF selections.',
      );
    }
  };

  const refreshDirectory = async () => {
    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const funds = await fetchETFDirectory(
        (loaded, total) => setDirectoryProgress({ loaded, total }),
        true,
      );
      setDirectory(funds);
    } catch (error) {
      setDirectoryError(
        error instanceof Error ? error.message : 'Could not refresh the Nasdaq ETF directory.',
      );
    } finally {
      setDirectoryLoading(false);
    }
  };

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredFunds = normalizedSearch
    ? directory.filter(
        (fund) =>
          fund.symbol.toLowerCase().includes(normalizedSearch) ||
          fund.name.toLowerCase().includes(normalizedSearch),
      )
    : directory;
  const hasAnyData = Object.keys(snapshots).length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadPrices}
            tintColor="#DFECFA"
            colors={['#2463A6']}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <View style={styles.brandDot} />
              <Text style={styles.brandName}>DAYMARK</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh market prices"
              onPress={loadPrices}
              disabled={loading}
              style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
            >
              <Text style={styles.refreshIcon}>↻</Text>
              <Text style={styles.refreshText}>{loading ? 'UPDATING' : 'REFRESH'}</Text>
            </Pressable>
          </View>
          <Text style={styles.eyebrow}>A PRICE-ONLY MARKET CHECK</Text>
          <Text style={styles.heroTitle}>Read the market.{'\n'}Keep it simple.</Text>
          <Text style={styles.heroDescription}>
            A clear look at recent ETF prices, with a momentum score based only on past value.
          </Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              {lastUpdated
                ? `UPDATED ${lastUpdated.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'DAILY CLOSING PRICES'}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionEyebrow}>YOUR WATCHLIST</Text>
              <Text style={styles.sectionTitle}>Market snapshot</Text>
            </View>
            <View style={styles.watchlistActions}>
              <Text style={styles.sectionCount}>
                {selectedFunds.length}/{MAX_SELECTED_ETFS}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={openPicker}
                style={({ pressed }) => [styles.manageButton, pressed && styles.pressed]}
              >
                <Text style={styles.manageButtonText}>EDIT LIST</Text>
              </Pressable>
            </View>
          </View>

          {preferencesError && (
            <View style={styles.globalError}>
              <Text style={styles.errorTitle}>Saved selections could not be loaded</Text>
              <Text style={styles.errorText}>{preferencesError}</Text>
            </View>
          )}

          {selectedFunds.map((fund) => (
            <FundCard
              key={fund.symbol}
              fund={fund}
              snapshot={snapshots[fund.symbol]}
              error={errors[fund.symbol]}
            />
          ))}

          {!loading && !hasAnyData && (
            selectedFunds.length === 0 ? (
              <View style={styles.emptyWatchlist}>
                <Text style={styles.emptyTitle}>Your watchlist is empty</Text>
                <Text style={styles.emptyText}>Choose ETFs to see their price history and scores.</Text>
              </View>
            ) : (
              <View style={styles.globalError}>
                <Text style={styles.errorTitle}>Prices aren’t available right now</Text>
                <Text style={styles.errorText}>
                  Check your connection and try again. No score is shown when price history cannot be
                  verified.
                </Text>
              </View>
            )
          )}

          <View style={styles.methodCard}>
            <View style={styles.methodHeading}>
              <View style={styles.methodIcon}>
                <Text style={styles.methodIconText}>i</Text>
              </View>
              <Text style={styles.methodTitle}>How the score works</Text>
            </View>
            <Text style={styles.methodBody}>
              The score blends price changes over 1, 5, and 20 trading days (20%, 30%, and 50%
              weight). It uses price history only — no company, economic, or fund research.
            </Text>
            <View style={styles.scale}>
              <View style={styles.scaleLine} />
              {[
                { score: '1', label: '≤ −2%', color: '#C65A4D' },
                { score: '2', label: '>−2 to <−0.5%', color: '#D99271' },
                { score: '3', label: '−0.5% to +0.5%', color: '#A9A98A' },
                { score: '4', label: '>+0.5 to <+2%', color: '#4C8BCC' },
                { score: '5', label: '≥ +2%', color: '#2463A6' },
              ].map((item) => (
                <View key={item.score} style={styles.scaleItem}>
                  <View style={[styles.scaleDot, { backgroundColor: item.color }]}>
                    <Text style={styles.scaleNumber}>{item.score}</Text>
                  </View>
                  <Text style={styles.scaleLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerLabel}>DATA: NASDAQ · DAILY CLOSING PRICES</Text>
            <Text style={styles.footerText}>
              Prices may be delayed. This score is a historical price signal, not personalized
              financial advice or a prediction of future returns.
            </Text>
            {lastUpdated && (
              <Text style={styles.footerTimestamp}>
                Checked {lastUpdated.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPickerVisible(false)}
      >
        <SafeAreaView style={styles.pickerSafeArea}>
          <KeyboardAvoidingView
            style={styles.pickerContainer}
            behavior="padding"
          >
            <View style={styles.pickerHeader}>
              <View>
                <Text style={styles.pickerEyebrow}>NASDAQ ETF DIRECTORY</Text>
                <Text style={styles.pickerTitle}>Choose your ETFs</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close ETF picker"
                onPress={() => setPickerVisible(false)}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.pickerSubtitle}>
              Search {directory.length > 0 ? directory.length.toLocaleString() : 'all'} ETFs by name
              or ticker. Select up to {MAX_SELECTED_ETFS}.
            </Text>

            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search ETFs or symbols"
                placeholderTextColor="#99A49C"
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {searchText.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  onPress={() => setSearchText('')}
                  style={styles.clearSearch}
                >
                  <Text style={styles.clearSearchText}>×</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.pickerListHeader}>
              <Text style={styles.pickerListCount}>
                {draftSymbols.size} SELECTED · {directory.length.toLocaleString()} ETFs
              </Text>
              {directory.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  onPress={refreshDirectory}
                  disabled={directoryLoading}
                >
                  <Text style={[styles.reloadText, directoryLoading && styles.disabledText]}>
                    REFRESH LIST
                  </Text>
                </Pressable>
              )}
            </View>

            {directoryLoading ? (
              <View style={styles.directoryMessage}>
                <ActivityIndicator color="#2463A6" size="large" />
                <Text style={styles.directoryMessageTitle}>Loading ETF listings</Text>
                <Text style={styles.directoryMessageBody}>
                  Page {directoryProgress.loaded} of {directoryProgress.total}
                </Text>
              </View>
            ) : directoryError ? (
              <View style={styles.directoryMessage}>
                <Text style={styles.errorTitle}>Couldn’t load the ETF directory</Text>
                <Text style={styles.errorText}>{directoryError}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void refreshDirectory()}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryButtonText}>TRY AGAIN</Text>
                </Pressable>
              </View>
            ) : (
              <FlatList
                data={filteredFunds}
                keyExtractor={(fund) => fund.symbol}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={16}
                maxToRenderPerBatch={20}
                windowSize={10}
                contentContainerStyle={
                  filteredFunds.length === 0 ? styles.emptyResultsContainer : styles.pickerList
                }
                ListEmptyComponent={
                  <Text style={styles.emptyResults}>
                    {directory.length === 0
                      ? 'ETF listings are not available.'
                      : 'No ETFs match that search.'}
                  </Text>
                }
                renderItem={({ item }) => {
                  const selected = draftSymbols.has(item.symbol);
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => toggleFund(item)}
                      style={({ pressed }) => [
                        styles.fundOption,
                        selected && styles.fundOptionSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.fundOptionText}>
                        <Text style={styles.optionName} numberOfLines={2}>
                          {item.name}
                        </Text>
                        <Text style={styles.optionSymbol}>
                          {item.symbol} · U.S.-listed · USD
                        </Text>
                      </View>
                      <View style={[styles.checkMark, selected && styles.checkMarkSelected]}>
                        {selected && <Text style={styles.checkMarkText}>✓</Text>}
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}

            {selectionError && <Text style={styles.selectionError}>{selectionError}</Text>}
            <View style={styles.pickerFooter}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerVisible(false)}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelButtonText}>CANCEL</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={applySelection}
                disabled={directoryLoading || directory.length === 0}
                style={({ pressed }) => [
                  styles.applyButton,
                  (pressed || directoryLoading || directory.length === 0) && styles.pressed,
                ]}
              >
                <Text style={styles.applyButtonText}>
                  SHOW {draftSymbols.size} {draftSymbols.size === 1 ? 'ETF' : 'ETFs'}
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#123B70',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#F4F8FD',
  },
  hero: {
    backgroundColor: '#123B70',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 34,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#A8C9F0',
  },
  brandName: {
    color: '#F8FBFF',
    fontSize: 13,
    letterSpacing: 2.3,
    fontWeight: '800',
  },
  refreshButton: {
    height: 35,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderColor: '#5579A4',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pressed: {
    opacity: 0.65,
  },
  refreshIcon: {
    color: '#DFECFA',
    fontSize: 17,
    lineHeight: 19,
  },
  refreshText: {
    color: '#DFECFA',
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '700',
  },
  eyebrow: {
    color: '#A8C9F0',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 12,
  },
  heroTitle: {
    color: '#F8FBFF',
    fontSize: 37,
    lineHeight: 42,
    letterSpacing: -1,
    fontWeight: '700',
  },
  heroDescription: {
    color: '#CAD8E8',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 310,
  },
  livePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 19,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#1A4D85',
    borderRadius: 15,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A8C9F0',
  },
  liveText: {
    color: '#DFECFA',
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 25,
    paddingBottom: 28,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  sectionEyebrow: {
    color: '#6E7F94',
    fontSize: 9,
    letterSpacing: 1.7,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#1E3048',
    fontSize: 21,
    letterSpacing: -0.4,
    fontWeight: '700',
  },
  sectionCount: {
    color: '#718198',
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 4,
  },
  watchlistActions: {
    alignItems: 'flex-end',
    gap: 7,
  },
  manageButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#E5EFFA',
  },
  manageButtonText: {
    color: '#245B96',
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  fundCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 19,
    padding: 17,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E3EAF3',
  },
  fundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fundIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tickerMark: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: '#E4EFFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  emMark: {
    backgroundColor: '#EAF1F8',
  },
  tickerMarkText: {
    color: '#2463A6',
    fontSize: 17,
    fontWeight: '800',
  },
  fundTitleWrap: {
    flex: 1,
  },
  fundName: {
    color: '#26384F',
    fontSize: 15,
    fontWeight: '700',
  },
  fundDetails: {
    color: '#60758F',
    fontSize: 10,
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 19,
  },
  price: {
    color: '#172D46',
    fontSize: 30,
    letterSpacing: -1,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  scoreBadge: {
    height: 43,
    minWidth: 60,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePositive: {
    backgroundColor: '#E4EFFB',
  },
  scoreNeutral: {
    backgroundColor: '#EBF2FA',
  },
  scoreNegative: {
    backgroundColor: '#F8E9E5',
  },
  scoreNumber: {
    color: '#245B96',
    fontSize: 22,
    fontWeight: '800',
  },
  scoreOutOf: {
    color: '#687B93',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 2,
  },
  quoteDate: {
    color: '#87928B',
    fontSize: 10,
    marginTop: 3,
  },
  signal: {
    color: '#3E536E',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#E8EEF6',
    marginVertical: 14,
  },
  performanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  performanceTitle: {
    color: '#718198',
    fontSize: 9,
    letterSpacing: 1.1,
    fontWeight: '700',
  },
  performanceBasis: {
    color: '#8795A8',
    fontSize: 9,
  },
  trendRow: {
    flexDirection: 'row',
    gap: 9,
  },
  trendCell: {
    flex: 1,
    minHeight: 51,
    backgroundColor: '#F3F7FC',
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  trendPeriod: {
    color: '#718198',
    fontSize: 8,
    fontWeight: '600',
  },
  trendValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 5,
    fontVariant: ['tabular-nums'],
  },
  trendReference: {
    color: '#718198',
    fontSize: 8,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  positive: {
    color: '#2463A6',
  },
  negative: {
    color: '#BE5B4C',
  },
  cardMessage: {
    minHeight: 94,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 18,
  },
  errorText: {
    color: '#A54D42',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  globalError: {
    backgroundColor: '#F8E9E5',
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
  },
  emptyWatchlist: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E3EAF3',
    marginBottom: 14,
  },
  emptyTitle: {
    color: '#26384F',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    color: '#808C84',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
  },
  errorTitle: {
    color: '#8E4038',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 5,
  },
  methodCard: {
    backgroundColor: '#E7EFF9',
    borderRadius: 18,
    padding: 17,
    marginTop: 3,
  },
  methodHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  methodIcon: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#D7E5F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  methodIconText: {
    color: '#245B96',
    fontSize: 12,
    fontWeight: '800',
  },
  methodTitle: {
    color: '#29415F',
    fontSize: 13,
    fontWeight: '700',
  },
  methodBody: {
    color: '#667B96',
    fontSize: 11,
    lineHeight: 17,
  },
  scale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 17,
    position: 'relative',
  },
  scaleLine: {
    position: 'absolute',
    top: 12,
    left: 8,
    right: 8,
    height: 1,
    backgroundColor: '#C4D4E8',
  },
  scaleItem: {
    width: '19%',
    alignItems: 'center',
  },
  scaleDot: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderColor: '#E7EFF9',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  scaleNumber: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  scaleLabel: {
    color: '#6D8099',
    textAlign: 'center',
    fontSize: 8,
    lineHeight: 11,
    marginTop: 6,
  },
  footer: {
    paddingHorizontal: 2,
    paddingTop: 19,
  },
  footerLabel: {
    color: '#79867D',
    fontSize: 8,
    letterSpacing: 1.2,
    fontWeight: '700',
    marginBottom: 6,
  },
  footerText: {
    color: '#89948C',
    fontSize: 10,
    lineHeight: 15,
  },
  footerTimestamp: {
    color: '#9AA49D',
    fontSize: 9,
    marginTop: 7,
  },
  pickerSafeArea: {
    flex: 1,
    backgroundColor: '#F4F8FD',
  },
  pickerContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 15,
  },
  pickerEyebrow: {
    color: '#6E7F94',
    fontSize: 9,
    letterSpacing: 1.6,
    fontWeight: '700',
    marginBottom: 5,
  },
  pickerTitle: {
    color: '#1E3048',
    fontSize: 24,
    letterSpacing: -0.5,
    fontWeight: '700',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E7EFF9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#536A88',
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '400',
  },
  pickerSubtitle: {
    color: '#687C95',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  searchBox: {
    height: 47,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 17,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#DCE6F2',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  searchIcon: {
    color: '#607895',
    fontSize: 22,
    lineHeight: 25,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#26384F',
    fontSize: 13,
    paddingVertical: 0,
  },
  clearSearch: {
    width: 28,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearSearchText: {
    color: '#6D8099',
    fontSize: 20,
  },
  pickerListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 17,
    marginBottom: 8,
  },
  pickerListCount: {
    color: '#718198',
    fontSize: 9,
    letterSpacing: 0.9,
    fontWeight: '700',
  },
  reloadText: {
    color: '#2463A6',
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  disabledText: {
    opacity: 0.45,
  },
  pickerList: {
    paddingBottom: 12,
  },
  fundOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 63,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginBottom: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E3EAF3',
    backgroundColor: '#FFFFFF',
  },
  fundOptionSelected: {
    borderColor: '#ABC9EA',
    backgroundColor: '#EEF5FD',
  },
  fundOptionText: {
    flex: 1,
    paddingRight: 12,
  },
  optionSymbol: {
    color: '#60758F',
    fontSize: 10,
    letterSpacing: 0.7,
    fontWeight: '700',
    marginTop: 4,
  },
  optionName: {
    color: '#263B56',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  checkMark: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CAD7E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMarkSelected: {
    backgroundColor: '#2463A6',
    borderColor: '#2463A6',
  },
  checkMarkText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  directoryMessage: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  directoryMessageTitle: {
    color: '#385777',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 13,
  },
  directoryMessageBody: {
    color: '#718198',
    fontSize: 11,
    marginTop: 5,
  },
  retryButton: {
    backgroundColor: '#E7F0FB',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 12,
    marginTop: 14,
  },
  retryButtonText: {
    color: '#245B96',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  emptyResultsContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 25,
  },
  emptyResults: {
    color: '#74839A',
    fontSize: 12,
    textAlign: 'center',
  },
  selectionError: {
    color: '#A54D42',
    textAlign: 'center',
    fontSize: 11,
    marginTop: 6,
  },
  pickerFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#F4F8FD',
  },
  cancelButton: {
    flex: 1,
    height: 47,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7E1EF',
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    color: '#5D718D',
    fontSize: 10,
    letterSpacing: 0.9,
    fontWeight: '800',
  },
  applyButton: {
    flex: 1.5,
    height: 47,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#2463A6',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
});
