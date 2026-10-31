import React, { Component, ReactNode, forwardRef, ForwardedRef, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Spacing, Typography, type ThemeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

interface MapErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  constructor(props: MapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.log("MapView error:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <MapFallback />;
    }
    return this.props.children;
  }
}

function MapFallback() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.fallback}>
      <Feather name="map" size={64} color={theme.inactive} />
      <Text style={styles.title}>Map Unavailable</Text>
      <Text style={styles.text}>
        The interactive map is not available in this version of Expo Go. Please try updating Expo Go or use the Explore tab to browse locations.
      </Text>
    </View>
  );
}

let MapViewComponent: any = null;
let MarkerComponent: any = null;
let CalloutComponent: any = null;
let PolylineComponent: any = null;
let CircleComponent: any = null;
let PROVIDER_GOOGLE_VALUE: any = undefined;
let mapModuleAvailable = false;

try {
  const maps = require("react-native-maps");
  MapViewComponent = maps.default;
  MarkerComponent = maps.Marker;
  CalloutComponent = maps.Callout;
  PolylineComponent = maps.Polyline;
  CircleComponent = maps.Circle;
  PROVIDER_GOOGLE_VALUE = maps.PROVIDER_GOOGLE;
  mapModuleAvailable = true;
} catch (e) {
  console.log("react-native-maps not available");
}

export const isMapAvailable = mapModuleAvailable;

export { MarkerComponent as Marker, CalloutComponent as Callout, PolylineComponent as Polyline, CircleComponent as Circle, PROVIDER_GOOGLE_VALUE as PROVIDER_GOOGLE };

interface SafeMapViewProps {
  children?: ReactNode;
  [key: string]: any;
}

const SafeMapView = forwardRef((props: SafeMapViewProps, ref: ForwardedRef<any>) => {
  if (!mapModuleAvailable || !MapViewComponent) {
    return <MapFallback />;
  }

  return (
    <MapErrorBoundary>
      <MapViewComponent ref={ref} {...props} />
    </MapErrorBoundary>
  );
});

SafeMapView.displayName = "SafeMapView";

export default SafeMapView;

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: theme.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  title: {
    ...Typography.title,
    color: theme.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  text: {
    ...Typography.body,
    color: theme.textSecondary,
    textAlign: "center",
  },
});
