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
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #0f172a, #1e293b, #0f172a)', padding: '24px' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Audiobook Market Research</h1>
          <p style={{ color: '#94a3b8' }}>Analyze keywords with demand/supply matrix & popularity insights</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>Configuration</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#cbd5e1', marginBottom: '8px' }}>
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Paste your Client ID"
                    style={{ width: '100%', padding: '8px 12px', backgroundColor: '#334155', border: '1px solid #475569', borderRadius: '4px', color: '#fff' }}
                    disabled={isSearching || !!accessToken}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#cbd5e1', marginBottom: '8px' }}>
                    Client Secret
                  </label>
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="Paste your Client Secret"
                    style={{ width: '100%', padding: '8px 12px', backgroundColor: '#334155', border: '1px solid #475569', borderRadius: '4px', color: '#fff' }}
                    disabled={isSearching || !!accessToken}
                  />
                </div>

                {!accessToken ? (
                  <button
                    onClick={requestAccessToken}
                    disabled={isSearching}
                    style={{ width: '100%', backgroundColor: '#2563eb', color: '#fff', fontWeight: '500', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseOver={(e) => !isSearching && (e.target.style.backgroundColor = '#1d4ed8')}
                    onMouseOut={(e) => !isSearching && (e.target.style.backgroundColor = '#2563eb')}
                  >
                    Request Access Token
                  </button>
                ) : (
                  <div style={{ backgroundColor: 'rgba(20, 83, 45, 0.3)', border: '1px solid #15803d', borderRadius: '8px', padding: '12px' }}>
                    <p style={{ color: '#86efac', fontSize: '14px', fontWeight: '500' }}>{tokenStatus}</p>
                    <button
                      onClick={() => { setAccessToken(''); setTokenStatus(''); }}
                      style={{ fontSize: '12px', color: '#4ade80', marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Use different credentials
                    </button>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#cbd5e1', marginBottom: '8px' }}>
                    Keywords (one per line)
                  </label>
                  <textarea
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="fantasy audiobook&#10;mystery detective&#10;sci-fi future..."
                    style={{ width: '100%', padding: '8px 12px', backgroundColor: '#334155', border: '1px solid #475569', borderRadius: '4px', color: '#fff', height: '128px', resize: 'none' }}
                    disabled={isSearching}
                  />
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                    {keywords.split('\n').filter(k => k.trim()).length} keywords
                  </p>
                </div>

                <button
                  onClick={handleSearch}
                  disabled={isSearching || !accessToken}
                  style={{ width: '100%', backgroundColor: '#16a34a', color: '#fff', fontWeight: '500', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: (isSearching || !accessToken) ? 0.5 : 1 }}
                  onMouseOver={(e) => !isSearching && !accessToken || (e.target.style.backgroundColor = '#15803d')}
                  onMouseOut={(e) => !isSearching && !accessToken || (e.target.style.backgroundColor = '#16a34a')}
                >
                  {isSearching ? <Pause size={18} /> : <Play size={18} />}
                  {isSearching ? 'Searching...' : 'Start Research'}
                </button>

                {isSearching && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ width: '100%', backgroundColor: '#334155', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
                      <div
                        style={{ backgroundColor: '#16a34a', height: '100%', transition: 'all 0.3s', width: `${progress}%` }}
                      />
                    </div>
                    <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center' }}>{progress}% complete</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div style={{ backgroundColor: 'rgba(127, 29, 29, 0.5)', border: '1px solid #dc2626', borderRadius: '12px', padding: '16px', display: 'flex', gap: '12px' }}>
                <AlertCircle size={20} style={{ color: '#f87171', flexShrink: 0, marginTop: '4px' }} />
                <div>
                  <p style={{ color: '#fecaca', fontWeight: '500' }}>Error</p>
                  <p style={{ color: '#fca5a5', fontSize: '14px' }}>{error}</p>
                </div>
              </div>
            )}

            {results.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Keywords', value: validResults, color: '#fff' },
                    { label: 'Total Audiobooks', value: totalAudiobooks, color: '#4ade80' },
                    { label: 'Avg Popularity', value: avgPopularityScore, color: '#60a5fa' },
                    { label: 'Best Opportunity', value: topOpportunities[0] ? getOpportunityScore(topOpportunities[0]) : '-', color: '#c084fc' }
                  ].map((stat, i) => (
                    <div key={i} style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px', border: '1px solid #334155' }}>
                      <p style={{ color: '#94a3b8', fontSize: '12px' }}>{stat.label}</p>
                      <p style={{ fontSize: '24px', fontWeight: 'bold', color: stat.color }}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>Demand vs. Supply Matrix</h3>
                  <div style={{ height: '384px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                        <XAxis type="number" dataKey="x" stroke="#94a3b8" />
                        <YAxis type="number" dataKey="y" stroke="#94a3b8" />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
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
                </div>

                <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#fff' }}>Top Opportunities</h3>
                    <button
                      onClick={downloadCSV}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#334155', color: '#fff', padding: '6px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '14px' }}
                    >
                      <Download size={16} /> Export CSV
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #334155' }}>
                          <th style={{ textAlign: 'left', padding: '12px 16px', color: '#cbd5e1', fontWeight: '500' }}>Keyword</th>
                          <th style={{ textAlign: 'right', padding: '12px 16px', color: '#cbd5e1', fontWeight: '500' }}>Supply</th>
                          <th style={{ textAlign: 'right', padding: '12px 16px', color: '#cbd5e1', fontWeight: '500' }}>Demand</th>
                          <th style={{ textAlign: 'right', padding: '12px 16px', color: '#cbd5e1', fontWeight: '500' }}>Popularity</th>
                          <th style={{ textAlign: 'right', padding: '12px 16px', color: '#cbd5e1', fontWeight: '500' }}>Trend</th>
                          <th style={{ textAlign: 'right', padding: '12px 16px', color: '#cbd5e1', fontWeight: '500' }}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topOpportunities.map((result, idx) => {
                          const opportunity = getOpportunityScore(result);
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                              <td style={{ padding: '12px 16px', color: '#fff' }}>{result.keyword}</td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#cbd5e1' }}>{result.audiobooks}</td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#60a5fa' }}>{result.estimatedTrendsInterest}</td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#4ade80' }}>{result.avgPopularity}</td>
                              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                {result.popularityTrend !== 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                    {result.popularityTrend > 0 ? (
                                      <TrendingUp size={14} style={{ color: '#4ade80' }} />
                                    ) : (
                                      <TrendingDown size={14} style={{ color: '#f87171' }} />
                                    )}
                                    <span style={{ color: result.popularityTrend > 0 ? '#4ade80' : '#f87171' }}>
                                      {result.popularityTrend > 0 ? '+' : ''}{result.popularityTrend}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#c084fc' }}>{opportunity}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {results.length === 0 && !isSearching && (
              <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '48px', border: '1px solid #334155', textAlign: 'center' }}>
                <p style={{ color: '#94a3b8' }}>Enter keywords and start researching to see results</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}