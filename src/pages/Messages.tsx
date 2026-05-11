import { useState, useEffect } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { messages as messagesApi } from '../services/api';

export default function Messages() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    messagesApi.getConversations()
      .then(res => setConversations(res?.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openChat = async (convo: any) => {
    setActiveChat(convo.id);
    try {
      const res = await messagesApi.getConversation(convo.otherUserId || convo.id);
      setChatMessages(res?.messages || []);
    } catch { setChatMessages([]); }
  };

  const sendMessage = async () => {
    if (!msg.trim() || !activeChat) return;
    const convo = conversations.find(c => c.id === activeChat);
    try {
      await messagesApi.send({ conversationId: activeChat, recipientId: convo?.otherUserId, text: msg.trim() });
      setChatMessages(prev => [...prev, { text: msg.trim(), fromMe: true }]);
      setMsg('');
    } catch {}
  };

  if (loading) return <div style={{ padding: 40, color: 'white' }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', height: '100%', color: 'white' }}>
      <div style={{ width: 300, borderRight: '1px solid #222', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 20, borderBottom: '1px solid #222' }}><h2>Messages</h2></div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {conversations.length === 0
            ? <div style={{ padding: 20, color: '#888' }}>No conversations yet.</div>
            : conversations.map(c => (
              <div key={c.id} onClick={() => openChat(c)} style={{ padding: 16, borderBottom: '1px solid #191925', cursor: 'pointer', background: activeChat === c.id ? '#15162b' : 'transparent' }}>
                <h4 style={{ margin: 0 }}>@{c.otherUsername || 'user'}</h4>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>{c.lastMessage || '...'}</p>
              </div>
            ))
          }
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0a0a15' }}>
        {activeChat ? (
          <>
            <div style={{ padding: 20, borderBottom: '1px solid #222', background: '#15162b' }}><h3>Chat</h3></div>
            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
              {chatMessages.map((m: any, i: number) => (
                <div key={i} style={{ marginBottom: 12, textAlign: m.fromMe ? 'right' : 'left' }}>
                  <div style={{ display: 'inline-block', background: m.fromMe ? '#c026d3' : '#333', padding: '10px 14px', borderRadius: 16, maxWidth: '70%' }}>{m.text}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: 16, borderTop: '1px solid #222', display: 'flex', gap: 10 }}>
              <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Type a message..." style={{ flex: 1, padding: 12, borderRadius: 20, background: '#222', color: 'white', border: 'none' }} />
              <button onClick={sendMessage} style={{ background: '#c026d3', color: 'white', borderRadius: '50%', width: 44, height: 44, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Send size={18} /></button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
            <MessageSquare size={48} style={{ opacity: 0.2, marginBottom: 20 }} />
            <p>Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}
