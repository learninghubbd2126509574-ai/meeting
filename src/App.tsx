import { useState, useEffect } from 'react';
import WelcomePage from './components/WelcomePage';
import JoinPage from './components/JoinPage';
import AdminPanel from './components/AdminPanel';

interface RouteState {
  type: 'welcome' | 'admin' | 'join';
  meetingId?: string;
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<RouteState>(() => {
    // Initial evaluation right away on mount to avoid flashing WelcomePage
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const joinParam = params.get('join') || params.get('id') || params.get('meetingId') || params.get('meeting');
      if (joinParam) {
        return { type: 'join', meetingId: joinParam };
      }
      if (params.get('page') === 'welcome' || window.location.hash.startsWith('#/welcome')) {
        return { type: 'welcome' };
      }
    }
    // Default to admin login directly
    return { type: 'admin' };
  });

  // 1. Resilient Universal Route Extractor
  function parseRoute(): RouteState {
    const path = window.location.pathname;
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);

    // Query parameters matching: ?join=..., ?id=..., ?meetingId=..., ?meeting=...
    const pageParam = params.get('page');
    const idParam = params.get('id') || params.get('meetingId') || params.get('meeting');
    const joinParam = params.get('join') || idParam;

    if (joinParam) {
      console.log("Parsed join route with meetingId:", joinParam);
      return { type: 'join', meetingId: joinParam };
    }
    if (pageParam === 'welcome') {
      return { type: 'welcome' };
    }
    if (pageParam === 'admin') {
      return { type: 'admin' };
    }
    if (pageParam === 'join' && idParam) {
      return { type: 'join', meetingId: idParam };
    }

    // Hash matching: #/admin, #/join/meet_123
    if (hash.startsWith('#/join/')) {
      const meetingId = hash.substring(7).trim().split('?')[0];
      return { type: 'join', meetingId };
    }
    if (hash.startsWith('#/welcome')) {
      return { type: 'welcome' };
    }
    if (hash.startsWith('#/admin')) {
      return { type: 'admin' };
    }

    // Standard path matching: /admin, /join/meet_123
    if (path.startsWith('/join/')) {
      const meetingId = path.substring(6).trim().split('/')[0];
      return { type: 'join', meetingId };
    }
    if (path === '/welcome' || path === '/welcome/') {
      return { type: 'welcome' };
    }
    if (path === '/admin' || path === '/admin/') {
      return { type: 'admin' };
    }

    // Default route: DIRECTLY show Admin Login screen!
    return { type: 'admin' };
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
    <div className={`min-h-screen ${currentRoute.type === 'admin' ? 'bg-slate-950' : 'bg-slate-100'} font-sans antialiased text-slate-900`}>
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
