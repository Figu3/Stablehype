'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, TrendingUp, DollarSign, RefreshCw, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface Stablecoin {
  id: string;
  name: string;
  symbol: string;
  circulating?: {
    peggedUSD?: number;
  };
  chainCirculating?: Record<string, number>;
  projectType: string;
  governanceMarketCap: number;
}

interface UpcomingStablecoin {
  name: string;
  stablecoin: string;
  ticker: string;
  expectedLaunch: string;
  chains: string[];
  type: string;
  marketCap: number;
  details: string;
}

type SortField = 'rank' | 'name' | 'ticker' | 'supply' | 'marketCap' | 'type';
type SortDirection = 'asc' | 'desc';

const StablecoinTracker = () => {
  const [stablecoins, setStablecoins] = useState<Stablecoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('live');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sortField, setSortField] = useState<SortField>('supply');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const projectTypes: Record<string, string> = {
    'Tether': 'Fintech',
    'USDC': 'Fintech',
    'DAI': 'DeFi Protocol',
    'BUSD': 'Crypto Exchange',
    'FRAX': 'DeFi Protocol',
    'USDD': 'DeFi Protocol',
    'TUSD': 'Fintech',
    'USDP': 'Fintech',
    'GUSD': 'Crypto Exchange',
    'LUSD': 'DeFi Protocol',
    'sUSD': 'DeFi Protocol',
    'Liquity USD': 'DeFi Protocol',
    'Alchemix USD': 'DeFi Protocol',
    'TerraUSD': 'DeFi Protocol',
    'Fei USD': 'DeFi Protocol',
    'HUSD': 'Crypto Exchange',
    'USDK': 'Crypto Exchange',
    'OUSD': 'DeFi Protocol',
    'USDT': 'Fintech',
    'Ethena USDe': 'DeFi Protocol',
    'USDe': 'DeFi Protocol',
    'PayPal USD': 'Fintech',
    'PYUSD': 'Fintech',
    'Usual USD': 'DeFi Protocol',
    'USD0': 'DeFi Protocol',
    'USDS': 'DeFi Protocol',
    'GHO': 'DeFi Protocol',
    'crvUSD': 'DeFi Protocol',
    'FDUSD': 'Fintech',
    'RLUSD': 'Crypto Protocol',
    'Ripple USD': 'Crypto Protocol'
  };

  // Market caps in billions USD - from CoinGecko, Yahoo Finance, or last known valuations
  const governanceMarketCaps: Record<string, number> = {
    'Tether': 500, // Tether rumored valuation $500B
    'USDC': 30, // Circle (CRCL ticker) IPO market cap from Yahoo Finance
    'DAI': 5.2, // MKR market cap from CoinGecko
    'BUSD': 0, // Discontinued
    'FRAX': 0.15, // FXS market cap from CoinGecko
    'USDD': 0.12, // TRX ecosystem (estimated)
    'TUSD': 1.2, // TrustToken estimated valuation
    'USDP': 2.4, // Paxos last valuation 2021
    'GUSD': 7.1, // Gemini last valuation 2021
    'LUSD': 0.09, // LQTY market cap from CoinGecko
    'sUSD': 0.18, // SNX market cap from CoinGecko
    'Liquity USD': 0.09, // LQTY market cap
    'Alchemix USD': 0.03, // ALCX market cap from CoinGecko
    'Fei USD': 0, // Deprecated
    'USDT': 500, // Tether rumored valuation $500B
    'Ethena USDe': 0.7, // ENA market cap from CoinGecko
    'USDe': 0.7, // ENA market cap
    'PayPal USD': 80, // PayPal market cap from Yahoo Finance (~$80B)
    'PYUSD': 80, // PayPal market cap
    'Usual USD': 0.25, // USUAL token market cap from CoinGecko
    'USD0': 0.12, // Estimated based on protocol
    'USDS': 5.2, // Same as DAI (MakerDAO/Sky)
    'GHO': 5.5, // AAVE market cap from CoinGecko
    'crvUSD': 0.8, // CRV market cap from CoinGecko
    'FDUSD': 0.8, // First Digital estimated valuation
    'RLUSD': 35, // Ripple valuation (~$35B rumored 2024)
    'Ripple USD': 35, // Ripple valuation
    'USDY': 0.3, // Ondo Finance valuation
    'USTB': 0.3, // Ondo Finance valuation
    'BUIDL': 10.2, // BlackRock fund value
    'USDm': 0.05, // Mountain Protocol valuation
    'EURC': 30, // Circle EURC (same as USDC - CRCL)
    'EURI': 0.02, // Monerium valuation
    'STEUR': 0.01 // Stasis estimated
  };

  const upcomingStablecoins: UpcomingStablecoin[] = [
    {
      name: 'Cloudflare',
      stablecoin: 'NET Dollar',
      ticker: 'NET',
      expectedLaunch: 'Q4 2025',
      chains: ['Multiple Chains'],
      type: 'Tech Company',
      marketCap: 76,
      details: 'AI-powered agentic payments, announced September 25, 2025'
    },
    {
      name: 'Tether',
      stablecoin: 'USA₮ (US Regulated)',
      ticker: 'USAT',
      expectedLaunch: 'Q4 2025',
      chains: ['Ethereum', 'Multiple Chains'],
      type: 'Fintech',
      marketCap: 500,
      details: 'US-regulated stablecoin by Tether, announced September 2025'
    },
    {
      name: 'Stripe',
      stablecoin: 'Stripe Stablecoin (via Bridge)',
      ticker: 'TBD',
      expectedLaunch: 'Live (Expanding)',
      chains: ['Multiple Chains'],
      type: 'Fintech',
      marketCap: 70,
      details: '$1.1B Bridge acquisition completed Feb 2025, Stablecoin Financial Accounts live'
    },
    {
      name: 'Apple',
      stablecoin: 'Apple Pay Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q2-Q3 2026',
      chains: ['Ethereum', 'Polygon'],
      type: 'Tech Company',
      marketCap: 3450,
      details: 'Exploring integration into Apple Pay since January 2025'
    },
    {
      name: 'Google/Alphabet',
      stablecoin: 'Google Cloud Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q3 2026',
      chains: ['Multiple Chains'],
      type: 'Tech Company',
      marketCap: 2100,
      details: 'Google Cloud actively exploring stablecoin integration'
    },
    {
      name: 'Meta (Facebook)',
      stablecoin: 'Meta Stablecoin (Libra 2.0)',
      ticker: 'TBD',
      expectedLaunch: 'Q2 2026',
      chains: ['Ethereum', 'Custom Chain'],
      type: 'Tech Company',
      marketCap: 1400,
      details: 'Re-exploring stablecoins after Diem shutdown, May 2025'
    },
    {
      name: 'X (Twitter)',
      stablecoin: 'X Money Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q1 2026',
      chains: ['Ethereum'],
      type: 'Tech Company',
      marketCap: 44,
      details: 'Exploring integration into X Money app with Stripe'
    },
    {
      name: 'Uber',
      stablecoin: 'Uber Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q2-Q3 2026',
      chains: ['Ethereum', 'Polygon'],
      type: 'Tech Company',
      marketCap: 165,
      details: 'CEO confirmed study phase for global money transfers, June 2025'
    },
    {
      name: 'Airbnb',
      stablecoin: 'Airbnb Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q3 2026',
      chains: ['Ethereum'],
      type: 'Travel',
      marketCap: 95,
      details: 'Talks with Worldpay since early 2025 to reduce card fees'
    },
    {
      name: 'Mastercard',
      stablecoin: 'Mastercard Stablecoin Network',
      ticker: 'Multiple',
      expectedLaunch: 'Live (Expanding)',
      chains: ['Mastercard MTN', 'Ethereum'],
      type: 'Payment Network',
      marketCap: 465,
      details: 'Enabling USDG, PYUSD, USDC, FIUSD on network, June 2025'
    },
    {
      name: 'JPMorgan + BofA + Citi + Wells Fargo',
      stablecoin: 'Joint Bank Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q2-Q3 2026',
      chains: ['Ethereum', 'Private Blockchains'],
      type: 'Bank',
      marketCap: 520,
      details: 'Joint venture by 4 major US banks announced May 2025'
    },
    {
      name: 'Standard Chartered',
      stablecoin: 'Hong Kong Dollar Stablecoin',
      ticker: 'HKD',
      expectedLaunch: 'Q1-Q2 2026',
      chains: ['Ethereum', 'Polygon'],
      type: 'Bank',
      marketCap: 78,
      details: 'HKD-pegged stablecoin announced February 2025'
    },
    {
      name: 'Walmart',
      stablecoin: 'Walmart Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q3 2026',
      chains: ['Ethereum', 'Polygon'],
      type: 'Retail',
      marketCap: 612,
      details: 'Exploring stablecoin to reduce payment fees'
    },
    {
      name: 'Amazon',
      stablecoin: 'Amazon Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q3 2026',
      chains: ['Ethereum', 'Multiple Chains'],
      type: 'Retail',
      marketCap: 1900,
      details: 'Exploring stablecoin for e-commerce payments'
    },
    {
      name: 'Revolut',
      stablecoin: 'Revolut Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q4 2025 - Q1 2026',
      chains: ['Ethereum', 'Polygon'],
      type: 'Fintech',
      marketCap: 48,
      details: 'Neobank actively exploring stablecoin launch'
    },
    {
      name: 'Expedia Group',
      stablecoin: 'Expedia Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q2 2026',
      chains: ['Ethereum'],
      type: 'Travel',
      marketCap: 18,
      details: 'Travel giant considering stablecoin for payments'
    },
    {
      name: 'Cardano',
      stablecoin: 'Privacy Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q2 2026',
      chains: ['Cardano'],
      type: 'Crypto Protocol',
      marketCap: 28,
      details: 'First privacy-focused stablecoin announced May 2025'
    },
    {
      name: 'BBVA',
      stablecoin: 'BBVA Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q4 2025',
      chains: ['Visa Tokenized Asset Platform'],
      type: 'Bank',
      marketCap: 52,
      details: 'Spanish bank testing fiat-backed stablecoin on Visa platform'
    },
    {
      name: 'Bank of America',
      stablecoin: 'BofA Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q3 2026',
      chains: ['Ethereum', 'Private Chains'],
      type: 'Bank',
      marketCap: 325,
      details: 'CEO confirmed readiness pending regulatory clarity'
    },
    {
      name: 'Citigroup',
      stablecoin: 'Citi Stablecoin',
      ticker: 'TBD',
      expectedLaunch: 'Q2-Q3 2026',
      chains: ['Ethereum', 'Private Chains'],
      type: 'Bank',
      marketCap: 115,
      details: 'Actively exploring issuance as of May 2025'
    },
    {
      name: 'ADQ + First Abu Dhabi Bank',
      stablecoin: 'Dirham Stablecoin',
      ticker: 'AED',
      expectedLaunch: 'Q2 2026',
      chains: ['Ethereum', 'ADGM Networks'],
      type: 'Bank',
      marketCap: 85,
      details: 'UAE dirham-pegged stablecoin announced April 2025'
    },
    {
      name: 'Japan Project Pax',
      stablecoin: 'Japanese Yen Stablecoin',
      ticker: 'JPY',
      expectedLaunch: 'Q3 2026',
      chains: ['Ethereum'],
      type: 'Bank',
      marketCap: 45,
      details: 'Multi-bank collaboration for cross-border payments'
    },
    {
      name: 'Société Générale',
      stablecoin: 'CoinVertible EUR',
      ticker: 'EURCV',
      expectedLaunch: 'Live (Expanding)',
      chains: ['Ethereum'],
      type: 'Bank',
      marketCap: 62,
      details: 'Institutional EUR stablecoin with limited circulation'
    }
  ];

  const fetchStablecoins = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true');

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`);
      }

      const data = await response.json();

      if (data && data.peggedAssets) {
        const enrichedData = data.peggedAssets.map((coin: Stablecoin) => {
          const projectName = coin.name;
          return {
            ...coin,
            projectType: projectTypes[projectName] || 'Crypto Protocol',
            governanceMarketCap: governanceMarketCaps[projectName] || 0
          };
        });

        setStablecoins(enrichedData);
        setLastUpdate(new Date());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching stablecoins:', err);
    } finally {
      setLoading(false);
    }
  }, [projectTypes, governanceMarketCaps]);

  useEffect(() => {
    fetchStablecoins();
    const interval = setInterval(fetchStablecoins, 300000);
    return () => clearInterval(interval);
  }, [fetchStablecoins]);

  const filteredStablecoins = useMemo(() => {
    // Filter by search term
    const filtered = stablecoins.filter(coin =>
      coin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coin.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sort the filtered results
    filtered.sort((a, b) => {
      let aValue: number | string = 0;
      let bValue: number | string = 0;

      switch (sortField) {
        case 'supply':
          aValue = a.circulating?.peggedUSD || 0;
          bValue = b.circulating?.peggedUSD || 0;
          break;
        case 'marketCap':
          aValue = a.governanceMarketCap || 0;
          bValue = b.governanceMarketCap || 0;
          break;
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'ticker':
          aValue = a.symbol.toLowerCase();
          bValue = b.symbol.toLowerCase();
          break;
        case 'type':
          aValue = a.projectType.toLowerCase();
          bValue = b.projectType.toLowerCase();
          break;
        default:
          aValue = a.circulating?.peggedUSD || 0;
          bValue = b.circulating?.peggedUSD || 0;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      } else {
        const strA = String(aValue);
        const strB = String(bValue);
        return sortDirection === 'asc'
          ? strA.localeCompare(strB)
          : strB.localeCompare(strA);
      }
    });

    return filtered;
  }, [stablecoins, searchTerm, sortField, sortDirection]);

  const totalTVL = useMemo(() => {
    return filteredStablecoins.reduce((sum, coin) => sum + (coin.circulating?.peggedUSD || 0), 0);
  }, [filteredStablecoins]);

  const totalGovernanceMarketCap = useMemo(() => {
    return filteredStablecoins.reduce((sum, coin) => sum + (coin.governanceMarketCap || 0), 0);
  }, [filteredStablecoins]);

  const upcomingTotalMarketCap = useMemo(() => {
    return upcomingStablecoins.reduce((sum, coin) => sum + coin.marketCap, 0);
  }, [upcomingStablecoins]);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(num));
  };

  const getChainsList = (chains: Record<string, number> | undefined) => {
    if (!chains || typeof chains !== 'object') return 'N/A';

    // Priority order for chains
    const priorityChains = ['Ethereum', 'Hyperliquid', 'Plasma', 'Arbitrum', 'BNB', 'Base'];

    const chainEntries = Object.entries(chains);
    if (chainEntries.length === 0) return 'N/A';

    // Sort chains: priority chains first (in order), then by size
    const sortedChains = chainEntries
      .sort(([nameA, sizeA], [nameB, sizeB]) => {
        const priorityA = priorityChains.indexOf(nameA);
        const priorityB = priorityChains.indexOf(nameB);

        // If both are priority chains, sort by priority order
        if (priorityA !== -1 && priorityB !== -1) {
          return priorityA - priorityB;
        }
        // Priority chain comes first
        if (priorityA !== -1) return -1;
        if (priorityB !== -1) return 1;

        // For non-priority chains, sort by size
        return sizeB - sizeA;
      })
      .map(([name]) => name);

    if (sortedChains.length <= 3) return sortedChains.join(', ');
    return `${sortedChains.slice(0, 3).join(', ')} +${sortedChains.length - 3}`;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'supply' || field === 'marketCap' ? 'desc' : 'asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 inline ml-1" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4 inline ml-1" />
      : <ArrowDown className="w-4 h-4 inline ml-1" />;
  };

  if (loading && stablecoins.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-xl font-semibold text-gray-700">Loading stablecoin data from DeFi Llama...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Stablehype - Live Stablecoin Tracker</h1>
          <p className="text-gray-600 text-sm md:text-base">Real-time tracking of all stablecoin supplies powered by DeFi Llama API</p>
          {lastUpdate && (
            <p className="text-sm text-gray-500 mt-2">
              Last updated: {lastUpdate.toLocaleString()}
            </p>
          )}
        </div>

        <div className="mb-6 flex gap-2 md:gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-4 md:px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'live'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Live Stablecoins
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-4 md:px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'upcoming'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Upcoming Stablecoins
          </button>
        </div>

        {activeTab === 'live' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 border-l-4 border-indigo-500">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs md:text-sm font-medium text-gray-600 mb-1">Total Stablecoin Supply</p>
                    <p className="text-2xl md:text-3xl font-bold text-gray-900">{formatNumber(totalTVL)}</p>
                    <p className="text-xs md:text-sm text-gray-500 mt-1">{filteredStablecoins.length} stablecoins</p>
                  </div>
                  <DollarSign className="w-10 h-10 md:w-12 md:h-12 text-indigo-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 border-l-4 border-green-500">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs md:text-sm font-medium text-gray-600 mb-1">Total Governance Market Cap</p>
                    <p className="text-2xl md:text-3xl font-bold text-gray-900">{formatNumber(totalGovernanceMarketCap * 1e9)}</p>
                    <p className="text-xs md:text-sm text-gray-500 mt-1">Combined valuation</p>
                  </div>
                  <TrendingUp className="w-10 h-10 md:w-12 md:h-12 text-green-500" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mb-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search by name or ticker..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <button
                  onClick={fetchStablecoins}
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2 justify-center"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh Data
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-700 font-semibold">Error loading data</p>
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('rank')}
                      >
                        Rank {getSortIcon('rank')}
                      </th>
                      <th
                        className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('name')}
                      >
                        Project / Stablecoin {getSortIcon('name')}
                      </th>
                      <th
                        className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('ticker')}
                      >
                        Ticker {getSortIcon('ticker')}
                      </th>
                      <th
                        className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('supply')}
                      >
                        Supply (TVL) {getSortIcon('supply')}
                      </th>
                      <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Chains
                      </th>
                      <th
                        className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('type')}
                      >
                        Type {getSortIcon('type')}
                      </th>
                      <th
                        className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('marketCap')}
                      >
                        Market Cap {getSortIcon('marketCap')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredStablecoins.map((coin, index) => (
                      <tr key={coin.id || index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className="font-semibold text-gray-700 text-sm md:text-base">#{index + 1}</div>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className="font-semibold text-gray-900 text-sm md:text-base">{coin.name}</div>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <span className="px-2 md:px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs md:text-sm font-medium">
                            {coin.symbol}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className="font-semibold text-gray-900 text-sm md:text-base">
                            ${formatNumber(coin.circulating?.peggedUSD || 0)}
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className="text-xs md:text-sm text-gray-600">
                            {getChainsList(coin.chainCirculating)}
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium ${
                            coin.projectType === 'DeFi Protocol' ? 'bg-purple-100 text-purple-800' :
                            coin.projectType === 'Fintech' ? 'bg-blue-100 text-blue-800' :
                            coin.projectType === 'Crypto Exchange' ? 'bg-green-100 text-green-800' :
                            coin.projectType === 'Bank' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {coin.projectType}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className="font-semibold text-gray-900 text-sm md:text-base">
                            {coin.governanceMarketCap > 0 ? `$${formatNumber(coin.governanceMarketCap * 1e9)}` : 'Private'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 border-l-4 border-indigo-500">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs md:text-sm font-medium text-gray-600 mb-1">Current Total Market Cap</p>
                    <p className="text-2xl md:text-3xl font-bold text-gray-900">${formatNumber(totalGovernanceMarketCap * 1e9)}</p>
                    <p className="text-xs md:text-sm text-gray-500 mt-1">{filteredStablecoins.length} live stablecoins</p>
                  </div>
                  <DollarSign className="w-10 h-10 md:w-12 md:h-12 text-indigo-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 border-l-4 border-purple-500">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs md:text-sm font-medium text-gray-600 mb-1">Upcoming Market Cap</p>
                    <p className="text-2xl md:text-3xl font-bold text-gray-900">${formatNumber(upcomingTotalMarketCap * 1e9)}</p>
                    <p className="text-xs md:text-sm text-gray-500 mt-1">{upcomingStablecoins.length} upcoming stablecoins</p>
                  </div>
                  <TrendingUp className="w-10 h-10 md:w-12 md:h-12 text-purple-500" />
                </div>
              </div>
            </div>

            {/* Market Cap Comparison Bar Chart */}
            <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mb-6 md:mb-8">
              <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Market Cap Comparison</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Current Live Stablecoins</span>
                    <span className="text-sm font-semibold text-indigo-600">${formatNumber(totalGovernanceMarketCap * 1e9)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-8 rounded-full flex items-center justify-end pr-3"
                      style={{
                        width: `${(totalGovernanceMarketCap / (totalGovernanceMarketCap + upcomingTotalMarketCap)) * 100}%`
                      }}
                    >
                      <span className="text-xs font-bold text-white">
                        {((totalGovernanceMarketCap / (totalGovernanceMarketCap + upcomingTotalMarketCap)) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Upcoming Stablecoins</span>
                    <span className="text-sm font-semibold text-purple-600">${formatNumber(upcomingTotalMarketCap * 1e9)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-purple-600 h-8 rounded-full flex items-center justify-end pr-3"
                      style={{
                        width: `${(upcomingTotalMarketCap / (totalGovernanceMarketCap + upcomingTotalMarketCap)) * 100}%`
                      }}
                    >
                      <span className="text-xs font-bold text-white">
                        {((upcomingTotalMarketCap / (totalGovernanceMarketCap + upcomingTotalMarketCap)) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-gray-900">Total Combined Market Cap</span>
                    <span className="text-base font-bold text-gray-900">
                      ${formatNumber((totalGovernanceMarketCap + upcomingTotalMarketCap) * 1e9)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Ticker
                      </th>
                      <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Launch
                      </th>
                      <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Chains
                      </th>
                      <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Valuation
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {upcomingStablecoins.map((coin, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className="font-semibold text-gray-900 text-sm md:text-base">{coin.name}</div>
                          <div className="text-xs md:text-sm text-gray-500">{coin.stablecoin}</div>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <span className="px-2 md:px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs md:text-sm font-medium">
                            {coin.ticker}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <span className="px-2 md:px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium whitespace-nowrap">
                            {coin.expectedLaunch}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className="text-xs md:text-sm text-gray-600">
                            {coin.chains.slice(0, 2).join(', ')}
                            {coin.chains.length > 2 && ` +${coin.chains.length - 2}`}
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium ${
                            coin.type === 'DeFi Protocol' ? 'bg-purple-100 text-purple-800' :
                            coin.type === 'Fintech' ? 'bg-blue-100 text-blue-800' :
                            coin.type === 'Crypto Protocol' ? 'bg-green-100 text-green-800' :
                            coin.type === 'Bank' ? 'bg-yellow-100 text-yellow-800' :
                            coin.type === 'Retail' ? 'bg-pink-100 text-pink-800' :
                            coin.type === 'Travel' ? 'bg-teal-100 text-teal-800' :
                            coin.type === 'Payment Network' ? 'bg-indigo-100 text-indigo-800' :
                            coin.type === 'Tech Company' ? 'bg-cyan-100 text-cyan-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {coin.type}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className="font-semibold text-gray-900 text-sm md:text-base">
                            {coin.marketCap > 0 ? formatNumber(coin.marketCap * 1e9) : 'Private'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-800 font-semibold text-sm">Note on Upcoming Stablecoins</p>
                  <p className="text-blue-700 text-sm mt-1">
                    Launch dates are estimates based on public announcements. Actual launches depend on regulatory approval (GENIUS Act),
                    technical readiness, and market conditions. Some projects are in exploratory phases.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>Data powered by <a href="https://defillama.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">DeFi Llama API</a></p>
          <p className="mt-1">© 2025 Stablehype. Track live and upcoming stablecoins.</p>
        </div>
      </div>
    </div>
  );
};

export default StablecoinTracker;
