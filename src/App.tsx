import { useState, useEffect } from 'react';
import WelcomePage from './components/WelcomePage';
import JoinPage from './components/JoinPage';
import AdminPanel from './components/AdminPanel';

interface RouteState {
  type: 'welcome' | 'admin' | 'join';
  meetingId?: string;
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<RouteState>({ type: 'welcome' });

  // 1. Resilient Universal Route Extractor
  function parseRoute(): RouteState {
    const path = window.location.pathname;
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);

    // Query parameters matching: ?page=admin
    const pageParam = params.get('page');
    const idParam = params.get('id');
    const joinParam = params.get('join');

    if (joinParam) {
      return { type: 'join', meetingId: joinParam };
    }
    if (pageParam === 'admin') {
      return { type: 'admin' };
    }
    if (pageParam === 'join' && idParam) {
      return { type: 'join', meetingId: idParam };
    }
    if (idParam) {
      return { type: 'join', meetingId: idParam };
    }

    // Hash matching: #/admin, #/join/meet_123
    if (hash.startsWith('#/admin')) {
      return { type: 'admin' };
    }
    if (hash.startsWith('#/join/')) {
      const meetingId = hash.substring(7).trim().split('?')[0];
      return { type: 'join', meetingId };
    }

    // Standard path matching: /admin, /join/meet_123
    if (path === '/admin' || path === '/admin/') {
      return { type: 'admin' };
    }
    if (path.startsWith('/join/')) {
      const meetingId = path.substring(6).trim().split('/')[0];
      return { type: 'join', meetingId };
    }

    return { type: 'welcome' };
  }

  // Handle address bar updates (popstate event listener)
  useEffect(() => {
    function handleLocationUpdate() {
      setCurrentRoute(parseRoute());
    }

    window.addEventListener('popstate', handleLocationUpdate);
    window.addEventListener('hashchange', handleLocationUpdate);
    
    // Initial routing evaluation
    handleLocationUpdate();

    return () => {
      window.removeEventListener('popstate', handleLocationUpdate);
      window.removeEventListener('hashchange', handleLocationUpdate);
    };
  }, []);

  // UI Navigation Triggers
  function navigateToAdmin() {
    window.history.pushState({ page: 'admin' }, '', '/?page=admin');
    setCurrentRoute({ type: 'admin' });
  }

  function navigateToJoin(meetingId: string) {
    window.history.pushState({ page: 'join', id: meetingId }, '', `/?join=${meetingId}`);
    setCurrentRoute({ type: 'join', meetingId });
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans antialiased text-slate-100">
      {currentRoute.type === 'welcome' && (
        <WelcomePage 
          onNavigateToAdmin={navigateToAdmin} 
          onNavigateToJoin={navigateToJoin} 
        />
      )}

      {currentRoute.type === 'admin' && (
        <AdminPanel />
      )}

      {currentRoute.type === 'join' && currentRoute.meetingId && (
        <JoinPage meetingId={currentRoute.meetingId} />
      )}
    </div>
  );
}
