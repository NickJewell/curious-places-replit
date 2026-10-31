import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, Typography } from "@/constants/theme";

export default function AdminEditScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
      <Feather name="edit-2" size={48} color={Colors.dark.accent} />
      <Text style={styles.title}>Admin Edit</Text>
      <Text style={styles.subtitle}>
        The admin editor is only available on mobile devices via Expo Go.
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
