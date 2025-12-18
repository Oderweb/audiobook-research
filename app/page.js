'use client';

import React, { useState } from 'react';
import { Download, Play, Pause, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

export default function AudiobookResearchTool() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [keywords, setKeywords] = useState('');
  const [results, setResults] = useState([]);
  const [previousResults, setPreviousResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [showMatrix, setShowMatrix] = useState(false);
  const [tokenStatus, setTokenStatus] = useState('');

  const requestAccessToken = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Please enter both Client ID and Client Secret');
      return;
    }

    setError('');
    setTokenStatus('Requesting token...');

    try {
      const response = await fetch('/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim()
        })
      });

      if (!response.ok) {
        setError('Failed to request token. Check your Client ID and Secret.');
        setTokenStatus('');
        return;
      }

      const data = await response.json();
      setAccessToken(data.access_token);
      setTokenStatus(`✓ Token active (expires in ${Math.round(data.expires_in / 60)} minutes)`);
    } catch (err) {
      setError('Error requesting token: ' + err.message);
      setTokenStatus('');
    }
  };

  const handleSearch = async () => {
    if (!accessToken.trim()) {
      setError('Please request an access token first');
      return;
    }

    const keywordList = keywords
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (keywordList.length === 0) {
      setError('Please enter at least one keyword');
      return;
    }

    setPreviousResults(results);
    setIsSearching(true);
    setError('');
    setResults([]);
    setProgress(0);

    const searchResults = [];

    for (let i = 0; i < keywordList.length; i++) {
      const keyword = keywordList[i];
      
      try {
        const response = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(keyword)}&type=audiobook&limit=50`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            setError('Token expired. Request a new one.');
            setIsSearching(false);
            return;
          }
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const audiobooks = data.audiobooks?.items || [];
        const count = data.audiobooks?.total || 0;

        const avgPopularity = audiobooks.length > 0
          ? Math.round(audiobooks.reduce((sum, book) => sum + (book.popularity || 50), 0) / audiobooks.length)
          : 50;

        const estimatedTrendsInterest = Math.min(100, Math.round((count / 5)));

        const prevResult = previousResults.find(r => r.keyword === keyword);
        const popularityTrend = prevResult ? avgPopularity - prevResult.avgPopularity : 0;
        const supplyTrend = prevResult ? count - prevResult.audiobooks : 0;

        searchResults.push({
          keyword,
          audiobooks: count,
          avgPopularity,
          estimatedTrendsInterest,
          popularityTrend,
          supplyTrend,
          timestamp: new Date().toLocaleDateString(),
          x: count,
          y: estimatedTrendsInterest,
          size: avgPopularity * 2
        });

        setResults([...searchResults]);
        setProgress(Math.round(((i + 1) / keywordList.length) * 100));

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        searchResults.push({
          keyword,
          audiobooks: -1,
          avgPopularity: 0,
          estimatedTrendsInterest: 0,
          error: err.message,
          timestamp: new Date().toLocaleDateString()
        });
        setResults([...searchResults]);
        setProgress(Math.round(((i + 1) / keywordList.length) * 100));
      }
    }

    setIsSearching(false);
    setShowMatrix(true);
  };

  const downloadCSV = () => {
    const headers = ['Keyword', 'Audiobooks Found', 'Avg Popularity', 'Estimated Trends Interest', 'Popularity Trend', 'Supply Trend', 'Status'];
    const rows = results.map(r => [
      r.keyword,
      r.error ? 'Error' : r.audiobooks,
      r.error ? '-' : r.avgPopularity,
      r.error ? '-' : r.estimatedTrendsInterest,
      r.error ? '-' : (r.popularityTrend > 0 ? '+' + r.popularityTrend : r.popularityTrend),
      r.error ? '-' : (r.supplyTrend > 0 ? '+' + r.supplyTrend : r.supplyTrend),
      r.error ? r.error : 'OK'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audiobook-research-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getOpportunityScore = (item) => {
    if (item.error) return null;
    const supply = item.audiobooks;
    const demand = item.estimatedTrendsInterest;
    return Math.round(demand / (supply + 1) * 100);
  };

  const totalAudiobooks = results.reduce((sum, r) => sum + (r.audiobooks > 0 ? r.audiobooks : 0), 0);
  const avgPopularityScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.avgPopularity || 0), 0) / results.filter(r => !r.error).length)
    : 0;
  const validResults = results.filter(r => !r.error).length;

  const sortedByOpportunity = [...results].sort((a, b) => {
    const scoreA = getOpportunityScore(a) || -1;
    const scoreB = getOpportunityScore(b) || -1;
    return scoreB - scoreA;
  });

  const topOpportunities = sortedByOpportunity.filter(r => !r.error).slice(0, 10);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Audiobook Market Research</h1>
          <p className="text-slate-400">Analyze keywords with demand/supply matrix & popularity insights</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4">Configuration</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Paste your Client ID"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:border-green-500"
                    disabled={isSearching || !!accessToken}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Client Secret
                  </label>
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="Paste your Client Secret"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:border-green-500"
                    disabled={isSearching || !!accessToken}
                  />
                </div>

                {!accessToken ? (
                  <button
                    onClick={requestAccessToken}
                    disabled={isSearching}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
                  >
                    Request Access Token
                  </button>
                ) : (
                  <div className="bg-green-900/30 border border-green-700 rounded p-3">
                    <p className="text-green-300 text-sm font-medium">{tokenStatus}</p>
                    <button
                      onClick={() => {
                        setAccessToken('');
                        setTokenStatus('');
                      }}
                      className="text-xs text-green-400 hover:underline mt-2"
                    >
                      Use different credentials
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Keywords (one per line)
                  </label>
                  <textarea
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="fantasy audiobook&#10;mystery detective&#10;sci-fi future..."
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:border-green-500 h-32 resize-none"
                    disabled={isSearching}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    {keywords.split('\n').filter(k => k.trim()).length} keywords
                  </p>
                </div>

                <button
                  onClick={handleSearch}
                  disabled={isSearching || !accessToken}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors flex items-center justify-center gap-2"
                >
                  {isSearching ? <Pause size={18} /> : <Play size={18} />}
                  {isSearching ? 'Searching...' : 'Start Research'}
                </button>

                {isSearching && (
                  <div className="space-y-2">
                    <div className="w-full bg-slate-700 rounded h-2 overflow-hidden">
                      <div
                        className="bg-green-600 h-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 text-center">{progress}% complete</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-4">
            {error && (
              <div className="bg-red-900/50 border border-red-600 rounded-lg p-4 flex gap-3">
                <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-200 font-medium">Error</p>
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              </div>
            )}

            {results.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <p className="text-slate-400 text-xs">Keywords</p>
                    <p className="text-2xl font-bold text-white">{validResults}</p>
                  </div>
                  <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <p className="text-slate-400 text-xs">Total Audiobooks</p>
                    <p className="text-2xl font-bold text-green-400">{totalAudiobooks}</p>
                  </div>
                  <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <p className="text-slate-400 text-xs">Avg Popularity</p>
                    <p className="text-2xl font-bold text-blue-400">{avgPopularityScore}</p>
                  </div>
                  <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <p className="text-slate-400 text-xs">Best Opportunity</p>
                    <p className="text-2xl font-bold text-purple-400">
                      {topOpportunities[0] ? getOpportunityScore(topOpportunities[0]) : '-'}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold text-white mb-4">Demand vs. Supply Matrix</h3>
                  <div className="h-96 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                        <XAxis 
                          type="number" 
                          dataKey="x" 
                          name="Supply (Audiobooks)" 
                          stroke="#94a3b8"
                          label={{ value: 'Supply (Audiobooks Found)', position: 'insideBottomRight', offset: -10, fill: '#cbd5e1' }}
                        />
                        <YAxis 
                          type="number" 
                          dataKey="y" 
                          name="Demand (Interest)" 
                          stroke="#94a3b8"
                          label={{ value: 'Demand (Trend Interest)', angle: -90, position: 'insideLeft', fill: '#cbd5e1' }}
                        />
                        <Tooltip 
                          cursor={{ strokeDasharray: '3 3' }}
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                          labelStyle={{ color: '#e2e8f0' }}
                          formatter={(value) => Math.round(value)}
                        />
                        <Scatter name="Keywords" data={results.filter(r => !r.error)}>
                          {results.map((entry, index) => {
                            if (entry.error) return null;
                            const opportunity = getOpportunityScore(entry);
                            let color = '#ef4444';
                            if (opportunity > 50) color = '#22c55e';
                            else if (opportunity > 20) color = '#f59e0b';
                            return <Cell key={index} fill={color} />;
                          })}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-green-900/30 border border-green-700 rounded">
                      <p className="font-semibold text-green-300">🟢 High Opportunity</p>
                      <p className="text-green-200">Low supply, high demand</p>
                    </div>
                    <div className="p-3 bg-red-900/30 border border-red-700 rounded">
                      <p className="font-semibold text-red-300">🔴 Saturated</p>
                      <p className="text-red-200">High supply, low demand</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white">Top Opportunities</h3>
                    <button
                      onClick={downloadCSV}
                      className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-sm transition-colors"
                    >
                      <Download size={16} />
                      Export CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-3 px-4 text-slate-300 font-medium">Keyword</th>
                          <th className="text-right py-3 px-4 text-slate-300 font-medium">Supply</th>
                          <th className="text-right py-3 px-4 text-slate-300 font-medium">Demand</th>
                          <th className="text-right py-3 px-4 text-slate-300 font-medium">Popularity</th>
                          <th className="text-right py-3 px-4 text-slate-300 font-medium">Trend</th>
                          <th className="text-right py-3 px-4 text-slate-300 font-medium">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topOpportunities.map((result, idx) => {
                          const opportunity = getOpportunityScore(result);
                          return (
                            <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/50">
                              <td className="py-3 px-4 text-white">{result.keyword}</td>
                              <td className="py-3 px-4 text-right text-slate-300">{result.audiobooks}</td>
                              <td className="py-3 px-4 text-right text-blue-400">{result.estimatedTrendsInterest}</td>
                              <td className="py-3 px-4 text-right text-green-400">{result.avgPopularity}</td>
                              <td className="py-3 px-4 text-right">
                                {result.popularityTrend !== 0 && (
                                  <div className="flex items-center justify-end gap-1">
                                    {result.popularityTrend > 0 ? (
                                      <TrendingUp size={14} className="text-green-400" />
                                    ) : (
                                      <TrendingDown size={14} className="text-red-400" />
                                    )}
                                    <span className={result.popularityTrend > 0 ? 'text-green-400' : 'text-red-400'}>
                                      {result.popularityTrend > 0 ? '+' : ''}{result.popularityTrend}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-purple-400">{opportunity}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold text-white mb-4">All Results</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-2 px-3 text-slate-300 font-medium">Keyword</th>
                          <th className="text-right py-2 px-3 text-slate-300 font-medium">Audiobooks</th>
                          <th className="text-right py-2 px-3 text-slate-300 font-medium">Pop.</th>
                          <th className="text-right py-2 px-3 text-slate-300 font-medium">Trends</th>
                          <th className="text-right py-2 px-3 text-slate-300 font-medium">Pop. Δ</th>
                          <th className="text-right py-2 px-3 text-slate-300 font-medium">Supply Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((result, idx) => (
                          <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/30">
                            <td className="py-2 px-3 text-white">{result.keyword}</td>
                            <td className="py-2 px-3 text-right text-slate-300">{result.error ? '-' : result.audiobooks}</td>
                            <td className="py-2 px-3 text-right text-green-400">{result.error ? '-' : result.avgPopularity}</td>
                            <td className="py-2 px-3 text-right text-blue-400">{result.error ? '-' : result.estimatedTrendsInterest}</td>
                            <td className="py-2 px-3 text-right text-xs">{result.error ? '-' : (result.popularityTrend > 0 ? '+' : '') + result.popularityTrend}</td>
                            <td className="py-2 px-3 text-right text-xs">{result.error ? '-' : (result.supplyTrend > 0 ? '+' : '') + result.supplyTrend}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {results.length === 0 && !isSearching && (
              <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 text-center">
                <p className="text-slate-400">Enter keywords and start researching to see results</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">How to Read the Data</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-300">
            <div>
              <p className="font-medium text-white mb-2">📊 Audiobooks</p>
              <p className="text-slate-400">Supply: How many audiobooks found on Spotify for this keyword</p>
            </div>
            <div>
              <p className="font-medium text-white mb-2">📈 Trends Interest</p>
              <p className="text-slate-400">Estimated demand based on audiobook count & engagement patterns</p>
            </div>
            <div>
              <p className="font-medium text-white mb-2">⭐ Popularity Score</p>
              <p className="text-slate-400">Average Spotify popularity of top audiobooks (0-100). Higher = more engagement</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}