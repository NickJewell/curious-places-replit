import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import CompassScreen from "@/screens/CompassScreen";
import ListDetailScreen from "@/screens/ListDetailScreen";
import TourDetailScreen from "@/screens/TourDetailScreen";
import PlaceDetailScreen from "@/screens/PlaceDetailScreen";
import VisitedPlacesScreen from "@/screens/VisitedPlacesScreen";
import AdminEditScreen from "@/screens/AdminEditScreen";
import LoginScreen from "@/screens/LoginScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Compass: { fromTour?: boolean } | undefined;
  ListDetail: { listId: string; listName: string };
  TourDetail: { tourId: string };
  PlaceDetail: {
    placeId: string;
    placeName: string;
    placeDescription?: string;
    placeLat: number;
    placeLng: number;
    tourId?: string;
    tourName?: string;
  };
  VisitedPlaces: undefined;
  AdminEdit: { curioId: string; curioName: string; isNew?: boolean; latitude?: number; longitude?: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { theme } = useTheme();
  const { session, loading, isGuest } = useAuth();

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const isAuthenticated = session || isGuest;

  return (
    <Stack.Navigator 
      screenOptions={{
        ...screenOptions,
        headerStyle: {
          backgroundColor: theme.backgroundRoot,
        },
        headerTintColor: theme.text,
      }}
    >
      {isAuthenticated ? (
        <>
          <Stack.Screen
            name="Main"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Compass"
            component={CompassScreen}
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="ListDetail"
            component={ListDetailScreen}
            options={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="TourDetail"
            component={TourDetailScreen}
            options={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="PlaceDetail"
            component={PlaceDetailScreen}
            getId={({ params }) => params.placeId}
            options={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="VisitedPlaces"
            component={VisitedPlacesScreen}
            options={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="AdminEdit"
            component={AdminEditScreen}
            options={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          />
        </>
      ) : (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
