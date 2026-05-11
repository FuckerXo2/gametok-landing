import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, PlusSquare, Palette, User, Grid, Play, Globe, Hash, MessageCircle, Disc as Discord, ChevronLeft, Plus, BookOpen, BarChart2, MessageSquare, Bell, Lightbulb, Star, Users } from 'lucide-react';

import './Sidebar.css';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isStudio = location.pathname === '/create';

  if (isStudio) {
    return (
      <aside className="sidebar studio-sidebar">
        <div className="sidebar-header studio-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ChevronLeft size={24} />
          </button>
          <div className="logo">
            <h1>Studio</h1>
          </div>
        </div>

        <button className="create-big-btn">
          <Plus size={20} strokeWidth={3} />
          Create
        </button>

        <nav className="sidebar-nav">
          <NavLink to="/studio/my-games" className="nav-item">
            <BookOpen size={22} />
            <span>My Games</span>
          </NavLink>
          <NavLink to="/studio/analytics" className="nav-item">
            <BarChart2 size={22} />
            <span>Analytics</span>
          </NavLink>
          <NavLink to="/studio/comments" className="nav-item">
            <MessageSquare size={22} />
            <span>Comments</span>
          </NavLink>
          <NavLink to="/studio/notifications" className="nav-item">
            <Bell size={22} />
            <span>Notifications</span>
          </NavLink>

          <div className="sidebar-divider"></div>

          <NavLink to="/studio/learn" className="nav-item">
            <Lightbulb size={22} />
            <span>Learn</span>
          </NavLink>
          <NavLink to="/studio/opportunities" className="nav-item">
            <Star size={22} />
            <span>Opportunities</span>
          </NavLink>
          <NavLink to="/studio/community" className="nav-item">
            <Users size={22} />
            <span>Community</span>
          </NavLink>
        </nav>
      </aside>
    );
  }

  // Default Sidebar
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <div className="logo-icon-star-wrapper">
            
          </div>
          <h1>GameTOK</h1>
        </div>
      </div>

      <button className="play-big-btn" onClick={() => navigate('/play')}>
        <Play fill="white" size={20} />
        Play
      </button>

      <nav className="sidebar-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Home size={22} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/create" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <PlusSquare size={22} />
          <span>Create</span>
        </NavLink>
        <NavLink to="/studio" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Palette size={22} />
          <span>Studio</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <User size={22} />
          <span>Profile</span>
        </NavLink>
        <NavLink to="/more" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Grid size={22} />
          <span>More</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="social-icons">
          <Discord size={20} className="social-icon" />
          <Hash size={20} className="social-icon" />
          <MessageCircle size={20} className="social-icon" />
          <Globe size={20} className="social-icon" />
        </div>
      </div>
    </aside>
  );
}
