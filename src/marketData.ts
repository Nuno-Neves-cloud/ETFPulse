import AsyncStorage from '@react-native-async-storage/async-storage';

export type ETF = {
  symbol: string;
  name: string;
};

type NasdaqETFRow = {
  symbol?: string;
  companyName?: string;
};

type NasdaqETFDirectoryResponse = {
  data?: {
    records?: {
      totalrecords?: number;
      limit?: number;
      offset?: number;
      data?: {
        rows?: NasdaqETFRow[];
      };
    };
  };
  message?: string;
};

type NasdaqHistoricalRow = {
  date: string;
  close: string;
};

type NasdaqHistoricalResponse = {
  data?: {
    tradesTable?: {
      rows?: NasdaqHistoricalRow[];
    };
  };
  message?: string;
};

export type PeriodReturn = {
  days: number;
  value: number | null;
  previousClose: number | null;
  previousDateLabel: string | null;
};

export type MarketSnapshot = {
  symbol: string;
  latestClose: number;
  latestDateLabel: string;
  returns: PeriodReturn[];
  score: number;
};

const PERIODS = [1, 5, 20] as const;
const ETF_DIRECTORY_URL = 'https://api.nasdaq.com/api/screener/etf';
const ETF_DIRECTORY_CACHE_KEY = '@daymark/etf-directory-v1';
const ETF_DIRECTORY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const ETF_DIRECTORY_PAGE_SIZE = 50;
const ETF_DIRECTORY_WORKERS = 4;

function dateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nasdaqHeaders(): HeadersInit {
  return {
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://www.nasdaq.com',
    Referer: 'https://www.nasdaq.com/',
  };
}

function parseETFDirectoryRows(rows: NasdaqETFRow[]): ETF[] {
  const fundsBySymbol = new Map<string, ETF>();
  for (const row of rows) {
    const symbol = row.symbol?.trim().toUpperCase();
    const name = row.companyName?.trim();
    if (symbol && name && !fundsBySymbol.has(symbol)) {
      fundsBySymbol.set(symbol, { symbol, name });
    }
  }
  return [...fundsBySymbol.values()].sort((left, right) =>
    left.symbol.localeCompare(right.symbol),
  );
}

function isValidETFDirectory(value: unknown): value is ETF[] {
  return (
    Array.isArray(value) &&
    value.every(
      (fund): fund is ETF =>
        typeof fund?.symbol === 'string' &&
        typeof fund?.name === 'string' &&
        fund.symbol.length > 0 &&
        fund.name.length > 0,
    )
  );
}

export async function fetchETFDirectory(
  onProgress?: (loaded: number, total: number) => void,
  forceRefresh = false,
): Promise<ETF[]> {
  if (!forceRefresh) {
    const cachedValue = await AsyncStorage.getItem(ETF_DIRECTORY_CACHE_KEY);
    if (cachedValue) {
      try {
        const cached = JSON.parse(cachedValue) as {
          savedAt?: number;
          funds?: unknown;
        };
        if (
          typeof cached.savedAt === 'number' &&
          Date.now() - cached.savedAt < ETF_DIRECTORY_CACHE_MAX_AGE &&
          isValidETFDirectory(cached.funds) &&
          cached.funds.length > 0
        ) {
          onProgress?.(cached.funds.length, cached.funds.length);
          return cached.funds;
        }
      } catch {
        // A bad cache is replaced by a fresh copy from Nasdaq.
      }
    }
  }

  const headers = nasdaqHeaders();
  const firstUrl = new URL(ETF_DIRECTORY_URL);
  firstUrl.searchParams.set('limit', String(ETF_DIRECTORY_PAGE_SIZE));
  firstUrl.searchParams.set('offset', '0');
  const firstResponse = await fetch(firstUrl.toString(), { headers });
  if (!firstResponse.ok) {
    throw new Error(`Nasdaq ETF directory returned ${firstResponse.status}. Try again.`);
  }

  const firstPayload = (await firstResponse.json()) as NasdaqETFDirectoryResponse;
  const records = firstPayload.data?.records;
  const total = records?.totalrecords;
  const firstRows = records?.data?.rows;
  if (
    typeof total !== 'number' ||
    !Number.isInteger(total) ||
    total < 1 ||
    !firstRows?.length ||
    records?.offset !== 0
  ) {
    throw new Error(firstPayload.message || 'Nasdaq did not return a valid ETF directory.');
  }

  const totalRecords = total;
  const pageCount = Math.ceil(totalRecords / ETF_DIRECTORY_PAGE_SIZE);
  const offsets = Array.from(
    { length: pageCount - 1 },
    (_, index) => (index + 1) * ETF_DIRECTORY_PAGE_SIZE,
  );
  const rows = [...firstRows];
  let nextOffsetIndex = 0;
  let loadedPages = 1;
  onProgress?.(loadedPages, pageCount);

  const workers = Array.from(
    { length: Math.min(ETF_DIRECTORY_WORKERS, offsets.length) },
    async () => {
      while (nextOffsetIndex < offsets.length) {
        const offset = offsets[nextOffsetIndex];
        nextOffsetIndex += 1;
        const pageUrl = new URL(ETF_DIRECTORY_URL);
        pageUrl.searchParams.set('limit', String(ETF_DIRECTORY_PAGE_SIZE));
        pageUrl.searchParams.set('offset', String(offset));
        const response = await fetch(pageUrl.toString(), { headers });
        if (!response.ok) {
          throw new Error(`Nasdaq ETF directory returned ${response.status}. Try again.`);
        }
        const payload = (await response.json()) as NasdaqETFDirectoryResponse;
        const page = payload.data?.records;
        if (page?.offset !== offset || !page.data?.rows?.length) {
          throw new Error(`Nasdaq returned an invalid ETF directory page at offset ${offset}.`);
        }
        rows.push(...page.data.rows);
        loadedPages += 1;
        onProgress?.(loadedPages, pageCount);
      }
    },
  );
  await Promise.all(workers);

  const funds = parseETFDirectoryRows(rows);
  if (!funds.some((fund) => fund.symbol === 'SPY') || !funds.some((fund) => fund.symbol === 'EEM')) {
    throw new Error('Nasdaq returned an incomplete ETF directory. Please refresh and try again.');
  }

  await AsyncStorage.setItem(
    ETF_DIRECTORY_CACHE_KEY,
    JSON.stringify({ savedAt: Date.now(), funds }),
  );
  return funds;
}

