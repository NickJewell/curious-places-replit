import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, Typography } from '@/constants/theme';
import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { getUserLists, createList, deleteList, getOfficialTours } from '@/lib/lists';
import type { ListWithItemCount, Tour } from '../../shared/schema';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type TabOption = 'lists' | 'tours';

export default function ListsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { user, isGuest } = useAuth();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeTab, setActiveTab] = useState<TabOption>('tours');
  const [lists, setLists] = useState<ListWithItemCount[]>([]);
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadLists = useCallback(async () => {
    if (!user?.id || isGuest) {
      setLists([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const userLists = await getUserLists(user.id);
      setLists(userLists);
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isGuest]);

  const loadTours = useCallback(async () => {
    setLoading(true);
    try {
      const officialTours = await getOfficialTours();
      setTours(officialTours);
    } catch (error) {
      console.error('Error loading tours:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'lists') {
        loadLists();
      } else {
        loadTours();
      }
    }, [activeTab, loadLists, loadTours])
  );

  const handleCreateList = async () => {
    if (!newListName.trim() || !user?.id) return;

    setCreating(true);
    try {
      await createList(user.id, newListName);
      setNewListName('');
      setShowCreateModal(false);
      await loadLists();
    } catch (error) {
      Alert.alert('Error', 'Failed to create list. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteList = async (listId: string, listName: string) => {
    Alert.alert(
      'Delete List',
      `Are you sure you want to delete "${listName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteList(listId);
            if (success) {
              setLists((prev) => prev.filter((l) => l.id !== listId));
            } else {
              Alert.alert('Error', 'Failed to delete list.');
            }
          },
        },
      ]
    );
  };

  const handleOpenList = (list: ListWithItemCount) => {
    navigation.navigate('ListDetail', { listId: list.id, listName: list.name });
  };

  const handleOpenTour = (tour: Tour) => {
    navigation.navigate('TourDetail', { tourId: tour.id });
  };

  const promotedTours = useMemo(() => {
    return tours.filter(t => t.promoted_flag);
  }, [tours]);

  const tourSections = useMemo(() => {
    const grouped: Record<string, Tour[]> = {};
    for (const tour of tours) {
      const region = tour.tour_start_region || tour.metadata?.tour_start_region || 'Other';
      if (!grouped[region]) {
        grouped[region] = [];
      }
      grouped[region].push(tour);
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
      })
      .map(([title, data]) => ({ title, data }));
  }, [tours]);

  const renderRightActions = (listId: string, listName: string) => {
    return (
      <Pressable
        style={styles.deleteAction}
        onPress={() => handleDeleteList(listId, listName)}
      >
        <Feather name="trash-2" size={20} color="#FFFFFF" />
        <Text style={styles.deleteActionText}>Delete</Text>
      </Pressable>
    );
  };

  const renderListItem = ({ item }: { item: ListWithItemCount }) => {
    const formattedDate = new Date(item.created_at).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item.id, item.name)}
        overshootRight={false}
      >
        <Pressable
          style={({ pressed }) => [
            styles.listCard,
            pressed && styles.listCardPressed,
          ]}
          onPress={() => handleOpenList(item)}
        >
          <View style={styles.listCardContent}>
            <View style={styles.listIcon}>
              <Feather name="list" size={20} color={theme.accent} />
            </View>
            <View style={styles.listInfo}>
              <Text style={styles.listName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.listMeta}>
                {item.item_count} {item.item_count === 1 ? 'place' : 'places'}
                {' · '}
                {formattedDate}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </View>
        </Pressable>
      </Swipeable>
    );
  };

  const renderTourCard = ({ item, isPromotedSection = false }: { item: Tour; isPromotedSection?: boolean }) => {
    const duration = item.metadata?.duration;
    const tourLength = item.tour_length;
    const heroImage = item.metadata?.hero_image;
    const isPromoted = isPromotedSection && item.promoted_flag;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.tourCard,
          isPromoted ? styles.promotedTourCard : null,
          pressed && styles.tourCardPressed,
        ]}
        onPress={() => handleOpenTour(item)}
      >
        <ImageBackground
          source={heroImage ? { uri: heroImage } : undefined}
          style={styles.tourCardImage}
          resizeMode="cover"
        >
          <View style={[styles.tourCardOverlay, isPromoted ? styles.promotedCardOverlay : null]}>
            {!heroImage ? (
              <Feather name="map" size={32} color={isPromoted ? '#D4A017' : theme.textSecondary} />
            ) : null}
          </View>
        </ImageBackground>
        <View style={styles.tourCardContent}>
          <Text style={[styles.tourCardTitle, isPromoted ? styles.promotedTourTitle : null]} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.tourCardMeta}>
            {duration ? (
              <View style={[styles.tourBadge, isPromoted ? styles.promotedBadge : null]}>
                <Feather name="clock" size={12} color={isPromoted ? '#D4A017' : theme.textSecondary} />
                <Text style={[styles.tourBadgeText, isPromoted ? styles.promotedBadgeText : null]}>{duration}</Text>
              </View>
            ) : null}
            {tourLength ? (
              <View style={[styles.tourBadge, isPromoted ? styles.promotedBadge : null]}>
                <Feather name="navigation" size={12} color={isPromoted ? '#D4A017' : theme.textSecondary} />
                <Text style={[styles.tourBadgeText, isPromoted ? styles.promotedBadgeText : null]}>{tourLength}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.tourCardStops, isPromoted ? styles.promotedStops : null]}>
            {item.item_count} {item.item_count === 1 ? 'stop' : 'stops'}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => {
    if (activeTab === 'tours') {
      return (
        <View style={styles.emptyState}>
          <Feather name="map" size={48} color={theme.textSecondary} />
          <Text style={styles.emptyTitle}>No Tours Available</Text>
          <Text style={styles.emptyDescription}>
            Official curated tours will appear here. Check back soon!
          </Text>
        </View>
      );
    }

    if (isGuest) {
      return (
        <View style={styles.emptyState}>
          <Feather name="lock" size={48} color={theme.textSecondary} />
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptyDescription}>
            Create an account to save your favorite places into custom lists.
          </Text>
          <Pressable
            style={styles.signInButton}
            onPress={() => navigation.navigate('Login' as any)}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Feather name="list" size={48} color={theme.textSecondary} />
        <Text style={styles.emptyTitle}>No Lists Yet</Text>
        <Text style={styles.emptyDescription}>
          Create your first list to save places you want to explore.
        </Text>
      </View>
    );
  };

  const SegmentedControl = () => (
    <View style={styles.segmentedControl}>
      <Pressable
        style={[
          styles.segmentButton,
          activeTab === 'tours' && styles.segmentButtonActive,
        ]}
        onPress={() => setActiveTab('tours')}
      >
        <Text
          style={[
            styles.segmentButtonText,
            activeTab === 'tours' && styles.segmentButtonTextActive,
          ]}
        >
          Official Tours
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.segmentButton,
          activeTab === 'lists' && styles.segmentButtonActive,
        ]}
        onPress={() => setActiveTab('lists')}
      >
        <Text
          style={[
            styles.segmentButtonText,
            activeTab === 'lists' && styles.segmentButtonTextActive,
          ]}
        >
          My Lists
        </Text>
      </Pressable>
    </View>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={styles.headerTitle}>Tours</Text>
        {activeTab === 'lists' && !isGuest ? (
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
            ]}
            onPress={() => setShowCreateModal(true)}
          >
            <Feather name="plus" size={24} color={theme.text} />
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <SegmentedControl />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : activeTab === 'lists' ? (
        <FlatList
          key="lists-flatlist"
          data={lists}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarHeight + Spacing.xl },
            lists.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <SectionList
          key="tours-sectionlist"
          sections={tourSections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderTourCard({ item })}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{title}</Text>
            </View>
          )}
          ListHeaderComponent={
            promotedTours.length > 0 ? (
              <View style={styles.promotedSection}>
                <View style={styles.promotedHeaderRow}>
                  <Feather name="star" size={18} color="#D4A017" />
                  <Text style={styles.promotedHeaderText}>Featured Tours</Text>
                </View>
                {promotedTours.map((tour) => (
                  <View key={`promoted-${tour.id}`}>
                    {renderTourCard({ item: tour, isPromotedSection: true })}
                  </View>
                ))}
              </View>
            ) : null
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarHeight + Spacing.xl },
            tours.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}

      <Modal
        visible={showCreateModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowCreateModal(false)}
          />
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.modalContent}
          >
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <View style={styles.modalInner}>
              <Text style={styles.modalTitle}>Create New List</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="List name"
                placeholderTextColor={theme.textSecondary}
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateList}
              />
              <View style={styles.modalButtons}>
                <Pressable
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setNewListName('');
                    setShowCreateModal(false);
                  }}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalButton,
                    styles.modalButtonCreate,
                    (!newListName.trim() || creating) && styles.modalButtonDisabled,
                  ]}
                  onPress={handleCreateList}
                  disabled={!newListName.trim() || creating}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalButtonCreateText}>Create</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundRoot,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    ...Typography.largeTitle,
    color: theme.text,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: theme.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonPressed: {
    opacity: 0.6,
  },
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.xs,
  },
  segmentButtonActive: {
    backgroundColor: theme.accent,
  },
  segmentButtonText: {
    ...Typography.callout,
    color: theme.textSecondary,
  },
  segmentButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  emptyListContent: {
    flex: 1,
  },
  sectionHeader: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionHeaderText: {
    ...Typography.title,
    color: theme.text,
  },
  tourCard: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    flexDirection: 'row',
    height: 120,
  },
  tourCardPressed: {
    opacity: 0.8,
  },
  tourCardImage: {
    width: 120,
    height: 120,
    backgroundColor: theme.backgroundTertiary,
  },
  tourCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  tourCardContent: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: 'center',
  },
  tourCardTitle: {
    ...Typography.headline,
    color: theme.text,
    marginBottom: Spacing.sm,
  },
  tourCardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  tourBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundTertiary,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  tourBadgeText: {
    ...Typography.caption,
    color: theme.textSecondary,
  },
  tourCardStops: {
    ...Typography.caption,
    color: theme.accent,
  },
  promotedSection: {
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 160, 23, 0.2)',
  },
  promotedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  promotedHeaderText: {
    ...Typography.title,
    color: '#D4A017',
  },
  promotedTourCard: {
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.4)',
    backgroundColor: 'rgba(212, 160, 23, 0.08)',
  },
  promotedCardOverlay: {
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
  },
  promotedTourTitle: {
    color: '#F0D060',
  },
  promotedBadge: {
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
  },
  promotedBadgeText: {
    color: '#D4A017',
  },
  promotedStops: {
    color: '#D4A017',
  },
  listCard: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  listCardPressed: {
    opacity: 0.7,
  },
  listCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  listIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: theme.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    ...Typography.headline,
    color: theme.text,
    marginBottom: Spacing.xs,
  },
  listMeta: {
    ...Typography.caption,
    color: theme.textSecondary,
  },
  deleteAction: {
    backgroundColor: '#C53030',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: Spacing.md,
    borderTopRightRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
  },
  deleteActionText: {
    color: '#FFFFFF',
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['3xl'],
  },
  emptyTitle: {
    ...Typography.title,
    color: theme.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyDescription: {
    ...Typography.body,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  signInButton: {
    marginTop: Spacing.xl,
    backgroundColor: theme.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['3xl'],
    borderRadius: BorderRadius.md,
  },
  signInButtonText: {
    color: '#FFFFFF',
    ...Typography.headline,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    width: '85%',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  modalInner: {
    padding: Spacing.xl,
  },
  modalTitle: {
    ...Typography.title,
    color: theme.text,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: theme.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: theme.text,
    marginBottom: Spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  modalButtonCancel: {
    backgroundColor: theme.backgroundTertiary,
  },
  modalButtonCancelText: {
    ...Typography.headline,
    color: theme.text,
  },
  modalButtonCreate: {
    backgroundColor: theme.accent,
  },
  modalButtonCreateText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
});
