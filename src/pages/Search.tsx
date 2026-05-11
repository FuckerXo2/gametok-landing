import { useState, useEffect } from 'react';
import { Search as SearchIcon, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { games, users, search as searchApi, getThumbnailUrl } from '../services/api';

export default function Search() {
  const [query, setQuery] = useState('');
  const [gameResults, setGameResults] = useState<any[]>([]);
  const [userResults, setUserResults] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    searchApi.trending(12).then(res => setTrending(res?.topics || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setGameResults([]);
      setUserResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const [gRes, uRes] = await Promise.allSettled([
          games.search(query.trim()),
          users.search(query.trim()),
        ]);
        if (gRes.status === 'fulfilled') setGameResults(gRes.value?.games || []);
        if (uRes.status === 'fulfilled') setUserResults(uRes.value?.users || []);
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div style={{ padding: 40, color: 'white', maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 20 }}>Discover</h2>

      <div style={{ display: 'flex', gap: 10, marginBottom: 30 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games, users, tags..."
            style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: 12, background: '#15162b', color: 'white', border: '1px solid #333', fontSize: 16 }}
          />
          <SearchIcon size={20} style={{ position: 'absolute', left: 14, top: 14, color: '#888' }} />
        </div>
      </div>

      {trending.length > 0 && !query.trim() && (
        <div style={{ marginBottom: 30 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16, color: '#888' }}>Trending Searches</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {trending.map((t: any, i: number) => (
              <button key={i} onClick={() => setQuery(t.query || t)} style={{ padding: '8px 16px', borderRadius: 20, background: '#15162b', color: 'white', border: '1px solid #333', cursor: 'pointer', fontSize: 14 }}>
                {t.query || t}
              </button>
            ))}
          </div>
        </div>
      )}

      {searching && <div style={{ color: '#888' }}>Searching...</div>}

      {gameResults.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <h3 style={{ marginBottom: 12 }}>Games</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {gameResults.map((game: any) => (
              <div key={game.id} onClick={() => navigate('/play', { state: { initialGameId: game.id } })} style={{ cursor: 'pointer', background: '#15162b', borderRadius: 12, overflow: 'hidden', border: '1px solid #222' }}>
                <div style={{ width: '100%', paddingTop: '133%', backgroundImage: `url(${getThumbnailUrl(game)})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', opacity: 0, transition: 'opacity 0.2s' }} className="play-overlay-inline">
                    <Play fill="white" size={28} />
                  </div>
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{game.title || game.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{game.plays || 0} plays</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {userResults.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 12 }}>Users</h3>
          {userResults.map((u: any) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#15162b', borderRadius: 8, marginBottom: 8, cursor: 'pointer' }}>
              <img src={u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} alt="" style={{ width: 40, height: 40, borderRadius: '50%', background: '#333' }} />
              <div>
                <div style={{ fontWeight: 700 }}>{u.displayName || u.username}</div>
                <div style={{ fontSize: 12, color: '#888' }}>@{u.username}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {query.trim().length >= 2 && !searching && gameResults.length === 0 && userResults.length === 0 && (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>No results found for "{query}"</div>
      )}
    </div>
  );
}
