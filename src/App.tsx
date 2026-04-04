import React, { useState, useRef } from 'react';
import { Header } from './components/Header';
import { StatsPanel } from './components/StatsPanel';
import { ThreeVisualizer, ThreeVisualizerRef } from './components/ThreeVisualizer';
import { fetchGitHubContributions } from './github';
import { calculateStats } from './utils/stats';

function App() {
  const [username, setUsername] = useState('iamvishaal491');
  const [theme, setTheme] = useState('isometric');
  const [visualizing, setVisualizing] = useState(false);
  const [stats, setStats] = useState({ total: 0, bestStreak: 0, highestDay: 0, average: 0 });
  const [loading, setLoading] = useState(false);
  
  const visualizerRef = useRef<ThreeVisualizerRef>(null);

  const handleVisualize = async () => {
    if (!username.trim()) return;
    
    setLoading(true);
    try {
      const data = await fetchGitHubContributions(username);
      
      // Update Stats
      const computedStats = calculateStats(data);
      setStats(computedStats);
      
      // Update URL
      const url = new URL(window.location.href);
      url.searchParams.set('username', username);
      url.searchParams.set('theme', theme);
      window.history.replaceState({}, '', url);

      // Trigger 3D Build
      if (visualizerRef.current) {
        await visualizerRef.current.setTheme(theme);
        visualizerRef.current.buildGrid(data);
      }
      
      setVisualizing(true);
    } catch (err) {
      console.error('Fetch failed:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to fetch'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    if (visualizerRef.current) {
      visualizerRef.current.setTheme(newTheme);
    }
  };

  return (
    <div className="w-full min-h-screen bg-black overflow-hidden relative">
      {/* 3D Scene Layer */}
      <ThreeVisualizer ref={visualizerRef} theme={theme} />

      {/* UI Overlay Layer */}
      <div className="fixed inset-0 z-10 pointer-events-none flex flex-col items-start p-6">
        <Header
          username={username}
          setUsername={setUsername}
          theme={theme}
          setTheme={handleThemeChange}
          onVisualize={handleVisualize}
        />
      </div>

      {/* Stats Dashboard - Fixed Right */}
      {visualizing && (
        <div className="fixed right-6 top-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col gap-4">
          <StatsPanel
            total={stats.total}
            bestStreak={stats.bestStreak}
            highestDay={stats.highestDay}
            average={stats.average}
          />
        </div>
      )}

      {!visualizing && !loading && (
        <div className="fixed inset-0 flex items-center justify-center z-1 pointer-events-none">
          <p
            className="text-white/40 text-lg max-w-md text-center"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Enter a username and click Visualize to see the contribution graph
          </p>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-[100] transition-all">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-white font-mono text-sm tracking-widest uppercase">Fetching Data...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
