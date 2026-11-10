import AsyncStorage from '@react-native-async-storage/async-storage';

export type ETF = {
  symbol: string;
  name: string;
  isin?: string;
  ticker?: string;
  issuer?: string;
  ucits?: boolean;
  distributionPolicy?: string;
  fundCurrency?: string;
  tradingCurrency?: string;
};

type JustETFRow = {
  isin?: string;
  ticker?: string;
  name?: string;
  distributionPolicy?: string;
  fundCurrency?: string;
};

type JustETFDirectoryResponse = {
  recordsFiltered?: number;
  data?: JustETFRow[];
};

type JustETFTableConfig = {
  fetchCallbackUrl: string;
};

type YahooSearchQuote = {
  symbol?: string;
  quoteType?: string;
  longname?: string;
  shortname?: string;
};

type YahooSearchResponse = {
  quotes?: YahooSearchQuote[];
};

type YahooChartResponse = {
  chart?: {
    error?: { description?: string } | null;
    result?: {
      meta?: {
        currency?: string;
        exchangeTimezoneName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: {
          close?: (number | null)[];
        }[];
      };
    }[];
  };
};

export type PeriodReturn = {
  days: number;
  value: number | null;
  previousClose: number | null;
  previousDateLabel: string | null;
};

export type MarketSnapshot = {
  symbol: string;
  currency: string;
  latestClose: number;
  latestDateLabel: string;
  returns: PeriodReturn[];
  score: number;
  trendImproving: boolean;
};

const PERIODS = [1, 5, 20] as const;
const MIN_TREND_IMPROVEMENT = 0.1;
const JUSTETF_DIRECTORY_URL = 'https://www.justetf.com/en/search.html?assetClass=class-equity';
const ETF_DIRECTORY_CACHE_KEY = '@daymark/european-equity-etf-directory-v1';
const ETF_DIRECTORY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const ETF_DIRECTORY_PAGE_SIZE = 500;
const ETF_DIRECTORY_WORKERS = 4;

const EUROPEAN_SYMBOL_SUFFIXES = [
  '.DE',
  '.L',
  '.PA',
  '.AS',
  '.MI',
  '.SW',
  '.F',
  '.BR',
  '.MC',
  '.VI',
  '.ST',
  '.HE',
  '.CO',
  '.OL',
  '.LS',
  '.IR',
];

function getIssuer(name: string): string {
  const issuers = [
    'BNP Paribas',
    'JPMorgan',
    'Xtrackers',
    'WisdomTree',
    'Franklin',
    'iShares',
    'Vanguard',
    'Amundi',
    'Invesco',
    'SPDR',
    'HSBC',
    'UBS',
    'VanEck',
    'L&G',
  ];
  return (
    issuers.find((issuer) => name.toLowerCase().startsWith(issuer.toLowerCase())) ??
    name.split(/\s+/)[0]
  );
}

