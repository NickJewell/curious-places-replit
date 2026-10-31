import React, { forwardRef, ForwardedRef, ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, Typography } from "@/constants/theme";

export const isMapAvailable = false;
export const Marker = null;
export const Callout = null;
export const Polyline = null;
export const PROVIDER_GOOGLE = undefined;

function MapFallback() {
  return (
    <View style={styles.fallback}>
      <Feather name="map" size={64} color={Colors.dark.inactive} />
      <Text style={styles.title}>Map Unavailable</Text>
      <Text style={styles.text}>
        The interactive map is available on the mobile app. Use Expo Go on your device to view the map.
      </Text>
    </View>
  );
}

interface SafeMapViewProps {
  children?: ReactNode;
  [key: string]: any;
}

const SafeMapView = forwardRef((_props: SafeMapViewProps, _ref: ForwardedRef<any>) => {
  return <MapFallback />;
});

SafeMapView.displayName = "SafeMapView";

export default SafeMapView;

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  title: {
    ...Typography.title,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  text: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
});
