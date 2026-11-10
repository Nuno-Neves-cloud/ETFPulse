import { fetchMarketSnapshot, formatReturn, getScoreLabel } from './marketData';

function createChartResponse(latestChange: number): Response {
  // Flat history makes each lookback return equal, so the base weighted score matches this change.
  const closes = Array<number>(21).fill(100);
  closes[20] = 100 * (1 + latestChange / 100);
  return createChartResponseFromCloses(closes);
}

describe('fetchMarketSnapshot', () => {
  afterEach(() => {
    // Keep each mocked network response isolated from the next test.
    jest.restoreAllMocks();
  });

  // Flat histories trigger the improvement bonus for positive changes.
  test.each([
    [-2, 1],
    [-1.99, 2],
    [-0.5, 3],
    [0.5, 4],
    [0.51, 5],
    [2, 5],
  ])('maps a %s%% weighted change to score %i including trend adjustment', async (change, score) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(createChartResponse(change));

    const snapshot = await fetchMarketSnapshot({ symbol: 'SXR8.DE', name: 'S&P 500 ETF' });

    expect(snapshot.score).toBe(score);
    expect(snapshot.currency).toBe('EUR');
    expect(snapshot.latestClose).toBeCloseTo(100 * (1 + change / 100));
    expect(snapshot.returns.map((item) => item.days)).toEqual([1, 5, 20]);
    snapshot.returns.forEach((item) => expect(item.value).toBeCloseTo(change));
  });

  test('raises the score when a still-negative 5-day return is slowing', async () => {
    const closes = Array<number>(21).fill(100);
    for (let index = 1; index <= 15; index += 1) {
      closes[index] = 100 * Math.pow(0.99, index);
    }
    for (let index = 16; index <= 20; index += 1) {
      closes[index] = closes[15] * Math.pow(0.998, index - 15);
    }

    jest.spyOn(globalThis, 'fetch').mockResolvedValue(createChartResponseFromCloses(closes));

    const snapshot = await fetchMarketSnapshot({ symbol: 'SXR8.DE', name: 'S&P 500 ETF' });

    expect(snapshot.returns[1].value).toBeLessThan(0);
    expect(snapshot.trendImproving).toBe(true);
    expect(snapshot.score).toBe(2);
  });

  test('does not raise the score when the decline is accelerating', async () => {
    const closes = Array<number>(21).fill(100);
    for (let index = 1; index <= 15; index += 1) {
      closes[index] = 100 * Math.pow(0.999, index);
    }
    for (let index = 16; index <= 20; index += 1) {
      closes[index] = closes[15] * Math.pow(0.99, index - 15);
    }

    jest.spyOn(globalThis, 'fetch').mockResolvedValue(createChartResponseFromCloses(closes));

    const snapshot = await fetchMarketSnapshot({ symbol: 'SXR8.DE', name: 'S&P 500 ETF' });

    expect(snapshot.trendImproving).toBe(false);
    expect(snapshot.score).toBe(1);
  });

  test('rejects history that is too short to calculate the 20-day change', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                meta: { currency: 'EUR' },
                timestamp: [1, 2, 3],
                indicators: { quote: [{ close: [100, 101, 102] }] },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      fetchMarketSnapshot({ symbol: 'SXR8.DE', name: 'S&P 500 ETF' }),
    ).rejects.toThrow('Not enough daily price history');
  });
});

describe('market-data formatting', () => {
  test.each([
    [1.234, '+1.23%'],
    [0, '0.00%'],
    [-1.234, '-1.23%'],
    [null, '—'],
  ])('formats return %s as %s', (value, expected) => {
    expect(formatReturn(value)).toBe(expected);
  });

  test('provides a fallback label for an unknown score', () => {
    expect(getScoreLabel(0)).toBe('Price score unavailable');
  });

  test('highlights improving momentum independently of the score', () => {
    expect(getScoreLabel(2, true)).toContain('Momentum improving');
  });
});

function createChartResponseFromCloses(closes: number[]): Response {
  const firstTimestamp = Date.UTC(2025, 0, 1) / 1000;

  return new Response(
    JSON.stringify({
      chart: {
        result: [
          {
            meta: { currency: 'EUR', exchangeTimezoneName: 'UTC' },
            timestamp: closes.map((_, index) => firstTimestamp + index * 86400),
            indicators: { quote: [{ close: closes }] },
          },
        ],
      },
    }),
    { status: 200 },
  );
}
