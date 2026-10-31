import React, { useState, useCallback } from "react";
import { StyleSheet, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HuntProvider } from "@/contexts/HuntContext";
import { TourProvider } from "@/contexts/TourContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { CheckinProvider } from "@/contexts/CheckinContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useTheme } from "@/hooks/useTheme";
import { SplashScreen } from "@/components/SplashScreen";

function AppContent() {
  const [showSplash, setShowSplash] = useState(Platform.OS === 'web');
  const { isDark } = useTheme();

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.root}>
        <KeyboardProvider>
          <NavigationContainer>
            <RootStackNavigator />
          </NavigationContainer>
          <StatusBar style={isDark ? "light" : "dark"} />
          {showSplash ? <SplashScreen onFinish={handleSplashFinish} /> : null}
        </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <CheckinProvider>
              <HuntProvider>
                <TourProvider>
                  <AppContent />
                </TourProvider>
              </HuntProvider>
            </CheckinProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