function parseClose(value: string): number {
  const price = Number(value.replace(/[$,]/g, '').trim());
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('The market data provider returned an invalid closing price.');
  }
  return price;
}

function parseDate(value: string): Date {
  const [month, day, year] = value.split('/').map(Number);
  if (!month || !day || !year) {
    throw new Error('The market data provider returned an invalid trading date.');
  }
  return new Date(year, month - 1, day);
}

function calculateScore(returns: PeriodReturn[]): number | null {
  if (returns.some((item) => item.value === null)) {
    return null;
  }

  const weightedMomentum =
    returns[0].value! * 0.2 + returns[1].value! * 0.3 + returns[2].value! * 0.5;

  if (weightedMomentum >= 2) return 5;
  if (weightedMomentum > 0.5) return 4;
  if (weightedMomentum >= -0.5) return 3;
  if (weightedMomentum > -2) return 2;
  return 1;
}

export async function fetchMarketSnapshot(fund: ETF): Promise<MarketSnapshot> {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 120);

  const url = new URL(`https://api.nasdaq.com/api/quote/${fund.symbol}/historical`);
  url.searchParams.set('assetclass', 'etf');
  url.searchParams.set('fromdate', dateString(from));
  url.searchParams.set('todate', dateString(today));
  url.searchParams.set('limit', '120');

  const response = await fetch(url.toString(), {
    headers: nasdaqHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Price service returned ${response.status}. Pull down to try again.`);
  }

  const payload = (await response.json()) as NasdaqHistoricalResponse;
  const rows = payload.data?.tradesTable?.rows;
  if (!rows?.length) {
    throw new Error(payload.message || 'No daily closing prices were returned for this ETF.');
  }

  const orderedRows = [...rows].sort(
    (left, right) => parseDate(right.date).getTime() - parseDate(left.date).getTime(),
  );
  const latestClose = parseClose(orderedRows[0].close);
  const returns = PERIODS.map((days) => {
    const prior = orderedRows[days];
    const previousClose = prior ? parseClose(prior.close) : null;
    return {
      days,
      value: previousClose ? ((latestClose - previousClose) / previousClose) * 100 : null,
      previousClose,
      previousDateLabel: prior
        ? parseDate(prior.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : null,
    };
  });
  const score = calculateScore(returns);
  if (score === null) {
    throw new Error('Not enough daily price history to calculate a 20-trading-day score.');
  }

  return {
    symbol: fund.symbol,
    latestClose,
    latestDateLabel: parseDate(orderedRows[0].date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    returns,
    score,
  };
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatReturn(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function getScoreLabel(score: number): string {
  switch (score) {
    case 1:
      return 'Do not invest today · price trend is weak';
    case 2:
      return 'Cautious · recent prices are trending lower';
    case 3:
      return 'Mixed · no clear price direction';
    case 4:
      return 'Positive · recent prices are trending higher';
    case 5:
      return 'Invest now · price trend is strong';
    default:
      return 'Price score unavailable';
  }
}
