import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, Spacing, BorderRadius, Typography, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { getTourWithStops } from '@/lib/lists';
import { useTour } from '@/contexts/TourContext';
import { useHunt } from '@/contexts/HuntContext';
import SafeMapView, { Marker, Polyline, isMapAvailable, PROVIDER_GOOGLE } from '@/components/SafeMapView';
import type { Tour, ListItem } from '../../shared/schema';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'TourDetail'>;

export default function TourDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { tourId } = route.params;
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { setActiveTour } = useTour();
  const { setActiveTarget } = useHunt();

  const [tour, setTour] = useState<Tour | null>(null);
  const [stops, setStops] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTourData = useCallback(async () => {
    setLoading(true);
    try {
      const { tour: tourData, stops: stopsData } = await getTourWithStops(tourId);
      setTour(tourData);
      setStops(stopsData);
    } catch (error) {
      console.error('Error loading tour:', error);
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    loadTourData();
  }, [loadTourData]);

  const handleStartTour = () => {
    if (!tour || stops.length === 0) {
      Alert.alert('Cannot Start Tour', 'This tour has no stops to visit.');
      return;
    }

    setActiveTour(tour);

    const firstStop = stops[0];
    navigation.navigate('PlaceDetail', {
      placeId: firstStop.place_id,
      placeName: firstStop.place_name,
      placeDescription: firstStop.place_description,
      placeLat: firstStop.place_latitude,
      placeLng: firstStop.place_longitude,
      tourId: tour.id,
      tourName: tour.name,
    });
  };

  const handleStopPress = (stop: ListItem) => {
    navigation.navigate('PlaceDetail', {
      placeId: stop.place_id,
      placeName: stop.place_name,
      placeDescription: stop.place_description,
      placeLat: stop.place_latitude,
      placeLng: stop.place_longitude,
      tourId: tour?.id,
      tourName: tour?.name,
    });
  };

  const mapRegion = useMemo(() => {
    if (stops.length === 0) return null;
    let minLat = stops[0].place_latitude;
    let maxLat = stops[0].place_latitude;
    let minLng = stops[0].place_longitude;
    let maxLng = stops[0].place_longitude;
    for (const stop of stops) {
      if (stop.place_latitude < minLat) minLat = stop.place_latitude;
      if (stop.place_latitude > maxLat) maxLat = stop.place_latitude;
      if (stop.place_longitude < minLng) minLng = stop.place_longitude;
      if (stop.place_longitude > maxLng) maxLng = stop.place_longitude;
    }
    const PAD = 0.3;
    const latDelta = Math.max((maxLat - minLat) * (1 + PAD), 0.005);
    const lngDelta = Math.max((maxLng - minLng) * (1 + PAD), 0.005);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [stops]);

  const routeCoords = useMemo(() =>
    stops.map(s => ({ latitude: s.place_latitude, longitude: s.place_longitude })),
    [stops]
  );

  const getMarkerColor = (index: number) => {
    if (index === 0) return '#4CAF50';
    if (index === stops.length - 1 && stops.length > 1) return '#FF6B6B';
    return theme.accent;
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!tour) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Feather name="alert-circle" size={48} color={theme.textSecondary} />
        <Text style={styles.errorText}>Tour not found</Text>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const tourLength = tour.tour_length;
  const duration = tour.metadata?.duration;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroImage}>
          {isMapAvailable && mapRegion && stops.length > 0 ? (
            <SafeMapView
              style={StyleSheet.absoluteFill}
              provider={PROVIDER_GOOGLE}
              initialRegion={mapRegion}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              showsUserLocation={false}
              showsMyLocationButton={false}
              userInterfaceStyle="dark"
              pointerEvents="none"
            >
              {Polyline && routeCoords.length > 1 ? (
                <Polyline
                  coordinates={routeCoords}
                  strokeColor={theme.accent}
                  strokeWidth={3}
                />
              ) : null}
              {Marker ? stops.map((stop, index) => (
                <Marker
                  key={stop.id}
                  coordinate={{ latitude: stop.place_latitude, longitude: stop.place_longitude }}
                  tracksViewChanges={false}
                  pinColor={getMarkerColor(index)}
                />
              )) : null}
            </SafeMapView>
          ) : (
            <View style={styles.heroPlaceholder}>
              <Feather name="map" size={64} color={theme.textSecondary} />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(10, 14, 20, 0.6)', theme.backgroundRoot]}
            style={styles.heroGradient}
          />
          <Pressable
            style={[styles.headerBackButton, { top: insets.top + Spacing.md }]}
            onPress={() => navigation.goBack()}
          >
            <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <Feather name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          {stops.length > 0 ? (
            <View style={styles.mapLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
                <Text style={styles.legendText}>Start</Text>
              </View>
              {stops.length > 1 ? (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
                  <Text style={styles.legendText}>Finish</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{tour.name}</Text>

          <View style={styles.statsRow}>
            {tourLength ? (
              <View style={styles.statBadge}>
                <Feather name="navigation" size={14} color={theme.accent} />
                <Text style={styles.statText}>{tourLength}</Text>
              </View>
            ) : null}
            {duration ? (
              <View style={styles.statBadge}>
                <Feather name="clock" size={14} color={theme.accent} />
                <Text style={styles.statText}>{duration}</Text>
              </View>
            ) : null}
            <View style={styles.statBadge}>
              <Feather name="map-pin" size={14} color={theme.accent} />
              <Text style={styles.statText}>{stops.length} {stops.length === 1 ? 'stop' : 'stops'}</Text>
            </View>
          </View>

          {tour.description ? (
            <Text style={styles.description}>{tour.description}</Text>
          ) : null}

          <Text style={styles.sectionTitle}>
            Route ({stops.length} {stops.length === 1 ? 'stop' : 'stops'})
          </Text>

          <View style={styles.routeList}>
            {stops.map((stop, index) => (
              <Pressable
                key={stop.id}
                style={({ pressed }) => [
                  styles.stopItem,
                  pressed && styles.stopItemPressed,
                ]}
                onPress={() => handleStopPress(stop)}
              >
                <View style={styles.stopConnector}>
                  <View style={styles.stopNumber}>
                    <Text style={styles.stopNumberText}>{index + 1}</Text>
                  </View>
                  {index < stops.length - 1 ? (
                    <View style={styles.connectorLine} />
                  ) : null}
                </View>
                <View style={styles.stopContent}>
                  <Text style={styles.stopName} numberOfLines={1}>
                    {stop.place_name}
                  </Text>
                  <Text style={styles.stopDescription} numberOfLines={2}>
                    {stop.place_description}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <BlurView intensity={60} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <Pressable
          style={({ pressed }) => [
            styles.startButton,
            pressed && styles.startButtonPressed,
            stops.length === 0 && styles.startButtonDisabled,
          ]}
          onPress={handleStartTour}
          disabled={stops.length === 0}
        >
          <Feather name="navigation" size={20} color="#FFFFFF" />
          <Text style={styles.startButtonText}>Start Tour</Text>
        </Pressable>
      </View>
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
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  errorText: {
    ...Typography.headline,
    color: theme.textSecondary,
  },
  backButton: {
    backgroundColor: theme.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  heroImage: {
    height: 280,
    backgroundColor: theme.backgroundSecondary,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLegend: {
    position: 'absolute',
    bottom: Spacing['3xl'],
    right: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: 'rgba(10, 14, 20, 0.7)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: theme.text,
    fontWeight: '500',
  },
  customMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  markerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  headerBackButton: {
    position: 'absolute',
    left: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.lg,
  },
  title: {
    ...Typography.title,
    color: theme.text,
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundSecondary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  statText: {
    ...Typography.caption,
    color: theme.text,
  },
  description: {
    ...Typography.body,
    color: theme.textSecondary,
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.headline,
    color: theme.text,
    marginBottom: Spacing.lg,
  },
  routeList: {
    gap: 0,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
  },
  stopItemPressed: {
    opacity: 0.7,
  },
  stopConnector: {
    width: 40,
    alignItems: 'center',
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopNumberText: {
    ...Typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  connectorLine: {
    width: 2,
    flex: 1,
    minHeight: 40,
    backgroundColor: theme.accent,
    opacity: 0.3,
    marginTop: Spacing.xs,
  },
  stopContent: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  stopName: {
    ...Typography.headline,
    color: theme.text,
    marginBottom: Spacing.xs,
  },
  stopDescription: {
    ...Typography.caption,
    color: theme.textSecondary,
    lineHeight: 18,
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
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  startButtonPressed: {
    opacity: 0.8,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
});
