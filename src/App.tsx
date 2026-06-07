import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Play from './pages/Play';
import SignIn from './pages/SignIn';
import Profile from './pages/Profile';
import Create from './pages/Create';
import Search from './pages/Search';
import Messages from './pages/Messages';
import More from './pages/More';
import Download from './pages/Download';

function App() {
  return (
    <Router>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/play" element={<Play />} />
            <Route path="/create" element={<Create />} />
            <Route path="/search" element={<Search />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/more" element={<More />} />
            <Route path="/download" element={<Download />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
