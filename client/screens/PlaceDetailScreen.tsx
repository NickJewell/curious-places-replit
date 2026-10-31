import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors, Spacing, BorderRadius, Typography, type ThemeColors } from '@/constants/theme';
import SafeMapView, { Marker, isMapAvailable, PROVIDER_GOOGLE } from '@/components/SafeMapView';
import { getApiUrl, apiRequest } from '@/lib/query-client';
import { useAuth } from '@/contexts/AuthContext';
import { useHunt } from '@/contexts/HuntContext';
import { useTheme } from '@/hooks/useTheme';
import { getLocalizedDescription, type Curio } from '@/lib/supabase';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'PlaceDetail'>;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Fact {
  id: string;
  curio_id: string;
  fact_info: string;
}

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s)>\]]+/gi, '').replace(/\s{2,}/g, ' ').trim();
}

const ISSUE_TYPES = [
  { key: 'incorrect_location', label: 'Incorrect Location' },
  { key: 'incorrect_info', label: 'Incorrect Info' },
  { key: 'typo', label: 'Typo' },
  { key: 'bad_audio', label: 'Bad Audio' },
  { key: 'offensive', label: 'Offensive' },
  { key: 'other', label: 'Other' },
] as const;
type IssueType = typeof ISSUE_TYPES[number]['key'];

