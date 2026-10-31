import React, { useState, useEffect } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, Typography } from "@/constants/theme";
import { getNearestCurios, Curio } from "@/lib/supabase";

const LONDON_CENTER = {
  latitude: 51.5074,
  longitude: -0.1278,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [curios, setCurios] = useState<Curio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurios();
  }, []);

  const loadCurios = async () => {
    setLoading(true);
    try {
      const data = await getNearestCurios(LONDON_CENTER.latitude, LONDON_CENTER.longitude, 20);
      setCurios(data);
    } catch (error) {
      console.error("Error loading curios:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.webFallback, { paddingTop: insets.top + Spacing.xl, paddingBottom: tabBarHeight + Spacing.xl }]}>
      <Feather name="map" size={64} color={Colors.dark.inactive} />
      <Text style={styles.webFallbackTitle}>Map View</Text>
      <Text style={styles.webFallbackText}>
        Open this app in Expo Go on your phone to explore the interactive map with nearby curiosities.
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={Colors.dark.accent} />
      ) : (
        <Text style={styles.webFallbackHint}>
          {curios.length} curiosities available to discover
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  webFallback: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  webFallbackTitle: {
    ...Typography.title,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  webFallbackText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  webFallbackHint: {
    ...Typography.caption,
    color: Colors.dark.accent,
  },
});
