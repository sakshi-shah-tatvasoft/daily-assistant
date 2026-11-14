import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isDemo, endDemo, DEMO_USER_ID, DEMO_EMAIL } from '../lib/demo';

interface AuthContextType {
  session: Session | null;
  user:    User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Per-user data cached on this device; removed on sign-out so a shared phone leaks nothing. */
export const userCacheKey = (uid: string) => `da_cache_v3_${uid}`;

/** Demo mode: a pretend session (no Supabase account) so the app runs on sample data in this browser only. */
const DEMO_SESSION = { user: { id: DEMO_USER_ID, email: DEMO_EMAIL }, access_token: '' } as unknown as Session;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const demo = isDemo();
  const [session, setSession] = useState<Session | null>(demo ? DEMO_SESSION : null);
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [demo]);

  const signOut = async () => {
    if (demo) { endDemo(); return; }
    const uid = session?.user.id;
    await supabase.auth.signOut();
    if (uid) localStorage.removeItem(userCacheKey(uid));
    localStorage.removeItem('da_task_checks_v1');
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