export default function PlaceDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { user, profile } = useAuth();
  const { setActiveTarget } = useHunt();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { placeId, placeName, placeDescription, placeLat, placeLng, tourId, tourName } = route.params;

  const preferredLang = profile?.preferred_language ?? null;
  const isEnglish = !preferredLang || preferredLang === 'en';

  const [place, setPlace] = useState<Curio | null>(null);
  const [placeLoading, setPlaceLoading] = useState(true);
  const [localizedDescription, setLocalizedDescription] = useState<string | null>(null);

  const [facts, setFacts] = useState<Fact[]>([]);
  const [viewedFactIds, setViewedFactIds] = useState<Set<string>>(new Set());
  const [currentFact, setCurrentFact] = useState<Fact | null>(null);
  const [showFact, setShowFact] = useState(false);
  const [loadingFacts, setLoadingFacts] = useState(false);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportSource, setReportSource] = useState<{ type: 'place'; id: string } | { type: 'fact'; id: string }>({ type: 'place', id: '' });
  const [issueType, setIssueType] = useState<IssueType>('incorrect_info');
  const [otherDesc, setOtherDesc] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const [hasVotedUp, setHasVotedUp] = useState(false);
  const [hasVotedDown, setHasVotedDown] = useState(false);

  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const hasAudio = !!signedAudioUrl && !audioError;
  const audioPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [factAudioUrl, setFactAudioUrl] = useState<string | null>(null);
  const [factAudioLoading, setFactAudioLoading] = useState(false);
  const [factAudioError, setFactAudioError] = useState(false);
  const hasFactAudio = !!factAudioUrl && !factAudioError;

  const [activeSource, setActiveSource] = useState<'detail' | 'fact'>('detail');

  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const player = useAudioPlayer(signedAudioUrl, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  const [shouldAutoPlayFact, setShouldAutoPlayFact] = useState(false);
  const factPlayer = useAudioPlayer(factAudioUrl, { updateInterval: 500 });
  const factStatus = useAudioPlayerStatus(factPlayer);

  useEffect(() => {
    setPlace({
      id: placeId,
      name: placeName,
      description: placeDescription || '',
      latitude: placeLat,
      longitude: placeLng,
    });
    setPlaceLoading(false);
  }, [placeId]);

  useEffect(() => {
    const lang = profile?.preferred_language ?? null;
    getLocalizedDescription(placeId, lang).then(setLocalizedDescription);
  }, [placeId, profile?.preferred_language]);

  useEffect(() => {
    if (shouldAutoPlay && status.isLoaded && !status.playing) {
      player.play();
      setShouldAutoPlay(false);
    }
  }, [shouldAutoPlay, status.isLoaded, status.playing, player]);

  useEffect(() => {
    if (shouldAutoPlayFact && factStatus.isLoaded && !factStatus.playing) {
      factPlayer.play();
      setShouldAutoPlayFact(false);
    }
  }, [shouldAutoPlayFact, factStatus.isLoaded, factStatus.playing, factPlayer]);

  useEffect(() => {
    setAudioError(false);
    setAudioLoading(true);
    setSignedAudioUrl(null);
    setFactAudioUrl(null);
    setFactAudioError(false);
    setActiveSource('detail');

    if (audioPollRef.current) {
      clearInterval(audioPollRef.current);
      audioPollRef.current = null;
    }

    const audioLang = profile?.preferred_language ?? 'en';
    const audioEndpoint = new URL(
      `/api/places/${encodeURIComponent(placeId)}/audio-url?lang=${audioLang}`,
      getApiUrl(),
    ).toString();

    fetch(audioEndpoint)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch audio URL');
        return r.json();
      })
      .then(data => {
        if (data.url) {
          setSignedAudioUrl(data.url);
          setShouldAutoPlay(true);
        }
        setAudioLoading(!data.isReady);

        if (!data.isReady) {
          audioPollRef.current = setInterval(() => {
            fetch(audioEndpoint)
              .then(r => (r.ok ? r.json() : null))
              .then(pollData => {
                if (pollData?.isReady && pollData.url) {
                  clearInterval(audioPollRef.current!);
                  audioPollRef.current = null;
                  setSignedAudioUrl(pollData.url);
                  setAudioLoading(false);
                  setShouldAutoPlay(true);
                }
              })
              .catch(() => {});
          }, 3000);
        }
      })
      .catch(() => {
        setAudioError(true);
        setAudioLoading(false);
      });

    return () => {
      if (audioPollRef.current) {
        clearInterval(audioPollRef.current);
        audioPollRef.current = null;
      }
    };
  }, [placeId, profile?.preferred_language]);

  const playFactAudio = useCallback((fact: Fact) => {
    player.pause();
    setActiveSource('fact');
    setFactAudioError(false);
    setFactAudioLoading(true);
    setFactAudioUrl(null);
    const url = new URL(
      `/api/places/${encodeURIComponent(placeId)}/fact-audio/${encodeURIComponent(fact.id)}`,
      getApiUrl()
    );
    fetch(url.toString())
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch fact audio URL');
        return r.json();
      })
      .then(data => {
        setFactAudioUrl(data.url);
        setShouldAutoPlayFact(true);
        setFactAudioLoading(false);
      })
      .catch(() => {
        setFactAudioError(true);
        setFactAudioLoading(false);
      });
  }, [placeId, player]);

  const handlePlayPause = useCallback(() => {
    if (activeSource === 'fact' && hasFactAudio) {
      if (factStatus.playing) {
        factPlayer.pause();
      } else {
        factPlayer.play();
      }
      return;
    }
    if (!hasAudio || !signedAudioUrl) return;
    if (status.playing) {
      player.pause();
    } else {
      factPlayer.pause();
      setActiveSource('detail');
      player.play();
    }
  }, [activeSource, hasAudio, hasFactAudio, signedAudioUrl, status.playing, factStatus.playing, player, factPlayer]);

  const handleSeek = useCallback((locationX: number, layoutWidth: number) => {
    if (activeSource === 'fact' && hasFactAudio) {
      if (!factStatus.duration || factStatus.duration <= 0) return;
      const ratio = Math.max(0, Math.min(1, locationX / layoutWidth));
      factPlayer.seekTo(ratio * factStatus.duration);
      return;
    }
    if (!status.duration || status.duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / layoutWidth));
    player.seekTo(ratio * status.duration);
  }, [activeSource, hasFactAudio, status.duration, factStatus.duration, player, factPlayer]);

  const fetchFacts = useCallback(async () => {
    setLoadingFacts(true);
    try {
      const url = new URL(`/api/places/${encodeURIComponent(placeId)}/facts`, getApiUrl());
      const response = await fetch(url.toString());
      if (!response.ok) {
        setFacts([]);
        return;
      }
      const data = await response.json();
      setFacts(data.facts || []);
    } catch (error) {
      console.error('Error fetching facts:', error);
      setFacts([]);
    } finally {
      setLoadingFacts(false);
    }
  }, [placeId]);

  useEffect(() => {
    fetchFacts();
  }, [fetchFacts]);

  const handleShowRandomFact = () => {
    const unviewedFacts = facts.filter(f => !viewedFactIds.has(f.id));
    let selectedFact: Fact | null = null;

    if (unviewedFacts.length === 0) {
      if (facts.length > 0) {
        setViewedFactIds(new Set());
        selectedFact = facts[Math.floor(Math.random() * facts.length)];
        setViewedFactIds(new Set([selectedFact.id]));
      }
    } else {
      selectedFact = unviewedFacts[Math.floor(Math.random() * unviewedFacts.length)];
      setViewedFactIds(prev => new Set([...prev, selectedFact!.id]));
    }

    if (selectedFact) {
      setCurrentFact(selectedFact);
      setShowFact(true);
      playFactAudio(selectedFact);
    }
  };

  const thumbsUpScale = useSharedValue(1);
  const thumbsDownScale = useSharedValue(1);
  const thumbsUpStyle = useAnimatedStyle(() => ({ transform: [{ scale: thumbsUpScale.value }] }));
  const thumbsDownStyle = useAnimatedStyle(() => ({ transform: [{ scale: thumbsDownScale.value }] }));

  const handleVoteUp = async () => {
    thumbsUpScale.value = withSequence(withSpring(1.3, { damping: 10 }), withSpring(1, { damping: 10 }));
    if (hasVotedUp) {
      setHasVotedUp(false);
      try {
        await apiRequest('DELETE', '/api/content/vote', { curioId: placeId, voteType: 'up', userId: user?.id || null });
      } catch { setHasVotedUp(true); }
    } else {
      setHasVotedUp(true);
      if (hasVotedDown) setHasVotedDown(false);
      try {
        if (hasVotedDown) {
          await apiRequest('DELETE', '/api/content/vote', { curioId: placeId, voteType: 'down', userId: user?.id || null });
        }
        await apiRequest('POST', '/api/content/vote', { curioId: placeId, voteType: 'up', userId: user?.id || null });
      } catch {}
    }
  };

  const handleVoteDown = () => {
    thumbsDownScale.value = withSequence(withSpring(1.3, { damping: 10 }), withSpring(1, { damping: 10 }));
    if (hasVotedDown) {
      handleRemoveDownVote();
    } else {
      setReportSource({ type: 'place', id: placeId });
      setShowReportModal(true);
    }
  };

  const handleRemoveDownVote = async () => {
    setHasVotedDown(false);
    try {
      await apiRequest('DELETE', '/api/content/vote', { curioId: placeId, voteType: 'down', userId: user?.id || null });
    } catch { setHasVotedDown(true); }
  };

  const handleSubmitReport = async () => {
    setSubmittingReport(true);
    try {
      await apiRequest('POST', '/api/content/issue', {
        sourceType: reportSource.type,
        sourceId: reportSource.id,
        issueType: issueType,
        otherDesc: issueType === 'other' ? otherDesc.slice(0, 200) : null,
        userId: user?.id || null,
      });
      if (reportSource.type === 'place') {
        if (hasVotedUp) {
          await apiRequest('DELETE', '/api/content/vote', { curioId: placeId, voteType: 'up', userId: user?.id || null });
          setHasVotedUp(false);
        }
        await apiRequest('POST', '/api/content/vote', { curioId: placeId, voteType: 'down', userId: user?.id || null });
        setHasVotedDown(true);
      }
      setShowReportModal(false);
      setOtherDesc('');
      setIssueType('incorrect_info');
      Alert.alert('Thank you', "We'll look into it.");
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleCompass = () => {
    setActiveTarget({
      id: placeId,
      name: placeName,
      description: placeDescription || '',
      latitude: placeLat,
      longitude: placeLng,
    });
    navigation.navigate('Compass', { fromTour: !!tourId });
  };

  const handleBackToTour = () => {
    if (tourId) {
      player.pause();
      factPlayer.pause();
      navigation.goBack();
    }
  };

  const handleGoBack = () => {
    player.pause();
    factPlayer.pause();
    navigation.goBack();
  };

  if (placeLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const displayPlace = place || { id: placeId, name: placeName, description: placeDescription || '', latitude: placeLat, longitude: placeLng };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.heroSection, { paddingTop: Platform.OS === 'ios' ? 0 : insets.top }]}>
        {isMapAvailable && placeLat && placeLng ? (
          <SafeMapView
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: placeLat,
              longitude: placeLng,
              latitudeDelta: 0.003,
              longitudeDelta: 0.003,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            showsUserLocation={false}
            showsMyLocationButton={false}
            userInterfaceStyle="dark"
            pointerEvents="none"
          >
            {Marker ? (
              <Marker
                coordinate={{ latitude: placeLat, longitude: placeLng }}
                tracksViewChanges={false}
              />
            ) : null}
          </SafeMapView>
        ) : (
          <View style={styles.heroPlaceholder}>
            <Feather name="map-pin" size={48} color={theme.accent} />
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.headerButton,
            { top: insets.top + Spacing.md, left: Spacing.lg },
            pressed && styles.headerButtonPressed,
          ]}
          onPress={handleGoBack}
        >
          <BlurView intensity={60} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>

      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: (tourId ? 80 : 20) + insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>{displayPlace.name}</Text>
          <View style={styles.voteButtons}>
            <Pressable onPress={handleVoteUp}>
              <Animated.View style={[styles.voteButton, thumbsUpStyle]}>
                <Feather name="thumbs-up" size={20} color={hasVotedUp ? '#4CAF50' : theme.textSecondary} />
              </Animated.View>
            </Pressable>
            <Pressable onPress={handleVoteDown}>
              <Animated.View style={[styles.voteButton, thumbsDownStyle]}>
                <Feather name="thumbs-down" size={20} color={hasVotedDown ? '#F44336' : theme.textSecondary} />
              </Animated.View>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.compassButton, pressed && styles.compassButtonPressed]}
          onPress={handleCompass}
        >
          <Feather name="compass" size={22} color={theme.accent} />
          <Text style={styles.compassButtonText}>Navigate Here</Text>
          <Feather name="chevron-right" size={18} color={theme.accent} />
        </Pressable>

        {(() => {
          const isFactActive = activeSource === 'fact' && (hasFactAudio || factAudioLoading);
          const activeStatus = isFactActive ? factStatus : status;
          const isPlaying = isFactActive ? factStatus.playing : status.playing;
          const isLoading = isFactActive ? factAudioLoading : audioLoading;
          const isError = isFactActive ? factAudioError : audioError;
          const isReady = isFactActive ? hasFactAudio : hasAudio;
          const activeDuration = activeStatus.duration;
          const activeTime = activeStatus.currentTime;

          return (
            <View style={[styles.audioPlayerContainer, !isReady && !isLoading && styles.audioPlayerDisabled]}>
              <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
              <Pressable
                onPress={handlePlayPause}
                disabled={!isReady || isLoading || isError}
                style={({ pressed }) => [
                  styles.audioPlayButton,
                  pressed && isReady && !isLoading && styles.audioPlayButtonPressed,
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : isError ? (
                  <Feather name="alert-circle" size={32} color={theme.inactive} />
                ) : (
                  <Feather
                    name={isPlaying ? 'pause-circle' : 'play-circle'}
                    size={32}
                    color={isReady ? theme.accent : theme.inactive}
                  />
                )}
              </Pressable>
              <View style={styles.audioDetails}>
                {isFactActive ? (
                  <Text style={styles.audioSourceLabel}>Playing fact</Text>
                ) : null}
                <Pressable
                  style={styles.audioProgressTouchable}
                  disabled={!isReady}
                  onPress={(e) => {
                    const { locationX } = e.nativeEvent;
                    handleSeek(locationX, SCREEN_WIDTH - Spacing.xl * 2 - Spacing.lg * 2 - 44 - Spacing.md);
                  }}
                >
                  <View style={styles.audioProgressTrack}>
                    <View
                      style={[
                        styles.audioProgressFill,
                        {
                          width: isReady && activeDuration > 0
                            ? `${Math.min(100, (activeTime / activeDuration) * 100)}%`
                            : '0%',
                          backgroundColor: isReady ? theme.accent : theme.inactive,
                        },
                      ]}
                    />
                  </View>
                </Pressable>
                <View style={styles.audioTimeRow}>
                  {isError ? (
                    <Text style={styles.audioUnavailableText}>Audio not available</Text>
                  ) : isLoading ? (
                    <Text style={styles.audioUnavailableText}>Loading audio...</Text>
                  ) : isReady ? (
                    <>
                      <Text style={styles.audioTimeText}>{formatTime(activeTime)}</Text>
                      <Text style={styles.audioTimeText}>{activeDuration > 0 ? formatTime(activeDuration) : '--:--'}</Text>
                    </>
                  ) : (
                    <Text style={styles.audioUnavailableText}>Audio not available</Text>
                  )}
                </View>
              </View>
            </View>
          );
        })()}

        <Text style={[
          styles.narrative,
          profile?.preferred_language === 'ar' && { writingDirection: 'rtl', textAlign: 'right' },
        ]}>
          {localizedDescription ?? (displayPlace.description || 'No description available for this location.')}
        </Text>

        {isEnglish && (facts.length > 0 || !loadingFacts) ? (
          <Pressable
            style={({ pressed }) => [styles.factCard, pressed && styles.factCardPressed]}
            onPress={handleShowRandomFact}
            disabled={facts.length === 0}
          >
            <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            {showFact && currentFact ? (
              <Animated.View entering={FadeIn} style={styles.factContent}>
                <View style={styles.factHeader}>
                  <Feather name="zap" size={18} color={theme.accent} />
                  <Text style={styles.factLabel}>Did you know?</Text>
                  <Pressable
                    style={styles.factVoteBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      if (currentFact) {
                        setReportSource({ type: 'fact', id: currentFact.id });
                        setShowReportModal(true);
                      }
                    }}
                  >
                    <Feather name="thumbs-down" size={14} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <Text style={styles.factText}>{stripUrls(currentFact.fact_info)}</Text>
                <Text style={styles.tapAgainText}>Tap for another fact</Text>
              </Animated.View>
            ) : (
              <View style={styles.factPrompt}>
                <Feather name="zap" size={24} color={theme.accent} />
                <Text style={styles.factPromptText}>
                  {facts.length > 0 ? 'Did you know? (Tap for Fact)' : 'No facts available yet'}
                </Text>
              </View>
            )}
          </Pressable>
        ) : null}

        {isEnglish && loadingFacts ? (
          <View style={styles.loadingFactsContainer}>
            <ActivityIndicator size="small" color={theme.accent} />
          </View>
        ) : null}
      </ScrollView>

      {tourId ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <BlurView intensity={60} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          <Pressable
            style={({ pressed }) => [styles.tourBackButton, pressed && styles.tourBackButtonPressed]}
            onPress={handleBackToTour}
          >
            <Feather name="arrow-left" size={18} color={theme.accent} />
            <Text style={styles.tourBackButtonText} numberOfLines={1}>
              Back to {tourName || 'Tour'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={showReportModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowReportModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.reportModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => { Keyboard.dismiss(); setShowReportModal(false); }}
          />
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.reportModalContent}
          >
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <View style={styles.reportModalInner}>
              <Text style={styles.reportModalTitle}>Report an Issue</Text>
              <Text style={styles.reportLabel}>What's wrong?</Text>
              <View style={styles.reasonButtons}>
                {ISSUE_TYPES.map((issue) => (
                  <Pressable
                    key={issue.key}
                    style={[styles.reasonButton, issueType === issue.key && styles.reasonButtonActive]}
                    onPress={() => setIssueType(issue.key)}
                  >
                    <Text style={[styles.reasonButtonText, issueType === issue.key && styles.reasonButtonTextActive]}>
                      {issue.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {issueType === 'other' ? (
                <>
                  <Text style={styles.reportLabel}>Please describe ({200 - otherDesc.length} chars left)</Text>
                  <TextInput
                    style={styles.reportCommentInput}
                    placeholder="Tell us more..."
                    placeholderTextColor={theme.textSecondary}
                    value={otherDesc}
                    onChangeText={(text) => setOtherDesc(text.slice(0, 200))}
                    multiline
                    numberOfLines={3}
                    maxLength={200}
                    returnKeyType="done"
                    blurOnSubmit
                  />
                </>
              ) : null}
              <View style={styles.reportButtons}>
                <Pressable
                  style={styles.reportCancelButton}
                  onPress={() => { setShowReportModal(false); setOtherDesc(''); setIssueType('incorrect_info'); }}
                >
                  <Text style={styles.reportCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.reportSubmitButton, submittingReport && styles.reportSubmitButtonDisabled]}
                  onPress={handleSubmitReport}
                  disabled={submittingReport}
                >
                  {submittingReport ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.reportSubmitText}>Submit</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.backgroundRoot,
  },
  heroSection: {
    height: SCREEN_HEIGHT * 0.25,
    backgroundColor: theme.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButton: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonPressed: {
    opacity: 0.7,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: theme.text,
    marginRight: Spacing.md,
  },
  voteButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  voteButton: {
    padding: Spacing.sm,
  },
  compassButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 36, 46, 0.8)',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  compassButtonPressed: {
    opacity: 0.7,
  },
  compassButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.accent,
    flex: 1,
  },
  audioPlayerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing['2xl'],
    gap: Spacing.md,
    backgroundColor: 'rgba(30, 36, 46, 0.6)',
  },
  audioPlayerDisabled: {
    opacity: 0.45,
  },
  audioPlayButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPlayButtonPressed: {
    opacity: 0.6,
  },
  audioDetails: {
    flex: 1,
    gap: Spacing.xs,
  },
  audioProgressTouchable: {
    paddingVertical: Spacing.xs,
  },
  audioProgressTrack: {
    height: 4,
    backgroundColor: theme.backgroundTertiary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  audioProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  audioTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  audioTimeText: {
    fontSize: 11,
    color: theme.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  audioUnavailableText: {
    fontSize: 12,
    color: theme.inactive,
  },
  audioSourceLabel: {
    fontSize: 11,
    color: theme.accent,
    fontWeight: '600',
    marginBottom: 2,
  },
  narrative: {
    fontSize: 17,
    lineHeight: 28,
    color: theme.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: Spacing['3xl'],
  },
  factCard: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(30, 36, 46, 0.6)',
    borderWidth: 1,
    borderColor: theme.border,
  },
  factCardPressed: {
    opacity: 0.8,
  },
  factPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  factPromptText: {
    fontSize: 16,
    color: theme.text,
    fontWeight: '500',
  },
  factContent: {
    padding: Spacing.xl,
  },
  factHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  factLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.accent,
    flex: 1,
  },
  factVoteBtn: {
    padding: Spacing.xs,
  },
  factText: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  tapAgainText: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  loadingFactsContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  tourBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.backgroundSecondary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  tourBackButtonPressed: {
    opacity: 0.8,
  },
  tourBackButtonText: {
    ...Typography.headline,
    color: theme.accent,
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  reportModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  reportModalInner: {
    padding: Spacing.xl,
  },
  reportModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  reportLabel: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: Spacing.sm,
  },
  reasonButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  reasonButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: theme.backgroundTertiary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  reasonButtonActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  reasonButtonText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  reasonButtonTextActive: {
    color: '#FFF',
    fontWeight: '500',
  },
  reportCommentInput: {
    backgroundColor: theme.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    fontSize: 15,
    color: theme.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.xl,
  },
  reportButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  reportCancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    backgroundColor: theme.backgroundTertiary,
  },
  reportCancelText: {
    fontSize: 15,
    color: theme.textSecondary,
  },
  reportSubmitButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F44336',
  },
  reportSubmitButtonDisabled: {
    opacity: 0.6,
  },
  reportSubmitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
