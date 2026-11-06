import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';

// Each page is code-split so the first load stays fast.
const Home = lazy(() => import('./pages/Home.jsx'));
const Lexicon = lazy(() => import('./pages/Lexicon.jsx'));
const Target = lazy(() => import('./pages/Target.jsx'));
const Flip = lazy(() => import('./pages/Flip.jsx'));
const Reflex = lazy(() => import('./pages/Reflex.jsx'));
const Party = lazy(() => import('./pages/Party.jsx'));
const Detective = lazy(() => import('./pages/Detective.jsx'));
const Leaderboard = lazy(() => import('./pages/Leaderboard.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play/lexicon" element={<Lexicon />} />
          <Route path="/play/target" element={<Target />} />
          <Route path="/play/flip" element={<Flip />} />
          <Route path="/play/reflex" element={<Reflex />} />
          <Route path="/party" element={<Party />} />
          <Route path="/party/:code" element={<Party />} />
          <Route path="/detective" element={<Detective />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
