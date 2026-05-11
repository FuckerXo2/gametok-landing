import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Settings } from 'lucide-react';
import { auth, users, getThumbnailUrl } from '../services/api';
import './Profile.css';

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [createdGames, setCreatedGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('created');
  const navigate = useNavigate();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const me = await auth.me();
        setUser(me.user);
        const gamesRes = await users.created(me.user.id);
        setCreatedGames(gamesRes?.games || []);
      } catch {
        navigate('/signin');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [navigate]);

  if (loading) return <div style={{ padding: 40, color: 'white' }}>Loading profile...</div>;
  if (!user) return null;

  return (
    <div className="profile-container animate-fade-in">
      <div className="profile-header">
        <div className="profile-cover"></div>
        <div className="profile-info-section">
          <div className="profile-avatar-large">
            <img src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt="Avatar" />
          </div>
          <div className="profile-details">
            <h2>{user.displayName || user.username}</h2>
            <p className="username">@{user.username}</p>
            <p className="bio">{user.bio || 'No bio yet.'}</p>
            <div className="profile-stats">
              <div className="stat"><strong>{user.followersCount || 0}</strong> Followers</div>
              <div className="stat"><strong>{user.followingCount || 0}</strong> Following</div>
              <div className="stat"><strong>{createdGames.length}</strong> Games</div>
            </div>
          </div>
          <button className="edit-profile-btn"><Settings size={18} /> Edit Profile</button>
        </div>
      </div>

      <div className="profile-content">
        <div className="tabs">
          <div className={`tab ${activeTab === 'created' ? 'active' : ''}`} onClick={() => setActiveTab('created')}>Created</div>
          <div className={`tab ${activeTab === 'played' ? 'active' : ''}`} onClick={() => setActiveTab('played')}>Played</div>
          <div className={`tab ${activeTab === 'liked' ? 'active' : ''}`} onClick={() => setActiveTab('liked')}>Liked</div>
        </div>

        <div className="games-grid">
          {createdGames.map((game) => (
            <div key={game.id} className="game-card" onClick={() => navigate('/play', { state: { initialGameId: game.id } })}>
              <div className="game-cover" style={{ backgroundImage: `url(${getThumbnailUrl(game)})` }}>
                <div className="play-overlay"><Play fill="white" size={32} /></div>
              </div>
              <div className="game-info">
                <h3 className="game-title">{game.title || game.name}</h3>
                <div className="game-creator"><span>{game.plays || 0} plays</span></div>
              </div>
            </div>
          ))}
          {createdGames.length === 0 && (
            <div className="empty-state">No games created yet. Go to Create to make your first game!</div>
          )}
        </div>
      </div>
    </div>
  );
}
