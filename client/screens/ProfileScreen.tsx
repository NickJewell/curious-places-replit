import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckins } from '@/contexts/CheckinContext';
import { useTheme } from '@/hooks/useTheme';
import { getUserProgress, getAllBadges, uncheckIn, type UserProgress, type Badge, type UserBadge, type Checkin } from '@/lib/checkins';
import { Spacing, BorderRadius, Typography, type ThemeColors } from '@/constants/theme';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';
import type { ThemePreference } from '@/contexts/ThemeContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'smartphone' },
];

const LANGUAGE_OPTIONS: { code: string | null; label: string; native: string }[] = [
  { code: null,  label: 'English',    native: 'English'    },
  { code: 'fr',  label: 'French',     native: 'Français'   },
  { code: 'de',  label: 'German',     native: 'Deutsch'    },
  { code: 'es',  label: 'Spanish',    native: 'Español'    },
  { code: 'it',  label: 'Italian',    native: 'Italiano'   },
  { code: 'zh',  label: 'Chinese',    native: '中文'        },
  { code: 'hi',  label: 'Hindi',      native: 'हिन्दी'       },
  { code: 'ar',  label: 'Arabic',     native: 'العربية'    },
  { code: 'ja',  label: 'Japanese',   native: '日本語'      },
  { code: 'pt',  label: 'Portuguese', native: 'Português'  },
  { code: 'ko',  label: 'Korean',     native: '한국어'      },
];

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, profile, isGuest, signOut, signInWithGoogle, updateLanguagePreference } = useAuth();
  const { refreshTrigger, removeCheckin } = useCheckins();
  const { theme, isDark, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<Badge | UserBadge | null>(null);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [removingCheckin, setRemovingCheckin] = useState<string | null>(null);
  const [savingLang, setSavingLang] = useState(false);

  const currentLang = profile?.preferred_language ?? null;

  const handleRemoveCheckin = async (checkin: Checkin) => {
    if (!user || isGuest) return;

    Alert.alert(
      'Remove Check-in',
      `Remove check-in for "${checkin.place_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingCheckin(checkin.id);
            try {
              const result = await uncheckIn(user.id, checkin.place_id);
              if (result.success && progress) {
                const updatedCheckins = progress.recent_checkins.filter(c => c.id !== checkin.id);
                setProgress({
                  ...progress,
                  total_checkins: progress.total_checkins - 1,
                  recent_checkins: updatedCheckins,
                });
                removeCheckin(checkin.place_id);
              }
            } catch (error) {
              console.error('Error removing check-in:', error);
            } finally {
              setRemovingCheckin(null);
            }
          },
        },
      ]
    );
  };

  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        setLoading(true);
        try {
          const badges = await getAllBadges();
          setAllBadges(badges);

          if (user && !isGuest) {
            const userProgress = await getUserProgress(user.id);
            setProgress(userProgress);
          }
        } catch (error) {
          console.error('Error loading profile data:', error);
        } finally {
          setLoading(false);
        }
      };

      loadData();
    }, [user?.id, isGuest, refreshTrigger])
  );

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              console.error('Sign out error:', error);
            }
          },
        },
      ]
    );
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in error:', error);
      Alert.alert('Error', 'Failed to sign in with Google');
    }
  };

  const handleBadgePress = (badge: Badge | UserBadge) => {
    setSelectedBadge(badge);
    setShowBadgeModal(true);
  };

  const isEarned = (badgeId: string): boolean => {
    return progress?.badges.some(b => b.id === badgeId) ?? false;
  };

  const getEarnedBadge = (badgeId: string): UserBadge | undefined => {
    return progress?.badges.find(b => b.id === badgeId);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleSelectLanguage = async (code: string | null) => {
    if (code === currentLang) return;
    setSavingLang(true);
    try {
      await updateLanguagePreference(code);
    } catch (error) {
      console.error('Language update error:', error);
    } finally {
      setSavingLang(false);
    }
  };

  const AppearanceSection = () => (
    <View style={styles.appearanceSection}>
      <Text style={styles.sectionTitle}>Appearance</Text>
      <View style={styles.themeSelector}>
        {THEME_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[
              styles.themeOption,
              preference === opt.value && styles.themeOptionActive,
            ]}
            onPress={() => setPreference(opt.value)}
          >
            <Feather
              name={opt.icon}
              size={18}
              color={preference === opt.value ? theme.textAccent : theme.textSecondary}
            />
            <Text
              style={[
                styles.themeOptionText,
                preference === opt.value && styles.themeOptionTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const LanguageSection = () => (
    <View style={styles.appearanceSection}>
      <View style={styles.languageTitleRow}>
        <Text style={styles.sectionTitle}>Descriptions Language</Text>
        {savingLang ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : null}
      </View>
      <Text style={styles.languageSubtitle}>
        Choose the language for place descriptions. Falls back to English if unavailable.
      </Text>
      <View style={styles.languageGrid}>
        {LANGUAGE_OPTIONS.map((opt) => {
          const active = opt.code === currentLang;
          return (
            <Pressable
              key={String(opt.code)}
              style={({ pressed }) => [
                styles.langOption,
                active && styles.langOptionActive,
                pressed && styles.langOptionPressed,
              ]}
              onPress={() => handleSelectLanguage(opt.code)}
              disabled={savingLang}
            >
              <Text style={[styles.langNative, active && styles.langNativeActive]}>
                {opt.native}
              </Text>
              <Text style={[styles.langLabel, active && styles.langLabelActive]}>
                {opt.label}
              </Text>
              {active ? (
                <Feather name="check" size={12} color={theme.accent} style={styles.langCheck} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  if (isGuest) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.guestCard}>
              <View style={styles.guestIconContainer}>
                <Feather name="user" size={40} color={theme.textSecondary} />
              </View>
              <Text style={styles.guestTitle}>Guest Mode</Text>
              <Text style={styles.guestSubtitle}>
                Sign in to save your progress, earn badges, and track your explorations
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.signInButton,
                  pressed && styles.signInButtonPressed,
                ]}
                onPress={handleSignIn}
              >
                <View style={styles.googleIconContainer}>
                  <Text style={styles.googleIcon}>G</Text>
                </View>
                <Text style={styles.signInButtonText}>Continue with Google</Text>
              </Pressable>
            </View>
          </View>

          <AppearanceSection />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.passportCard}>
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Feather name="user" size={32} color={isDark ? theme.text : '#FFFFFF'} />
            </View>
          )}
          <Text style={styles.profileName}>
            {profile?.full_name || 'Explorer'}
          </Text>
          <Text style={styles.profileEmail}>
            {user?.email || profile?.email || 'No email'}
          </Text>

          <View style={styles.statsRow}>
            <Pressable
              style={styles.statItem}
              onPress={() => navigation.navigate('VisitedPlaces')}
            >
              <Text style={styles.statValue}>
                {loading ? '-' : progress?.total_checkins ?? 0}
              </Text>
              <Text style={styles.statLabel}>Places Visited</Text>
              <Feather name="chevron-right" size={14} color={theme.textSecondary} style={styles.statChevron} />
            </Pressable>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {loading ? '-' : progress?.total_badges ?? 0}
              </Text>
              <Text style={styles.statLabel}>Badges Earned</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trophy Case</Text>
          {loading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <View style={styles.badgeGrid}>
              {allBadges.map((badge) => {
                const earned = isEarned(badge.id);
                const earnedBadge = getEarnedBadge(badge.id);
                return (
                  <Pressable
                    key={badge.id}
                    style={[styles.badgeItem, !earned && styles.badgeItemLocked]}
                    onPress={() => handleBadgePress(earnedBadge || badge)}
                  >
                    <View style={[styles.badgeCircle, earned && styles.badgeCircleEarned]}>
                      <Feather
                        name={badge.icon_name as any}
                        size={24}
                        color={earned ? '#D4AF7A' : theme.textSecondary}
                      />
                    </View>
                    <Text
                      style={[styles.badgeName, !earned && styles.badgeNameLocked]}
                      numberOfLines={2}
                    >
                      {badge.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Visits</Text>
          {loading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : progress?.recent_checkins && progress.recent_checkins.length > 0 ? (
            <View style={styles.visitsList}>
              {progress.recent_checkins.map((checkin: Checkin) => (
                <View key={checkin.id} style={styles.visitItem}>
                  <View style={styles.visitIcon}>
                    <Feather name="map-pin" size={16} color={theme.accent} />
                  </View>
                  <View style={styles.visitInfo}>
                    <Text style={styles.visitName} numberOfLines={1}>
                      {checkin.place_name}
                    </Text>
                    <Text style={styles.visitDate}>
                      {formatDate(checkin.checked_in_at)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleRemoveCheckin(checkin)}
                    style={styles.removeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {removingCheckin === checkin.id ? (
                      <ActivityIndicator size="small" color="#E74C3C" />
                    ) : (
                      <Feather name="x-circle" size={18} color="#E74C3C" />
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyVisits}>
              <Feather name="compass" size={32} color={theme.textSecondary} />
              <Text style={styles.emptyVisitsText}>
                No check-ins yet. Start exploring!
              </Text>
            </View>
          )}
        </View>

        <AppearanceSection />
        <LanguageSection />

        <View style={styles.menuSection}>
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              styles.menuItemDanger,
              pressed && styles.menuItemPressed,
            ]}
            onPress={handleSignOut}
          >
            <Feather name="log-out" size={20} color="#E74C3C" />
            <Text style={styles.menuItemTextDanger}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={showBadgeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBadgeModal(false)}
      >
        <View style={styles.badgeModalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowBadgeModal(false)}
          />
          <View style={styles.badgeModalContent}>
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <View style={styles.badgeModalInner}>
              <View style={[
                styles.badgeModalIcon,
                isEarned(selectedBadge?.id || '') && styles.badgeModalIconEarned,
              ]}>
                <Feather
                  name={(selectedBadge?.icon_name as any) || 'award'}
                  size={48}
                  color={isEarned(selectedBadge?.id || '') ? '#D4AF7A' : theme.textSecondary}
                />
              </View>
              <Text style={styles.badgeModalName}>{selectedBadge?.name}</Text>
              <Text style={styles.badgeModalDescription}>
                {selectedBadge?.description}
              </Text>
              {'earned_at' in (selectedBadge || {}) ? (
                <Text style={styles.badgeModalEarned}>
                  Earned on {formatDate((selectedBadge as UserBadge).earned_at)}
                </Text>
              ) : (
                <Text style={styles.badgeModalLocked}>Not yet earned</Text>
              )}
              <Pressable
                style={styles.badgeModalButton}
                onPress={() => setShowBadgeModal(false)}
              >
                <Text style={styles.badgeModalButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundRoot,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.text,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  guestCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  guestIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  guestTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginBottom: Spacing.sm,
  },
  guestSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  signInButtonPressed: {
    opacity: 0.9,
  },
  googleIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signInButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  passportCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    marginHorizontal: Spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: Spacing.lg,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginBottom: Spacing.xs,
  },
  profileEmail: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: Spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.border,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.textAccent,
  },
  statLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: Spacing.xs,
  },
  statChevron: {
    marginTop: Spacing.xs,
  },
  section: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginBottom: Spacing.lg,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  badgeItem: {
    width: '30%',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  badgeItemLocked: {
    opacity: 0.5,
  },
  badgeCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  badgeCircleEarned: {
    backgroundColor: 'rgba(212, 175, 122, 0.2)',
    borderWidth: 2,
    borderColor: '#D4AF7A',
  },
  badgeName: {
    fontSize: 11,
    color: theme.text,
    textAlign: 'center',
  },
  badgeNameLocked: {
    color: theme.textSecondary,
  },
  visitsList: {
    gap: Spacing.sm,
  },
  visitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  visitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  visitInfo: {
    flex: 1,
  },
  visitName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.text,
  },
  visitDate: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  removeButton: {
    padding: Spacing.xs,
  },
  emptyVisits: {
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  emptyVisitsText: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  appearanceSection: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  themeSelector: {
    flexDirection: 'row',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
    gap: 4,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  themeOptionActive: {
    backgroundColor: theme.backgroundCard,
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.textSecondary,
  },
  themeOptionTextActive: {
    color: theme.textAccent,
    fontWeight: '600',
  },
  languageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  languageSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 18,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  langOption: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    minWidth: 80,
    position: 'relative',
  },
  langOptionActive: {
    backgroundColor: 'rgba(212, 175, 122, 0.15)',
    borderColor: theme.accent,
  },
  langOptionPressed: {
    opacity: 0.7,
  },
  langNative: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 2,
  },
  langNativeActive: {
    color: theme.accent,
  },
  langLabel: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  langLabelActive: {
    color: theme.textAccent,
  },
  langCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  menuSection: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundCard,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  menuItemDanger: {},
  menuItemPressed: {
    opacity: 0.7,
  },
  menuItemTextDanger: {
    fontSize: 16,
    color: '#E74C3C',
  },
  badgeModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  badgeModalContent: {
    width: '80%',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  badgeModalInner: {
    padding: Spacing['3xl'],
    alignItems: 'center',
  },
  badgeModalIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  badgeModalIconEarned: {
    backgroundColor: 'rgba(212, 175, 122, 0.2)',
    borderWidth: 2,
    borderColor: '#D4AF7A',
  },
  badgeModalName: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  badgeModalDescription: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  badgeModalEarned: {
    fontSize: 12,
    color: '#4CAF50',
    marginBottom: Spacing.xl,
  },
  badgeModalLocked: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: Spacing.xl,
  },
  badgeModalButton: {
    backgroundColor: theme.accent,
    paddingHorizontal: Spacing['3xl'],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  badgeModalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
