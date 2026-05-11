import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { games, feed, getGameUrl, likes, savedGames } from '../services/api';
import './Play.css';

export default function Play() {
  const [gamesList, setGamesList] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const location = useLocation();

  useEffect(() => {
    const load = async () => {
      try {
        // Try global feed first, fall back to games.list
        let fetchedGames: any[] = [];
        try {
          const res = await feed.global(20);
          fetchedGames = (res?.feed || []).map((i: any) => i.game).filter(Boolean);
        } catch {
          const res = await games.list(20, 0, { sort: 'trending' });
          fetchedGames = res?.games || [];
        }

        // If navigated with a specific game, put it first
        const initialGameId = location.state?.initialGameId;
        if (initialGameId) {
          const foundIndex = fetchedGames.findIndex((g: any) => g.id === initialGameId);
          if (foundIndex > 0) {
            const game = fetchedGames.splice(foundIndex, 1)[0];
            fetchedGames.unshift(game);
          } else if (foundIndex === -1) {
            // Game not in feed, fetch it individually
            try {
              const res = await games.get(initialGameId);
              const game = res?.game || res;
              if (game) fetchedGames.unshift(game);
            } catch {}
          }
        }

        setGamesList(fetchedGames);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [location.state]);

  const handleNext = () => {
    if (currentIndex < gamesList.length - 1) setCurrentIndex(prev => prev + 1);
  };
  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  const handleLike = async () => {
    const game = gamesList[currentIndex];
    if (!game) return;
    try { await likes.toggle(game.id); } catch {}
  };

  const handleSave = async () => {
    const game = gamesList[currentIndex];
    if (!game) return;
    try { await savedGames.toggle(game.id); } catch {}
  };

  if (loading) return <div style={{ padding: 40, color: 'white', textAlign: 'center' }}>Loading feed...</div>;
  if (error) return <div style={{ padding: 40, color: '#ff4444', textAlign: 'center' }}>Error: {error}</div>;
  if (gamesList.length === 0) return <div style={{ padding: 40, color: 'white', textAlign: 'center' }}>No games found.</div>;

  const currentGame = gamesList[currentIndex];

  return (
    <div className="play-container animate-fade-in">
      <div className="game-viewport-wrapper">
        <div className="game-viewport">
          <iframe
            key={currentGame.id}
            src={getGameUrl(currentGame)}
            className="game-iframe"
            title={currentGame.title || currentGame.name}
            frameBorder="0"
            allow="autoplay; fullscreen"
          />

          <div className="game-bottom-info">
            <div className="creator-profile-small">
              <div className="creator-avatar-wrap">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentGame.creatorDisplayName || currentGame.creator?.username || 'user'}`} alt="Avatar" />
                <button className="follow-btn-small"><Plus size={12} color="black" strokeWidth={3} /></button>
              </div>
              <div className="creator-details">
                <h4>@{currentGame.creatorDisplayName || currentGame.creator?.username || 'anonymous'}</h4>
                <p>{currentGame.title || currentGame.name}</p>
              </div>
              <button className="follow-pill">Follow</button>
            </div>
          </div>
        </div>

        <div className="action-buttons-column">
          <div className="action-item">
            <div className="action-icon-circle"><span style={{ fontSize: 20 }}>🏆</span></div>
            <span>Scores</span>
          </div>
          <div className="action-item">
            <div className="action-icon-circle"><Share2 size={24} /></div>
            <span>Share</span>
          </div>
          <div className="action-item">
            <div className="action-icon-circle"><MessageCircle size={24} /></div>
            <span>{currentGame.commentsCount || 0}</span>
          </div>
          <div className="action-item" onClick={handleLike}>
            <div className="action-icon-circle"><Heart size={24} /></div>
            <span>{currentGame.likes || 0}</span>
          </div>
          <div className="action-item" onClick={handleSave}>
            <div className="action-icon-circle"><Bookmark size={24} /></div>
            <span>Save</span>
          </div>
        </div>

        <div className="navigation-column">
          <button className="nav-arrow-btn" onClick={handlePrev} style={{ opacity: currentIndex === 0 ? 0.3 : 1 }}>
            <ChevronUp size={32} />
          </button>
          <span style={{ fontSize: 12, color: '#888' }}>{currentIndex + 1}/{gamesList.length}</span>
          <button className="nav-arrow-btn" onClick={handleNext} style={{ opacity: currentIndex === gamesList.length - 1 ? 0.3 : 1 }}>
            <ChevronDown size={32} />
          </button>
        </div>
      </div>
    </div>
  );
}
