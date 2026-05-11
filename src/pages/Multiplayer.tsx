import { useState, useEffect } from 'react';
import { Swords, Loader2 } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../services/api';

export default function Multiplayer() {
  const [inQueue, setInQueue] = useState(false);
  const [matchFound, setMatchFound] = useState<any>(null);
  const [, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Just mock socket connection for speed if backend is offline
    const newSocket = io(API_URL.replace('/api', ''), { transports: ['websocket'], autoConnect: false });
    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, []);

  const joinQueue = () => {
    setInQueue(true);
    // Mock matchmaking delay
    setTimeout(() => {
      setInQueue(false);
      setMatchFound({ id: 'match_123', opponent: 'player_two', gameId: '1' });
    }, 3000);
  };

  return (
    <div style={{ padding: 40, color: 'white', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Swords size={64} color="#c026d3" style={{ marginBottom: 20 }} />
      <h2 style={{ fontSize: 32, marginBottom: 10 }}>PK Mode</h2>
      <p style={{ color: '#888', marginBottom: 40 }}>Battle 1v1 against other creators in real-time.</p>

      {matchFound ? (
        <div style={{ background: '#15162b', padding: 30, borderRadius: 16, textAlign: 'center', width: '100%', maxWidth: 400 }}>
          <h3 style={{ color: '#4ade80', marginBottom: 10 }}>Match Found!</h3>
          <p>Versus: <strong>@{matchFound.opponent}</strong></p>
          <button style={{ background: '#c026d3', color: 'white', padding: '12px 24px', borderRadius: 8, border: 'none', marginTop: 20, width: '100%', fontWeight: 'bold', cursor: 'pointer' }}>
            Enter Arena
          </button>
        </div>
      ) : inQueue ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <Loader2 size={32} className="spin" color="#c026d3" />
          <p>Searching for opponent...</p>
          <button onClick={() => setInQueue(false)} style={{ background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={joinQueue} style={{ background: '#c026d3', color: 'white', padding: '16px 40px', fontSize: 18, borderRadius: 30, border: 'none', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 10px 20px rgba(192, 38, 211, 0.4)' }}>
          Find Match (1v1)
        </button>
      )}
    </div>
  );
}
