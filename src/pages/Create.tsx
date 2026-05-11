import { useState } from 'react';
import { Send, Paperclip, Sparkles, Loader2, Gamepad2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ai } from '../services/api';
import './Create.css';

export default function Create() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    const currentPrompt = prompt.trim();
    setIsGenerating(true);
    setGeneratingStatus('Connecting to DreamStream...');

    try {
      await new Promise(r => setTimeout(r, 1000));
      setGeneratingStatus('Generating game code & assets...');

      const { promise } = ai.dream(currentPrompt, [], { onJobStarted: () => {
        setGeneratingStatus(`Compiling...`);
      }});

      const result: any = await promise;
      
      setGeneratingStatus('Ready! Launching...');
      
      if (result.gameId) {
        setTimeout(() => {
          navigate('/play', { state: { initialGameId: result.gameId } });
        }, 1000);
      }

    } catch (err: any) {
      setGeneratingStatus(`Error: ${err.message}`);
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="studio-main animate-fade-in">
      <div className="studio-content">
        
        {isGenerating ? (
          <div className="generating-state">
            <Loader2 size={64} className="spin" color="var(--primary)" />
            <h2>{generatingStatus}</h2>
            <p>Our AI is forging your game right now...</p>
          </div>
        ) : (
          <>
            <div className="studio-hero">
              <div className="hero-icon-glow">
                <Gamepad2 size={64} color="var(--primary)" />
              </div>
              <h1>What game would you like to create?</h1>
              <button className="inspire-btn">
                <Sparkles size={16} /> Inspire Me
              </button>
            </div>

            <div className="divider">
              <span>or</span>
            </div>

            <div className="prompt-container">
              <form onSubmit={handleSubmit}>
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Tap to wish..."
                  rows={4}
                />
                <div className="prompt-actions">
                  <button type="button" className="icon-btn">
                    <Paperclip size={20} />
                  </button>
                  <button type="submit" disabled={!prompt.trim()} className="submit-prompt-btn">
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
        
      </div>
    </div>
  );
}
