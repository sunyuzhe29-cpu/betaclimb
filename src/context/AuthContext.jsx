import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { AuthContext } from './authContextValue';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return undefined;

    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setSession(data.session);
      })
      .catch(() => {
        if (!isMounted) return;
        setSession(null);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      isAuthLoading,
      isSupabaseConfigured,
      session,
      user: session?.user || null,
    }),
    [isAuthLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
