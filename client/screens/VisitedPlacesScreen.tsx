import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckins } from '@/contexts/CheckinContext';
import { getAllCheckins, uncheckIn, type Checkin } from '@/lib/checkins';
import { Colors, Spacing, BorderRadius, Typography, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'VisitedPlaces'>;
}

export default function VisitedPlacesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { removeCheckin } = useCheckins();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  
  const [loading, setLoading] = useState(true);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadCheckins = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const data = await getAllCheckins(user.id);
      setCheckins(data);
    } catch (error) {
      console.error('Error loading checkins:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadCheckins();
    }, [loadCheckins])
  );

  const handleRemoveCheckin = async (checkin: Checkin) => {
    Alert.alert(
      'Remove Check-in',
      `Remove your check-in for "${checkin.place_name}"? You can check in again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            
            setRemovingId(checkin.id);
            try {
              const result = await uncheckIn(user.id, checkin.place_id);
              if (result.success) {
                setCheckins(prev => prev.filter(c => c.id !== checkin.id));
                removeCheckin(checkin.place_id);
              } else {
                Alert.alert('Error', 'Failed to remove check-in');
              }
            } catch (error) {
              console.error('Error removing checkin:', error);
              Alert.alert('Error', 'Failed to remove check-in');
            } finally {
              setRemovingId(null);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderCheckin = ({ item }: { item: Checkin }) => (
    <View style={styles.checkinItem}>
      <View style={styles.checkinIcon}>
        <Feather name="check-circle" size={20} color="#4CAF50" />
      </View>
      <View style={styles.checkinInfo}>
        <Text style={styles.checkinName} numberOfLines={1}>
          {item.place_name}
        </Text>
        <Text style={styles.checkinDate}>
          Visited {formatDate(item.checked_in_at)}
        </Text>
      </View>
      <Pressable
        style={styles.removeButton}
        onPress={() => handleRemoveCheckin(item)}
        disabled={removingId === item.id}
      >
        {removingId === item.id ? (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ) : (
          <Feather name="x" size={18} color={theme.textSecondary} />
        )}
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Places Visited</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : checkins.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="map-pin" size={48} color={theme.textSecondary} />
          <Text style={styles.emptyTitle}>No places visited yet</Text>
          <Text style={styles.emptySubtitle}>
            Start exploring and check in to places you visit
          </Text>
        </View>
      ) : (
        <FlatList
          data={checkins}
          renderItem={renderCheckin}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundRoot,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  listContent: {
    padding: Spacing.lg,
  },
  checkinItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundCard,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  checkinIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  checkinInfo: {
    flex: 1,
  },
  checkinName: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.text,
  },
  checkinDate: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 2,
  },
  removeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: theme.backgroundSecondary,
  },
});
