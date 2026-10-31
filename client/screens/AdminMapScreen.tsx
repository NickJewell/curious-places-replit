import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  FlatList,
  Keyboard,
} from "react-native";
import type { Region } from "react-native-maps";
import SafeMapView, { Marker, PROVIDER_GOOGLE, isMapAvailable } from "@/components/SafeMapView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { getCuriosNearPoint, Curio } from "@/lib/supabase";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const LONDON_CENTER = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AdminMapScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const mapRef = useRef<any>(null);

  const [curios, setCurios] = useState<Curio[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number }>(LONDON_CENTER);
  const [selectedCurio, setSelectedCurio] = useState<Curio | null>(null);
  const initialLoadDone = useRef(false);

  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ curio_id: string; name: string; lat: number; lon: number }>>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchTextChange = (text: string) => {
    setSearchText(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const url = new URL("/api/admin/places/search", getApiUrl());
        url.searchParams.set("q", text.trim());
        const res = await fetch(url.toString());
        const data = await res.json();
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const [randomLoading, setRandomLoading] = useState(false);

  const handleRandomPlace = async () => {
    setRandomLoading(true);
    try {
      const url = new URL("/api/admin/places/random", getApiUrl());
      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.curio_id) {
        handleSearchResultPress(data);
      }
    } catch {
      Alert.alert("Error", "Could not fetch a random place.");
    } finally {
      setRandomLoading(false);
    }
  };

  const handleSearchResultPress = (result: { curio_id: string; name: string; lat: number; lon: number }) => {
    Keyboard.dismiss();
    setShowSearch(false);
    setSearchText("");
    setSearchResults([]);

    const curio: Curio = {
      id: result.curio_id,
      name: result.name,
      description: "",
      latitude: result.lat,
      longitude: result.lon,
    };
    setSelectedCurio(curio);

    if (mapRef.current?.animateToRegion) {
      mapRef.current.animateToRegion({
        latitude: result.lat,
        longitude: result.lon,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 500);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setUserLocation(coords);
          setMapCenter(coords);
        }
      } catch (e) {
        console.log("Location error:", e);
      }
    })();
  }, []);

  useEffect(() => {
    loadCurios(mapCenter.latitude, mapCenter.longitude);
  }, []);

  useEffect(() => {
    if (userLocation && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadCurios(userLocation.latitude, userLocation.longitude);
    }
  }, [userLocation]);

  const loadCurios = async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const data = await getCuriosNearPoint(lat, lng, 1000);
      setCurios(data);
    } catch (e) {
      console.error("Error loading curios:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRegionChangeComplete = (region: Region) => {
    setMapCenter({ latitude: region.latitude, longitude: region.longitude });
  };

  const handleSearchHere = () => {
    setSelectedCurio(null);
    loadCurios(mapCenter.latitude, mapCenter.longitude);
  };

  const handleMarkerPress = (curio: Curio) => {
    setSelectedCurio(curio);
  };

  const handleLongPress = (event: any) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    Alert.alert(
      "Create New Place",
      `Create a new place at this location?\n\nLat: ${latitude.toFixed(6)}\nLon: ${longitude.toFixed(6)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create",
          onPress: async () => {
            setLoading(true);
            try {
              const url = new URL("/api/admin/place", getApiUrl());
              const res = await fetch(url.toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lat: latitude, lon: longitude, name: "New Place" }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Failed to create place");
              navigation.navigate("AdminEdit", {
                curioId: data.curioId,
                curioName: "New Place",
                isNew: true,
                latitude,
                longitude,
              });
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to create place");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    if (!selectedCurio) return;

    Alert.alert(
      "Delete Place",
      `Delete "${selectedCurio.name}" and all its facts? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await apiRequest("DELETE", `/api/admin/place/${selectedCurio.id}`);
              setCurios(prev => prev.filter(c => c.id !== selectedCurio.id));
              setSelectedCurio(null);
              Alert.alert("Deleted", "Place and facts removed.");
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (!isMapAvailable) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.fallbackText}>Map not available on this platform.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeMapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={LONDON_CENTER}
        showsUserLocation
        showsMyLocationButton={false}
        onRegionChangeComplete={handleRegionChangeComplete}
        onLongPress={handleLongPress}
      >
        {curios.map(curio => (
          <Marker
            key={curio.id}
            coordinate={{ latitude: curio.latitude, longitude: curio.longitude }}
            pinColor={selectedCurio?.id === curio.id ? "#FFD600" : "#E53935"}
            onPress={() => handleMarkerPress(curio)}
          />
        ))}
        {selectedCurio && !curios.find(c => c.id === selectedCurio.id) ? (
          <Marker
            key={`selected-${selectedCurio.id}`}
            coordinate={{ latitude: selectedCurio.latitude, longitude: selectedCurio.longitude }}
            pinColor="#FFD600"
            onPress={() => handleMarkerPress(selectedCurio)}
          />
        ) : null}
      </SafeMapView>

      <View style={[styles.topBar, { top: insets.top + Spacing.sm }]}>
        <Pressable style={styles.searchHereBtn} onPress={handleSearchHere}>
          <Feather name="refresh-cw" size={16} color="#fff" />
          <Text style={styles.searchHereBtnText}>
            {loading ? "Loading..." : `Search here (${curios.length})`}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.adminBadge, { top: insets.top + Spacing.sm }]}>
        <Feather name="shield" size={14} color="#E53935" />
        <Text style={styles.adminBadgeText}>Admin</Text>
      </View>

      <Pressable
        style={[styles.searchToggleBtn, { top: insets.top + Spacing.sm }]}
        onPress={() => { setShowSearch(true); setSelectedCurio(null); }}
      >
        <Feather name="search" size={18} color="#fff" />
      </Pressable>

      <Pressable
        style={[styles.randomBtn, { top: insets.top + Spacing.sm }]}
        onPress={handleRandomPlace}
        disabled={randomLoading}
      >
        {randomLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Feather name="shuffle" size={18} color="#fff" />
        )}
      </Pressable>

      {showSearch ? (
        <View style={[styles.searchOverlay, { top: insets.top + Spacing.sm }]}>
          <View style={styles.searchInputRow}>
            <Feather name="search" size={16} color={Colors.dark.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or curio ID..."
              placeholderTextColor={Colors.dark.textSecondary}
              value={searchText}
              onChangeText={handleSearchTextChange}
              autoFocus
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searching ? (
              <ActivityIndicator size="small" color={Colors.dark.accent} />
            ) : null}
            <Pressable onPress={() => { setShowSearch(false); setSearchText(""); setSearchResults([]); }}>
              <Feather name="x" size={18} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>
          {searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.curio_id}
              keyboardShouldPersistTaps="handled"
              style={styles.searchResultsList}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.searchResultItem, pressed && styles.searchResultItemPressed]}
                  onPress={() => handleSearchResultPress(item)}
                >
                  <View style={styles.searchResultContent}>
                    <Text style={styles.searchResultName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.searchResultId}>{item.curio_id}</Text>
                  </View>
                  <Feather name="arrow-right" size={16} color={Colors.dark.textSecondary} />
                </Pressable>
              )}
            />
          ) : searchText.length >= 2 && !searching ? (
            <View style={styles.searchNoResults}>
              <Text style={styles.searchNoResultsText}>No results found</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {selectedCurio ? (
        <View style={[styles.panel, { bottom: tabBarHeight + Spacing.md }]}>
          <Pressable style={styles.closeBtn} onPress={() => setSelectedCurio(null)}>
            <Feather name="x" size={20} color="#999" />
          </Pressable>
          <Text style={styles.panelName} numberOfLines={2}>{selectedCurio.name}</Text>
          <Text style={styles.panelType}>{selectedCurio.curioType || "Unknown type"}</Text>
          <Text style={styles.panelId}>ID: {selectedCurio.id}</Text>
          <Text style={styles.panelDesc} numberOfLines={3}>{selectedCurio.description}</Text>
          <View style={styles.panelButtons}>
            <Pressable
              style={styles.editBtn}
              onPress={() => navigation.navigate("AdminEdit", { curioId: selectedCurio.id, curioName: selectedCurio.name })}
            >
              <Feather name="edit-2" size={18} color="#fff" />
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="trash-2" size={18} color="#fff" />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.dark.accent} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  fallbackText: {
    color: "#fff",
    ...Typography.body,
    textAlign: "center",
    marginTop: 100,
  },
  topBar: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 10,
  },
  searchHereBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30,30,30,0.9)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  searchHereBtnText: {
    color: "#fff",
    ...Typography.caption,
    fontWeight: "600",
  },
  adminBadge: {
    position: "absolute",
    right: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30,30,30,0.9)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
    zIndex: 10,
  },
  adminBadgeText: {
    color: "#E53935",
    ...Typography.caption,
    fontWeight: "700",
  },
  panel: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: "rgba(20,20,20,0.95)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    zIndex: 20,
  },
  closeBtn: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    padding: 4,
    zIndex: 1,
  },
  panelName: {
    color: "#fff",
    ...Typography.title,
    fontWeight: "700",
    marginBottom: 4,
    paddingRight: 30,
  },
  panelType: {
    color: Colors.dark.textSecondary,
    ...Typography.caption,
    marginBottom: 2,
  },
  panelId: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: Spacing.sm,
  },
  panelDesc: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  panelButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  editBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  editBtnText: {
    color: "#fff",
    ...Typography.body,
    fontWeight: "700",
  },
  deleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E53935",
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  deleteBtnDisabled: {
    opacity: 0.5,
  },
  deleteBtnText: {
    color: "#fff",
    ...Typography.body,
    fontWeight: "700",
  },
  loadingOverlay: {
    position: "absolute",
    top: "50%",
    alignSelf: "center",
  },
  searchToggleBtn: {
    position: "absolute",
    left: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(30,30,30,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  randomBtn: {
    position: "absolute",
    left: Spacing.md + 48,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(30,30,30,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  searchOverlay: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: "rgba(20,20,20,0.97)",
    borderRadius: BorderRadius.lg,
    zIndex: 30,
    maxHeight: 350,
    overflow: "hidden",
  },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    paddingVertical: Spacing.xs,
  },
  searchResultsList: {
    maxHeight: 280,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  searchResultItemPressed: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  searchResultContent: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  searchResultName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 2,
  },
  searchResultId: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  searchNoResults: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  searchNoResultsText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
});