function parseETFDirectoryRows(rows: JustETFRow[]): ETF[] {
  const fundsByISIN = new Map<string, ETF>();
  for (const row of rows) {
    const isin = row.isin?.trim().toUpperCase();
    const ticker = row.ticker?.trim().toUpperCase();
    const name = row.name?.trim();
    if (!isin || !ticker || !name || fundsByISIN.has(isin)) continue;
    fundsByISIN.set(isin, {
      symbol: ticker,
      ticker,
      isin,
      name,
      issuer: getIssuer(name),
      ucits: /\bUCITS\b/i.test(name),
      distributionPolicy: row.distributionPolicy?.trim(),
      fundCurrency: row.fundCurrency?.trim().toUpperCase(),
    });
  }
  return [...fundsByISIN.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
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
        fund.name.length > 0 &&
        (fund.isin === undefined || typeof fund.isin === 'string'),
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
          onProgress?.(1, 1);
          return cached.funds;
        }
      } catch {
        // A bad cache is replaced by a fresh copy from justETF.
      }
    }
  }

  const pageResponse = await fetch(JUSTETF_DIRECTORY_URL, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
    credentials: 'include',
  });
  if (!pageResponse.ok) {
    throw new Error(`justETF returned ${pageResponse.status} while opening its ETF directory.`);
  }
  const pageHTML = await pageResponse.text();
  const configMatch = pageHTML.match(
    /etfsTablePanelInit\('etfsTablePanel',\s*(\{.*?\})\);/s,
  );
  if (!configMatch) {
    throw new Error('justETF did not return its ETF directory configuration. Try again later.');
  }
  const config = JSON.parse(configMatch[1]) as JustETFTableConfig;
  if (typeof config.fetchCallbackUrl !== 'string') {
    throw new Error('justETF returned an invalid ETF directory configuration.');
  }

  const callbackURL = new URL(config.fetchCallbackUrl, JUSTETF_DIRECTORY_URL);
  const directoryCookies = pageResponse.headers.get('set-cookie');
  const cookieHeader = directoryCookies
    ?.split(/,(?=\s*[^;,\s]+=)/)
    .map((cookie) => cookie.split(';', 1)[0].trim())
    .filter(Boolean)
    .join('; ');
  const fetchPage = async (start: number): Promise<JustETFDirectoryResponse> => {
    const body = new URLSearchParams({
      draw: String(Math.floor(start / ETF_DIRECTORY_PAGE_SIZE) + 1),
      start: String(start),
      length: String(ETF_DIRECTORY_PAGE_SIZE),
      'search[value]': '',
      'search[regex]': 'false',
      'order[0][column]': '3',
      'order[0][dir]': 'desc',
      ajaxsortOrder: 'desc',
      ajaxsortField: 'fundSize',
      lang: 'en',
      country: 'XE',
      defaultCurrency: 'EUR',
      universeType: 'private',
      etfsParams: 'groupField=none',
    });
    const headers: Record<string, string> = {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: 'https://www.justetf.com',
      Referer: JUSTETF_DIRECTORY_URL,
    };
    if (cookieHeader) headers.Cookie = cookieHeader;
    const response = await fetch(callbackURL.toString(), {
      method: 'POST',
      headers,
      body: body.toString(),
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`justETF directory request returned ${response.status}. Try again.`);
    }
    const payload = (await response.json()) as JustETFDirectoryResponse;
    if (
      typeof payload.recordsFiltered !== 'number' ||
      !Array.isArray(payload.data) ||
      payload.data.length === 0
    ) {
      throw new Error('justETF returned an invalid European ETF directory page.');
    }
    return payload;
  };

  const firstPayload = await fetchPage(0);
  const totalRecords = firstPayload.recordsFiltered;
  const firstRows = firstPayload.data;
  if (
    typeof totalRecords !== 'number' ||
    !Number.isInteger(totalRecords) ||
    totalRecords < 1
  ) {
    throw new Error('justETF returned an empty European ETF directory.');
  }
  if (!firstRows?.length) {
    throw new Error('justETF returned an empty European ETF directory page.');
  }
  const pageCount = Math.ceil(totalRecords / ETF_DIRECTORY_PAGE_SIZE);
  const rows = [...firstRows];
  let nextOffsetIndex = 0;
  let loadedPages = 1;
  onProgress?.(loadedPages, pageCount);

  const workers = Array.from(
    { length: Math.min(ETF_DIRECTORY_WORKERS, pageCount - 1) },
    async () => {
      while (nextOffsetIndex < pageCount - 1) {
        const pageIndex = nextOffsetIndex;
        nextOffsetIndex += 1;
        const payload = await fetchPage((pageIndex + 1) * ETF_DIRECTORY_PAGE_SIZE);
        rows.push(...payload.data!);
        loadedPages += 1;
        onProgress?.(loadedPages, pageCount);
      }
    },
  );
  await Promise.all(workers);

  const funds = parseETFDirectoryRows(rows);
  if (funds.length === 0) {
    throw new Error('justETF did not return any usable European equity ETFs.');
  }

  await AsyncStorage.setItem(
    ETF_DIRECTORY_CACHE_KEY,
    JSON.stringify({ savedAt: Date.now(), funds }),
  );
  return funds;
}

function calculateScore(
  returns: PeriodReturn[],
): { score: number; trendImproving: boolean } | null {
  if (returns.some((item) => item.value === null)) {
    return null;
  }

  const [oneDay, fiveDay, twentyDay] = returns.map((item) => item.value!);
  const weightedMomentum = oneDay * 0.2 + fiveDay * 0.3 + twentyDay * 0.5;
  let score = 1;
  if (weightedMomentum >= 2) score = 5;
  else if (weightedMomentum > 0.5) score = 4;
  else if (weightedMomentum >= -0.5) score = 3;
  else if (weightedMomentum > -2) score = 2;

  const priorFifteenDayReturn =
    (1 + twentyDay / 100) / (1 + fiveDay / 100) - 1;
  const priorFiveDayEquivalent = (Math.pow(1 + priorFifteenDayReturn, 1 / 3) - 1) * 100;
  const trendImproving = fiveDay - priorFiveDayEquivalent >= MIN_TREND_IMPROVEMENT;

  return {
    score: Math.min(5, score + (trendImproving ? 1 : 0)),
    trendImproving,
  };
}

function europeanSymbolRank(symbol: string): number {
  const suffix = EUROPEAN_SYMBOL_SUFFIXES.find((item) => symbol.toUpperCase().endsWith(item));
  return suffix ? EUROPEAN_SYMBOL_SUFFIXES.indexOf(suffix) : Number.MAX_SAFE_INTEGER;
}

