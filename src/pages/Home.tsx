import { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { games, getThumbnailUrl } from '../services/api';
import './Home.css';

export default function Home() {
  const [lanes, setLanes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const LANE_LABELS: Record<string, string> = {
      rising: 'Players\' Choice',
      fresh: 'Trending',
      sleepers: 'Recommended For You',
      evergreen: 'Classics',
      featured: 'Featured',
      worldbuilding: 'Worldbuilding',
    };

    const load = async () => {
      try {
        let parsedLanes: any[] = [];
        try {
          const res = await games.discoverLanes('Explore', 20);
          const lanesObj = res?.lanes || {};
          // Backend returns lanes as { rising: [...], fresh: [...], ... }
          if (Array.isArray(lanesObj)) {
            parsedLanes = lanesObj;
          } else {
            parsedLanes = Object.entries(lanesObj)
              .filter(([, v]) => Array.isArray(v) && (v as any[]).length > 0)
              .map(([key, gamesList]) => ({
                title: LANE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1),
                games: gamesList,
              }));
          }
        } catch {
          const listRes = await games.list(40, 0, { sort: 'trending' });
          const allGames = listRes?.games || [];
          parsedLanes = [
            { title: 'Players\' Choice', games: allGames.slice(0, 12) },
            { title: 'Trending', games: allGames.slice(12, 24) },
            { title: 'Recommended For You', games: allGames.slice(24) },
          ];
        }
        setLanes(parsedLanes);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="home-container animate-fade-in">
      <div className="categories-container">
        {loading ? (
          <div style={{ padding: 40, color: '#888' }}>Loading games from backend...</div>
        ) : error ? (
          <div style={{ padding: 40, color: '#ff4444' }}>
            <p>Could not load games: {error}</p>
          </div>
        ) : lanes.length === 0 ? (
          <div style={{ padding: 40, color: '#888' }}>No games found.</div>
        ) : (
          lanes.map((lane: any, idx: number) => (
            <section key={idx} className="game-category">
              <h2 className="category-title">{lane.title}</h2>
              <div className="games-scroller-wrapper">
                <div className="games-scroll-container">
                  {(lane.games || []).map((game: any) => (
                    <div key={game.id} className="game-card" onClick={() => navigate('/play', { state: { initialGameId: game.id } })}>
                      <div className="game-cover" style={{ backgroundImage: `url(${getThumbnailUrl(game)})` }}>
                        <div className="play-overlay">
                          <Play fill="white" size={32} />
                        </div>
                        <div className="card-stats-pill">
                          <Play fill="white" size={10} />
                          <span>{game.plays || 0}</span>
                        </div>
                      </div>
                      <div className="game-footer">
                        <div className="creator-row">
                          <img 
                            src={game.creatorAvatar?.startsWith('http') ? game.creatorAvatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${game.creatorDisplayName || game.creator?.username || 'user'}`} 
                            alt="Avatar" 
                            className="tiny-avatar"
                          />
                          <span className="creator-name">{game.creatorDisplayName || game.creator?.username || 'anonymous'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
