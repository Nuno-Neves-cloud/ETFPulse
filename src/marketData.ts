export type ETF = {
  symbol: string;
  name: string;
  description: string;
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

function dateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    headers: {
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://www.nasdaq.com',
      Referer: 'https://www.nasdaq.com/',
    },
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
