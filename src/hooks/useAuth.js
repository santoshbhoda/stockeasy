import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

/**
 * Custom hook for authentication and user profile state management.
 * Integrates Supabase Auth with local Dexie caching for offline support.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Fetches user profile from Supabase with fallback to local Dexie storage.
   */
  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setProfile(data);
        // Cache profile locally in Dexie for offline support
        try {
          await db.profiles.put(data);
        } catch (dexieErr) {
          console.warn('[useAuth] Could not cache profile in Dexie:', dexieErr);
        }
      } else if (profileError) {
        console.warn('[useAuth] Supabase profile error, falling back to Dexie:', profileError.message);
        const cached = await db.profiles.get(userId);
        if (cached) {
          setProfile(cached);
        }
      }
    } catch (err) {
      console.warn('[useAuth] Profile fetch exception, loading from Dexie:', err);
      try {
        const cached = await db.profiles.get(userId);
        if (cached) {
          setProfile(cached);
        }
      } catch (dexieErr) {
        console.error('[useAuth] Dexie profile retrieval failed:', dexieErr);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Check existing session on mount
    const checkInitialSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.warn('[useAuth] Session check error:', sessionError.message);
        }

        if (session?.user && isMounted) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else if (isMounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      } catch (err) {
        console.error('[useAuth] Initial session error:', err);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkInitialSession();

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [fetchProfile]);

  /**
   * Signs in user using phone (converted to email format) or email.
   * @param {string} emailOrPhone - User's 10-digit phone number or email
   * @param {string} password - User's password
   */
  const login = async (emailOrPhone, password) => {
    setLoading(true);
    setError(null);
    try {
      let email = (emailOrPhone || '').trim();
      // If phone number provided, convert to phone@stockeasy.local format
      if (!email.includes('@')) {
        const cleanPhone = email.replace(/\D/g, '');
        email = `${cleanPhone}@stockeasy.local`;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw authError;
      }

      setUser(data.user);
      if (data.user) {
        await fetchProfile(data.user.id);
      }
      return data;
    } catch (err) {
      const errorMessage = err.message || 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Signs out the current user and clears session state.
   */
  const logout = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: logoutError } = await supabase.auth.signOut();
      if (logoutError) {
        console.warn('[useAuth] Supabase signOut error:', logoutError.message);
      }
      setUser(null);
      setProfile(null);
    } catch (err) {
      setError(err.message || 'Logout failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const isOwner = Boolean(profile?.role === 'owner');
  const userBranchId = profile?.branch_id || null;

  return {
    user,
    profile,
    loading,
    error,
    login,
    logout,
    isOwner,
    userBranchId,
    isAuthenticated: Boolean(user),
  };
}

export default useAuth;
