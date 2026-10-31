import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, Typography } from "@/constants/theme";

export default function AdminMapScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xl, paddingBottom: tabBarHeight + Spacing.xl }]}>
      <Feather name="shield" size={48} color="#E53935" />
      <Text style={styles.title}>Admin Map</Text>
      <Text style={styles.subtitle}>
        The admin map with delete functionality is only available on mobile devices via Expo Go.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  title: {
    color: "#fff",
    ...Typography.title,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
    textAlign: "center",
  },
});
