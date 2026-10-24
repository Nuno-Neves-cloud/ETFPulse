import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ETF,
  MarketSnapshot,
  fetchMarketSnapshot,
  formatPrice,
  formatReturn,
  getScoreLabel,
} from './src/marketData';

const FUNDS: ETF[] = [
  { symbol: 'SPY', name: 'S&P 500', description: 'SPDR S&P 500 ETF' },
  { symbol: 'EEM', name: 'Emerging markets', description: 'iShares MSCI Emerging Markets ETF' },
];

async function requestSnapshots(): Promise<{
  snapshots: Record<string, MarketSnapshot>;
  errors: Record<string, string>;
}> {
  const results = await Promise.all(
    FUNDS.map(async (fund) => {
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
          <View style={[styles.tickerMark, fund.symbol === 'EEM' && styles.emMark]}>
            <Text style={styles.tickerMarkText}>{fund.symbol === 'SPY' ? 'S' : 'E'}</Text>
          </View>
          <View style={styles.fundTitleWrap}>
            <Text style={styles.fundName}>{fund.name}</Text>
            <Text style={styles.fundDescription}>{fund.description}</Text>
          </View>
        </View>
        <Text style={styles.ticker}>{fund.symbol}</Text>
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
            <ActivityIndicator color="#176B52" />
          )}
        </View>
      )}
    </View>
  );
}

export default function App() {
  const [snapshots, setSnapshots] = useState<Record<string, MarketSnapshot>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadPrices = useCallback(async () => {
    setLoading(true);
    setErrors({});
    const result = await requestSnapshots();
    setSnapshots(result.snapshots);
    setErrors(result.errors);
    if (Object.keys(result.snapshots).length > 0) {
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void requestSnapshots().then((result) => {
      if (!active) return;
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
  }, []);

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
            tintColor="#D7F0E3"
            colors={['#176B52']}
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
            <Text style={styles.sectionCount}>02 FUNDS</Text>
          </View>

          {FUNDS.map((fund) => (
            <FundCard
              key={fund.symbol}
              fund={fund}
              snapshot={snapshots[fund.symbol]}
              error={errors[fund.symbol]}
            />
          ))}

          {!loading && !hasAnyData && (
            <View style={styles.globalError}>
              <Text style={styles.errorTitle}>Prices aren’t available right now</Text>
              <Text style={styles.errorText}>
                Check your connection and try again. No score is shown when price history cannot be
                verified.
              </Text>
            </View>
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
                { score: '4', label: '>+0.5 to <+2%', color: '#67A786' },
                { score: '5', label: '≥ +2%', color: '#278260' },
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#113E34',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#F3F5F1',
  },
  hero: {
    backgroundColor: '#113E34',
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
    backgroundColor: '#9BDBB3',
  },
  brandName: {
    color: '#F1F6EF',
    fontSize: 13,
    letterSpacing: 2.3,
    fontWeight: '800',
  },
  refreshButton: {
    height: 35,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderColor: '#476C5F',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pressed: {
    opacity: 0.65,
  },
  refreshIcon: {
    color: '#D7F0E3',
    fontSize: 17,
    lineHeight: 19,
  },
  refreshText: {
    color: '#D7F0E3',
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '700',
  },
  eyebrow: {
    color: '#9BDBB3',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 12,
  },
  heroTitle: {
    color: '#F1F6EF',
    fontSize: 37,
    lineHeight: 42,
    letterSpacing: -1,
    fontWeight: '700',
  },
  heroDescription: {
    color: '#C2D2C7',
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
    backgroundColor: '#1D5043',
    borderRadius: 15,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9BDBB3',
  },
  liveText: {
    color: '#D4E6DA',
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
    color: '#718078',
    fontSize: 9,
    letterSpacing: 1.7,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#1F3029',
    fontSize: 21,
    letterSpacing: -0.4,
    fontWeight: '700',
  },
  sectionCount: {
    color: '#7F8B83',
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 4,
  },
  fundCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 19,
    padding: 17,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8ECE6',
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
    backgroundColor: '#E5F2EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  emMark: {
    backgroundColor: '#F3EDE2',
  },
  tickerMarkText: {
    color: '#176B52',
    fontSize: 17,
    fontWeight: '800',
  },
  fundTitleWrap: {
    flex: 1,
  },
  fundName: {
    color: '#26362F',
    fontSize: 15,
    fontWeight: '700',
  },
  fundDescription: {
    color: '#808C84',
    fontSize: 10,
    marginTop: 3,
  },
  ticker: {
    color: '#728078',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginLeft: 5,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 19,
  },
  price: {
    color: '#172D24',
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
    backgroundColor: '#E2F2E8',
  },
  scoreNeutral: {
    backgroundColor: '#F0F0E6',
  },
  scoreNegative: {
    backgroundColor: '#F8E9E5',
  },
  scoreNumber: {
    color: '#225C43',
    fontSize: 22,
    fontWeight: '800',
  },
  scoreOutOf: {
    color: '#6D7F73',
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
    color: '#3D5146',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#EEF0EC',
    marginVertical: 14,
  },
  performanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  performanceTitle: {
    color: '#818D85',
    fontSize: 9,
    letterSpacing: 1.1,
    fontWeight: '700',
  },
  performanceBasis: {
    color: '#A0A9A3',
    fontSize: 9,
  },
  trendRow: {
    flexDirection: 'row',
    gap: 9,
  },
  trendCell: {
    flex: 1,
    minHeight: 51,
    backgroundColor: '#F6F8F5',
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  trendPeriod: {
    color: '#8A968E',
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
    color: '#87928B',
    fontSize: 8,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  positive: {
    color: '#25805A',
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
  errorTitle: {
    color: '#8E4038',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 5,
  },
  methodCard: {
    backgroundColor: '#E8EEE8',
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
    backgroundColor: '#D3E4D7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  methodIconText: {
    color: '#276343',
    fontSize: 12,
    fontWeight: '800',
  },
  methodTitle: {
    color: '#294136',
    fontSize: 13,
    fontWeight: '700',
  },
  methodBody: {
    color: '#66796C',
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
    backgroundColor: '#C4D2C6',
  },
  scaleItem: {
    width: '19%',
    alignItems: 'center',
  },
  scaleDot: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderColor: '#E8EEE8',
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
    color: '#78867B',
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
});
