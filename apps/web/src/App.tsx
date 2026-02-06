import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Inbox } from './pages/Inbox';
import { Deadlines } from './pages/Deadlines';
import { NeedsReview } from './pages/NeedsReview';
import { Epics } from './pages/Epics';
import { Knowledge } from './pages/Knowledge';
import { Search } from './pages/Search';
import './App.css';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/deadlines" element={<Deadlines />} />
          <Route path="/needs-review" element={<NeedsReview />} />
          <Route path="/epics" element={<Epics />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/search" element={<Search />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
