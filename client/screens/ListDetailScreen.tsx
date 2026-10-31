import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, Typography, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useHunt } from '@/contexts/HuntContext';
import { getListItems, removePlaceFromList, reorderListItems, updateListName, getListById } from '@/lib/lists';
import type { ListItem, UserList } from '../../shared/schema';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';

const ITEM_HEIGHT = 72;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ListDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { listId, listName: initialListName } = route.params || {};
  const { setActiveTarget } = useHunt();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [list, setList] = useState<UserList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [listName, setListName] = useState(initialListName || '');

  const loadListData = useCallback(async () => {
    if (!listId) return;

    setLoading(true);
    try {
      const [listData, listItems] = await Promise.all([
        getListById(listId),
        getListItems(listId),
      ]);
      setList(listData);
      setItems(listItems);
      if (listData) {
        setListName(listData.name);
      }
    } catch (error) {
      console.error('Error loading list data:', error);
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useFocusEffect(
    useCallback(() => {
      loadListData();
    }, [loadListData])
  );

  const handleRemoveItem = async (itemId: string, placeName: string) => {
    Alert.alert(
      'Remove Place',
      `Remove "${placeName}" from this list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await removePlaceFromList(itemId);
            if (success) {
              setItems((prev) => prev.filter((item) => item.id !== itemId));
            } else {
              Alert.alert('Error', 'Failed to remove place.');
            }
          },
        },
      ]
    );
  };

  const handleSaveName = async () => {
    if (!listName.trim() || !listId) return;
    
    setEditingName(false);
    const success = await updateListName(listId, listName);
    if (!success) {
      Alert.alert('Error', 'Failed to update list name.');
      if (list) {
        setListName(list.name);
      }
    }
  };

  const handleStartHunt = () => {
    if (items.length === 0) {
      Alert.alert('Empty List', 'Add some places to your list first.');
      return;
    }
    
    const firstItem = items[0];
    setActiveTarget({
      id: firstItem.place_id,
      name: firstItem.place_name,
      description: firstItem.place_description,
      latitude: firstItem.place_latitude,
      longitude: firstItem.place_longitude,
    });
    navigation.navigate('Compass');
  };

  const moveItem = useCallback(async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const newItems = [...items];
    const [movedItem] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, movedItem);

    const updatedItems = newItems.map((item, index) => ({
      ...item,
      order_index: index + 1,
    }));

    setItems(updatedItems);

    const reorderData = updatedItems.map((item) => ({
      id: item.id,
      order_index: item.order_index,
    }));

    await reorderListItems(listId, reorderData);
  }, [items, listId]);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        
        {editingName ? (
          <TextInput
            style={styles.headerTitleInput}
            value={listName}
            onChangeText={setListName}
            onBlur={handleSaveName}
            onSubmitEditing={handleSaveName}
            autoFocus
            selectTextOnFocus
          />
        ) : (
          <Pressable onPress={() => setEditingName(true)} style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {listName}
            </Text>
            <Feather name="edit-2" size={16} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="map-pin" size={48} color={theme.textSecondary} />
          <Text style={styles.emptyTitle}>No Places Yet</Text>
          <Text style={styles.emptyDescription}>
            Find places on the map and save them to this list.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.itemCount}>
            {items.length} {items.length === 1 ? 'place' : 'places'}
          </Text>
          <Text style={styles.hintText}>
            Tap and hold, then drag to reorder
          </Text>
          {items.map((item, index) => (
            <DraggableItem
              key={item.id}
              item={item}
              index={index}
              itemsCount={items.length}
              onMove={moveItem}
              onRemove={() => handleRemoveItem(item.id, item.place_name)}
              theme={theme}
              styles={styles}
            />
          ))}
        </ScrollView>
      )}

      {items.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              pressed && styles.startButtonPressed,
            ]}
            onPress={handleStartHunt}
          >
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <Feather name="navigation" size={20} color={theme.textAccent} />
            <Text style={styles.startButtonText}>Start Hunt</Text>
          </Pressable>
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}

interface DraggableItemProps {
  item: ListItem;
  index: number;
  itemsCount: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  theme: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function DraggableItem({
  item,
  index,
  itemsCount,
  onMove,
  onRemove,
  theme,
  styles,
}: DraggableItemProps) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const isActive = useSharedValue(false);
  const startY = useSharedValue(0);

  const handleMoveComplete = (fromIndex: number, toIndex: number) => {
    onMove(fromIndex, toIndex);
  };

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart(() => {
      startY.value = translateY.value;
      isActive.value = true;
    })
    .onUpdate((event) => {
      translateY.value = startY.value + event.translationY;
    })
    .onEnd(() => {
      const newIndex = Math.round(translateY.value / ITEM_HEIGHT) + index;
      const clampedIndex = Math.max(0, Math.min(itemsCount - 1, newIndex));
      
      if (clampedIndex !== index) {
        runOnJS(handleMoveComplete)(index, clampedIndex);
      }
      
      translateY.value = withSpring(0);
      isActive.value = false;
    });

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onUpdate((event) => {
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -80);
      }
    })
    .onEnd((event) => {
      if (event.translationX < -40) {
        translateX.value = withSpring(-60);
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: translateY.value },
        { translateX: translateX.value },
      ],
      zIndex: isActive.value ? 100 : 1,
      shadowOpacity: isActive.value ? 0.3 : 0,
    };
  });

  const deleteButtonStyle = useAnimatedStyle(() => {
    return {
      opacity: translateX.value < -20 ? 1 : 0,
    };
  });

  return (
    <View style={styles.itemWrapper}>
      <Animated.View style={[styles.deleteButton, deleteButtonStyle]}>
        <Pressable style={styles.deleteAction} onPress={onRemove}>
          <Feather name="trash-2" size={20} color="#FFFFFF" />
        </Pressable>
      </Animated.View>
      
      <GestureDetector gesture={Gesture.Race(panGesture, swipeGesture)}>
        <Animated.View style={[styles.itemContainer, animatedStyle]}>
          <View style={styles.itemContent}>
            <View style={styles.orderBadge}>
              <Text style={styles.orderNumber}>{index + 1}</Text>
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.place_name}
              </Text>
              <Text style={styles.itemDescription} numberOfLines={1}>
                {item.place_description}
              </Text>
            </View>
            <View style={styles.dragHandle}>
              <Feather name="menu" size={20} color={theme.textSecondary} />
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundRoot,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    ...Typography.title,
    color: theme.text,
    flex: 1,
  },
  headerTitleInput: {
    flex: 1,
    ...Typography.title,
    color: theme.text,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  itemCount: {
    ...Typography.caption,
    color: theme.textSecondary,
    marginBottom: Spacing.xs,
  },
  hintText: {
    ...Typography.caption,
    color: theme.textSecondary,
    marginBottom: Spacing.lg,
    fontStyle: 'italic',
  },
  itemWrapper: {
    marginBottom: Spacing.sm,
    position: 'relative',
  },
  deleteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  itemContainer: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    height: ITEM_HEIGHT,
  },
  orderBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  orderNumber: {
    ...Typography.headline,
    color: '#FFFFFF',
    fontSize: 14,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...Typography.headline,
    color: theme.text,
    marginBottom: Spacing.xs,
  },
  itemDescription: {
    ...Typography.caption,
    color: theme.textSecondary,
  },
  dragHandle: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAction: {
    backgroundColor: '#C53030',
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    height: ITEM_HEIGHT,
    borderTopRightRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
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
  footer: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: 0,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(21, 26, 35, 0.9)',
    gap: Spacing.sm,
  },
  startButtonPressed: {
    opacity: 0.7,
  },
  startButtonText: {
    ...Typography.headline,
    color: theme.textAccent,
  },
});
