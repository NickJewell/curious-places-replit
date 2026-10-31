import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getRedirectUrl } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const LANG_STORAGE_KEY = 'lantern_preferred_language';
const LANG_BACKFILL_DONE_KEY = 'lantern_lang_backfill_done';
const SUPPORTED_LANG_CODES = new Set(['fr','de','es','it','zh','hi','ar','ja','pt','ko']);

async function storeLanguage(lang: string | null): Promise<void> {
  if (lang && SUPPORTED_LANG_CODES.has(lang)) {
    await AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
  } else {
    await AsyncStorage.removeItem(LANG_STORAGE_KEY);
  }
}

async function readStoredLanguage(): Promise<string | null> {
  const val = await AsyncStorage.getItem(LANG_STORAGE_KEY).catch(() => null);
  return val && SUPPORTED_LANG_CODES.has(val) ? val : null;
}

async function isBackfillDone(): Promise<boolean> {
  const val = await AsyncStorage.getItem(LANG_BACKFILL_DONE_KEY).catch(() => null);
  return val === 'true';
}

async function markBackfillDone(): Promise<void> {
  await AsyncStorage.setItem(LANG_BACKFILL_DONE_KEY, 'true').catch(() => {});
}

interface UserProfile {
  id: string;
  email: string | null;
  avatar_url: string | null;
  full_name: string | null;
  admin_flag: boolean;
  preferred_language: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
  updateLanguagePreference: (lang: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsGuest(false);
        fetchProfile(session.user.id, session.user.email, session.user.user_metadata);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsGuest(false);
        fetchProfile(session.user.id, session.user.email, session.user.user_metadata);
      } else {
        setProfile(null);
        setIsGuest(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, email?: string | null, userMetadata?: Record<string, any>) => {
    const googleAvatarUrl = userMetadata?.avatar_url || userMetadata?.picture || null;
    const googleFullName = userMetadata?.full_name || userMetadata?.name || null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      const needsUpdate = (!data.avatar_url && googleAvatarUrl) ||
                          (!data.full_name && googleFullName) ||
                          (googleAvatarUrl && data.avatar_url !== googleAvatarUrl);

      if (needsUpdate) {
        await supabase
          .from('profiles')
          .update({
            avatar_url: googleAvatarUrl || data.avatar_url,
            full_name: data.full_name || googleFullName,
          })
          .eq('id', userId);
      }

      const row = data as Record<string, unknown>;
      const rawDbLang = row['preferred_language'];
      let resolvedLang: string | null;

      if (rawDbLang !== undefined) {
        // Column exists — DB is source of truth; null means English
        resolvedLang = typeof rawDbLang === 'string' && SUPPORTED_LANG_CODES.has(rawDbLang) ? rawDbLang : null;

        // One-time backfill: if DB has no language set yet AND we have not
        // already done this backfill on this device, promote any locally stored
        // preference (set before this column existed) up to the DB.
        // The LANG_BACKFILL_DONE_KEY flag ensures this never runs again after the
        // first attempt, which prevents it from incorrectly overwriting an
        // explicitly chosen English preference (stored as null in the DB) with an
        // old language code still in AsyncStorage.
        if (rawDbLang === null && !(await isBackfillDone())) {
          const localLang = await readStoredLanguage();
          if (localLang) {
            resolvedLang = localLang;
            const { error: backfillError } = await supabase
              .from('profiles')
              .update({ preferred_language: localLang })
              .eq('id', userId);
            if (backfillError) {
              console.warn('Language backfill write failed:', backfillError.message);
            } else {
              try {
                await storeLanguage(null);
              } catch (cleanupErr) {
                console.warn('Failed to clear local language after backfill:', cleanupErr);
              }
            }
          }
          // Mark backfill as done regardless of outcome so it never fires again.
          await markBackfillDone();
        }
      } else {
        // Column not yet migrated — fall back to local storage
        resolvedLang = await readStoredLanguage();
      }

      setProfile({
        id: data.id,
        email: data.email || email,
        avatar_url: googleAvatarUrl || data.avatar_url,
        full_name: data.full_name || googleFullName,
        admin_flag: !!data.admin_flag,
        preferred_language: resolvedLang,
      });
    } else {
      await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: email || null,
          full_name: googleFullName,
          avatar_url: googleAvatarUrl,
        });

      setProfile({
        id: userId,
        email: email ?? null,
        avatar_url: googleAvatarUrl,
        full_name: googleFullName,
        admin_flag: false,
        preferred_language: await readStoredLanguage(),
      });
    }

    setLoading(false);
  };

  const updateLanguagePreference = async (lang: string | null) => {
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: lang })
        .eq('id', user.id);

      if (error) {
        const isColumnMissing =
          error.code === '42703' ||
          error.message?.toLowerCase().includes('schema cache') ||
          error.message?.toLowerCase().includes('preferred_language');
        if (isColumnMissing) {
          // Column not yet migrated — degrade gracefully to local-only mode
          await storeLanguage(lang);
          setProfile(prev => prev ? { ...prev, preferred_language: lang } : prev);
          return;
        }
        throw new Error(`Failed to save language preference: ${error.message}`);
      }
    }

    await storeLanguage(lang);
    setProfile(prev => prev ? { ...prev, preferred_language: lang } : prev);
  };

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return { error: null };
    } catch {
      return { error: 'An unexpected error occurred' };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string): Promise<{ error: string | null; needsEmailConfirmation?: boolean }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });

      if (error) return { error: error.message };

      const needsEmailConfirmation = !data.session && data.user?.identities?.length === 0;

      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({ id: data.user.id, email, full_name: fullName || null, avatar_url: null });

        if (profileError) {
          return { error: 'Account created but profile setup failed. Please contact support.' };
        }
      }

      return { error: null, needsEmailConfirmation };
    } catch {
      return { error: 'An unexpected error occurred' };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setIsGuest(false);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const continueAsGuest = () => {
    setIsGuest(true);
  };

  const signInWithGoogle = async (): Promise<{ error: string | null }> => {
    try {
      const redirectUrl = getRedirectUrl();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });

      if (error) return { error: error.message };

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

        if (result.type === 'success' && result.url) {
          const url = new URL(result.url);
          const params = new URLSearchParams(url.hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) return { error: sessionError.message };
          }
        }
      }

      return { error: null };
    } catch {
      return { error: 'An unexpected error occurred' };
    }
  };

  return (
    <AuthContext.Provider value={{
      session, user, profile, loading, isGuest,
      isAdmin: !!profile?.admin_flag,
      signIn, signUp, signInWithGoogle, signOut, continueAsGuest,
      updateLanguagePreference,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