async function searchYahooETFs(query: string): Promise<YahooSearchQuote[]> {
  const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
  url.searchParams.set('q', query);
  url.searchParams.set('quotesCount', '30');
  url.searchParams.set('newsCount', '0');
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Yahoo Finance search returned ${response.status}. Try again.`);
  }
  const payload = (await response.json()) as YahooSearchResponse;
  return (payload.quotes ?? []).filter(
    (quote) =>
      quote.quoteType === 'ETF' &&
      typeof quote.symbol === 'string' &&
      europeanSymbolRank(quote.symbol) < Number.MAX_SAFE_INTEGER,
  );
}

export async function resolveYahooListing(fund: ETF): Promise<ETF> {
  if (europeanSymbolRank(fund.symbol) < Number.MAX_SAFE_INTEGER) return fund;

  const queries = [fund.name, fund.ticker].filter(
    (query): query is string => typeof query === 'string' && query.length > 0,
  );
  for (const query of queries) {
    const quotes = await searchYahooETFs(query);
    if (quotes.length === 0) continue;

    const normalizedName = fund.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    quotes.sort((left, right) => {
      const leftName = (left.longname ?? left.shortname ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const rightName = (right.longname ?? right.shortname ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const leftMatch = leftName === normalizedName ? 0 : leftName.includes(normalizedName) ? 1 : 2;
      const rightMatch = rightName === normalizedName ? 0 : rightName.includes(normalizedName) ? 1 : 2;
      return leftMatch - rightMatch ||
        europeanSymbolRank(left.symbol!) - europeanSymbolRank(right.symbol!);
    });

    const symbol = quotes[0].symbol;
    if (symbol) return { ...fund, symbol };
  }

  throw new Error(
    `Yahoo Finance could not find a European exchange listing for ${fund.name}.`,
  );
}

function formatTradingDate(
  timestamp: number,
  timezone: string | undefined,
  includeYear = false,
): string {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
    ...(timezone ? { timeZone: timezone } : {}),
  };
  return new Intl.DateTimeFormat(undefined, options).format(new Date(timestamp * 1000));
}

export async function fetchMarketSnapshot(fund: ETF): Promise<MarketSnapshot> {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(fund.symbol)}`,
  );
  url.searchParams.set('range', '3mo');
  url.searchParams.set('interval', '1d');
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status}. Pull down to try again.`);
  }

  const payload = (await response.json()) as YahooChartResponse;
  const chart = payload.chart?.result?.[0];
  if (!chart) {
    throw new Error(
      payload.chart?.error?.description ||
        `Yahoo Finance returned no daily prices for ${fund.symbol}.`,
    );
  }
  const currency = chart.meta?.currency;
  const timestamps = chart.timestamp;
  const closes = chart.indicators?.quote?.[0]?.close;
  if (!currency || !timestamps || !closes || timestamps.length !== closes.length) {
    throw new Error(`Yahoo Finance returned incomplete price history for ${fund.symbol}.`);
  }
  const orderedRows = timestamps
    .map((timestamp, index) => ({ timestamp, close: closes[index] }))
    .filter(
      (row): row is { timestamp: number; close: number } =>
        Number.isFinite(row.timestamp) &&
        typeof row.close === 'number' &&
        Number.isFinite(row.close) &&
        row.close > 0,
    )
    .sort((left, right) => right.timestamp - left.timestamp);
  if (orderedRows.length <= PERIODS[PERIODS.length - 1]) {
    throw new Error(`Not enough daily price history to calculate a score for ${fund.symbol}.`);
  }
  const latestClose = orderedRows[0].close;
  const returns = PERIODS.map((days) => {
    const prior = orderedRows[days];
    const previousClose = prior?.close ?? null;
    return {
      days,
      value: previousClose ? ((latestClose - previousClose) / previousClose) * 100 : null,
      previousClose,
      previousDateLabel: prior
        ? formatTradingDate(prior.timestamp, chart.meta?.exchangeTimezoneName)
        : null,
    };
  });
  const calculation = calculateScore(returns);
  if (calculation === null) {
    throw new Error('Not enough daily price history to calculate a 20-trading-day score.');
  }

  return {
    symbol: fund.symbol,
    currency,
    latestClose,
    latestDateLabel: formatTradingDate(
      orderedRows[0].timestamp,
      chart.meta?.exchangeTimezoneName,
      true,
    ),
    returns,
    score: calculation.score,
    trendImproving: calculation.trendImproving,
  };
}

export function formatPrice(price: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatReturn(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function getScoreLabel(score: number, trendImproving = false): string {
  if (trendImproving) {
    return 'Momentum improving · recent prices are outperforming their prior pace';
  }

  switch (score) {
    case 1:
      return 'Very weak · historical price momentum';
    case 2:
      return 'Weak · historical price momentum';
    case 3:
      return 'Mixed · no clear price direction';
    case 4:
      return 'Positive · recent prices are trending higher';
    case 5:
      return 'Strong · positive historical momentum';
    default:
      return 'Price score unavailable';
  }
}
