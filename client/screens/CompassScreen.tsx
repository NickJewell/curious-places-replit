import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Platform,
  Animated,
  Modal,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import PagerView from "@/components/PagerViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Magnetometer } from "expo-sensors";
import { getGreatCircleBearing, getDistance } from "geolib";

import ConfettiCannon from "react-native-confetti-cannon";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useHunt } from "@/contexts/HuntContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCheckins } from "@/contexts/CheckinContext";
import { checkIn, checkAndAwardBadges, hasCheckedIn, uncheckIn, type UserBadge } from "@/lib/checkins";
import CheckinSuccessModal from "@/components/CheckinSuccessModal";
import HuntMapView from "@/components/HuntMapView";
import { useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "Compass">;
}

const ARRIVAL_THRESHOLD = 10;
const LOW_PASS_FACTOR = 0.2;
const CHECKIN_THRESHOLD = 40;
const GPS_ACCURACY_THRESHOLD = 20;
const WALKING_SPEED_THRESHOLD = 1.0;
const GPS_BLEND_ALPHA = 0.6;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COMPASS_SIZE = Math.min(SCREEN_WIDTH - 80, 300);

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function circularMean(current: number, target: number, factor: number): number {
  const currentRad = (current * Math.PI) / 180;
  const targetRad = (target * Math.PI) / 180;
  
  const currentX = Math.cos(currentRad);
  const currentY = Math.sin(currentRad);
  const targetX = Math.cos(targetRad);
  const targetY = Math.sin(targetRad);
  
  const newX = currentX * (1 - factor) + targetX * factor;
  const newY = currentY * (1 - factor) + targetY * factor;
  
  let result = (Math.atan2(newY, newX) * 180) / Math.PI;
  return normalizeAngle(result);
}

function formatCoordinate(value: number, isLatitude: boolean): string {
  const direction = isLatitude 
    ? (value >= 0 ? 'N' : 'S')
    : (value >= 0 ? 'E' : 'W');
  const absValue = Math.abs(value);
  const degrees = Math.floor(absValue);
  const minutes = ((absValue - degrees) * 60).toFixed(3);
  return `${direction} ${degrees}\u00B0 ${minutes}'`;
}

export default function CompassScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, "Compass">>();
  const fromTour = route.params?.fromTour ?? false;
  const { activeTarget, setActiveTarget } = useHunt();
  const { user, isGuest } = useAuth();
  const { addCheckin, removeCheckin } = useCheckins();

  const [currentPage, setCurrentPage] = useState(0);
  const pagerRef = useRef<any>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [hasArrived, setHasArrived] = useState(false);
  const [magnetometerAvailable, setMagnetometerAvailable] = useState(true);
  const [heading, setHeading] = useState(0);
  const [headingAccuracy, setHeadingAccuracy] = useState<number | null>(null);
  const [showCalibrationHint, setShowCalibrationHint] = useState(false);
  
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [newBadge, setNewBadge] = useState<UserBadge | null>(null);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [showCheckinSuccess, setShowCheckinSuccess] = useState(false);
  const [checkinNewBadges, setCheckinNewBadges] = useState<UserBadge[]>([]);

  const arrowRotation = useRef(new Animated.Value(0)).current;
  const compassRotation = useRef(new Animated.Value(0)).current;
  const filteredHeading = useRef(0);
  const lastHeadingRef = useRef(0);
  const lastCompassRef = useRef(0);
  const confettiRef = useRef<ConfettiCannon>(null);
  const currentSpeedRef = useRef(0);
  const gpsCourseRef = useRef<number | null>(null);

  useEffect(() => {
    setHasArrived(false);
    setDistance(null);
    setUserLocation(null);
    setCanCheckIn(false);
    setAlreadyCheckedIn(false);
    setShowConfetti(false);
    setShowCalibrationHint(false);
    setHeadingAccuracy(null);
    arrowRotation.setValue(0);
    compassRotation.setValue(0);
    filteredHeading.current = 0;
    lastHeadingRef.current = 0;
    lastCompassRef.current = 0;
    currentSpeedRef.current = 0;
    gpsCourseRef.current = null;
    
    if (activeTarget && user && !isGuest) {
      hasCheckedIn(user.id, activeTarget.id).then(setAlreadyCheckedIn);
    }
  }, [activeTarget?.id, user?.id]);

  useEffect(() => {
    let locationSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;
    let magnetometerSub: { remove: () => void } | null = null;

    const setup = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 500,
          distanceInterval: 1,
        },
        (loc) => {
          const accuracy = loc.coords.accuracy ?? null;
          setLocationAccuracy(accuracy);

          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setUserLocation(coords);

          const isAccurate = accuracy === null || accuracy <= GPS_ACCURACY_THRESHOLD;

          const speed = loc.coords.speed ?? 0;
          currentSpeedRef.current = speed > 0 ? speed : 0;

          const gpsCourse = loc.coords.heading ?? null;
          if (gpsCourse !== null && gpsCourse >= 0) {
            gpsCourseRef.current = gpsCourse;
          }

          if (activeTarget) {
            const dist = getDistance(
              { latitude: coords.latitude, longitude: coords.longitude },
              { latitude: activeTarget.latitude, longitude: activeTarget.longitude }
            );

            setDistance(dist);

            if (isAccurate) {
              setCanCheckIn(dist < CHECKIN_THRESHOLD);

              if (dist < ARRIVAL_THRESHOLD && !hasArrived) {
                setHasArrived(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            }
          }
        }
      );

      try {
        headingSub = await Location.watchHeadingAsync((headingData) => {
          const trueHeading = headingData.trueHeading;
          const accuracy = headingData.accuracy;

          setHeadingAccuracy(accuracy);
          setShowCalibrationHint(accuracy === -1 || accuracy > 30);

          if (trueHeading < 0) return;

          let rawHeading = trueHeading;

          if (
            currentSpeedRef.current > WALKING_SPEED_THRESHOLD &&
            gpsCourseRef.current !== null
          ) {
            rawHeading = circularMean(trueHeading, gpsCourseRef.current, GPS_BLEND_ALPHA);
          }

          filteredHeading.current = circularMean(
            filteredHeading.current,
            rawHeading,
            LOW_PASS_FACTOR
          );

          setHeading(filteredHeading.current);
        }) as unknown as Location.LocationSubscription;
      } catch {
        const available = await Magnetometer.isAvailableAsync();
        setMagnetometerAvailable(available);

        if (available) {
          Magnetometer.setUpdateInterval(100);
          magnetometerSub = Magnetometer.addListener((data: { x: number; y: number; z: number }) => {
            const angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
            const normalizedAngle = normalizeAngle(angle);

            filteredHeading.current = circularMean(
              filteredHeading.current,
              normalizedAngle,
              LOW_PASS_FACTOR
            );

            setHeading(filteredHeading.current);
          });
        }
      }
    };

    setup();

    return () => {
      if (locationSub) locationSub.remove();
      if (headingSub) headingSub.remove();
      if (magnetometerSub) magnetometerSub.remove();
    };
  }, [activeTarget, hasArrived]);

  useEffect(() => {
    if (!userLocation || !activeTarget) return;

    const bearing = getGreatCircleBearing(
      { latitude: userLocation.latitude, longitude: userLocation.longitude },
      { latitude: activeTarget.latitude, longitude: activeTarget.longitude }
    );

    const rotation = bearing - heading;
    const normalizedRotation = ((rotation + 360) % 360);

    let diff = normalizedRotation - lastHeadingRef.current;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    const newValue = lastHeadingRef.current + diff;
    lastHeadingRef.current = newValue;

    Animated.spring(arrowRotation, {
      toValue: newValue,
      useNativeDriver: true,
      tension: 120,
      friction: 12,
    }).start();

    let compassDiff = -heading - lastCompassRef.current;
    if (compassDiff > 180) compassDiff -= 360;
    if (compassDiff < -180) compassDiff += 360;
    
    const newCompassValue = lastCompassRef.current + compassDiff;
    lastCompassRef.current = newCompassValue;

    Animated.spring(compassRotation, {
      toValue: newCompassValue,
      useNativeDriver: true,
      tension: 120,
      friction: 12,
    }).start();
  }, [userLocation, activeTarget, heading]);

  const handleStopHunt = () => {
    setActiveTarget(null);
    if (fromTour && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Main");
    }
  };

  const handleCheckIn = async () => {
    if (!activeTarget || !user || isGuest || checkingIn || alreadyCheckedIn || !canCheckIn) return;
    
    setCheckingIn(true);
    
    try {
      const result = await checkIn(
        user.id,
        activeTarget.id,
        activeTarget.name,
        activeTarget.latitude,
        activeTarget.longitude
      );
      
      if (result.success && result.isNewCheckin) {
        setAlreadyCheckedIn(true);
        addCheckin(activeTarget.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        const newBadges = await checkAndAwardBadges(user.id);
        setCheckinNewBadges(newBadges);
        setShowCheckinSuccess(true);
      } else if (result.success && !result.isNewCheckin) {
        setAlreadyCheckedIn(true);
      }
    } catch (error) {
      console.error('Check-in error:', error);
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    if (!activeTarget || !user || isGuest || checkingOut) return;
    
    setCheckingOut(true);
    try {
      const result = await uncheckIn(user.id, activeTarget.id);
      if (result.success) {
        setAlreadyCheckedIn(false);
        removeCheckin(activeTarget.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Check-out error:', error);
    } finally {
      setCheckingOut(false);
    }
  };

  const cardinalDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  
  const renderCompassDial = () => {
    const tickMarks = [];
    const dialRadius = COMPASS_SIZE / 2;
    const tickOuterRadius = dialRadius - 8;
    const tickInnerRadiusMajor = dialRadius - 24;
    const tickInnerRadiusMinor = dialRadius - 16;
    const labelRadius = dialRadius - 40;
    
    for (let i = 0; i < 360; i += 5) {
      const isMajor = i % 45 === 0;
      const isCardinal = i % 45 === 0;
      const angle = (i - 90) * (Math.PI / 180);
      
      const x1 = dialRadius + Math.cos(angle) * tickOuterRadius;
      const y1 = dialRadius + Math.sin(angle) * tickOuterRadius;
      const innerRadius = isMajor ? tickInnerRadiusMajor : tickInnerRadiusMinor;
      const x2 = dialRadius + Math.cos(angle) * innerRadius;
      const y2 = dialRadius + Math.sin(angle) * innerRadius;
      
      tickMarks.push(
        <View
          key={`tick-${i}`}
          style={[
            styles.tickMark,
            {
              left: Math.min(x1, x2),
              top: Math.min(y1, y2),
              width: isMajor ? 2 : 1,
              height: Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)),
              transform: [{ rotate: `${i}deg` }],
            },
          ]}
        />
      );
      
      if (isCardinal) {
        const directionIndex = i / 45;
        const labelX = dialRadius + Math.cos(angle) * labelRadius;
        const labelY = dialRadius + Math.sin(angle) * labelRadius;
        
        tickMarks.push(
          <Text
            key={`label-${i}`}
            style={[
              styles.cardinalLabel,
              {
                left: labelX - 12,
                top: labelY - 10,
                width: 24,
              },
            ]}
          >
            {cardinalDirections[directionIndex]}
          </Text>
        );
      }
    }
    
    return tickMarks;
  };

  if (!activeTarget) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.noTargetContainer}>
          <Feather name="compass" size={64} color="#666" />
          <Text style={styles.noTargetText}>No active hunt</Text>
          <Pressable style={styles.backButton} onPress={() => navigation.navigate("Main")}>
            <Text style={styles.backButtonText}>Return to Map</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!magnetometerAvailable && Platform.OS !== "web") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.noTargetContainer}>
          <Feather name="alert-circle" size={64} color="#666" />
          <Text style={styles.noTargetText}>Compass not supported on this device</Text>
          <Pressable style={styles.backButton} onPress={() => navigation.navigate("Main")}>
            <Text style={styles.backButtonText}>Return to Map</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (hasArrived) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {showConfetti ? (
          <ConfettiCannon
            ref={confettiRef}
            count={200}
            origin={{ x: -10, y: 0 }}
            autoStart={true}
            fadeOut={true}
          />
        ) : null}
        
        <View style={styles.arrivedContainer}>
          <View style={styles.arrivedIcon}>
            <Feather 
              name={alreadyCheckedIn ? "check-circle" : "map-pin"} 
              size={80} 
              color={alreadyCheckedIn ? "#4CAF50" : "#D4AF7A"} 
            />
          </View>
          <Text style={styles.arrivedTitle}>
            {alreadyCheckedIn ? "Checked In!" : "You Arrived!"}
          </Text>
          <Text style={styles.arrivedSubtitle}>{activeTarget.name}</Text>
          <Text style={styles.arrivedDescription} numberOfLines={4}>
            {activeTarget.description}
          </Text>
          
          {!isGuest && !alreadyCheckedIn && canCheckIn ? (
            <Pressable
              style={[styles.actionButton, styles.checkInButton]}
              onPress={handleCheckIn}
              disabled={checkingIn}
            >
              {checkingIn ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="check" size={20} color="#FFFFFF" />
                  <Text style={styles.checkInButtonText}>Check In Now</Text>
                </>
              )}
            </Pressable>
          ) : !isGuest && !alreadyCheckedIn && !canCheckIn ? (
            <View style={[styles.actionButton, styles.disabledCheckInButton]}>
              <Feather name="map-pin" size={20} color="#666" />
              <Text style={styles.disabledCheckInText}>Get closer to check in ({CHECKIN_THRESHOLD}m)</Text>
            </View>
          ) : null}
          
          <Pressable
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleStopHunt}
          >
            <Text style={styles.actionButtonText}>
              {alreadyCheckedIn ? "Done" : "Complete Hunt"}
            </Text>
          </Pressable>
          
          {!isGuest && alreadyCheckedIn ? (
            <Pressable
              style={styles.checkOutButton}
              onPress={handleCheckOut}
              disabled={checkingOut}
            >
              {checkingOut ? (
                <ActivityIndicator size="small" color="#E74C3C" />
              ) : (
                <>
                  <Feather name="x-circle" size={16} color="#E74C3C" />
                  <Text style={styles.checkOutText}>Remove Check-in</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
        
        <Modal
          visible={showBadgeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowBadgeModal(false)}
        >
          <View style={styles.badgeModalOverlay}>
            <Pressable 
              style={StyleSheet.absoluteFill}
              onPress={() => setShowBadgeModal(false)}
            />
            <View style={styles.badgeModalContent}>
              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.badgeModalInner}>
                <View style={styles.badgeIcon}>
                  <Feather 
                    name={(newBadge?.icon_name as any) || "award"} 
                    size={48} 
                    color="#D4AF7A" 
                  />
                </View>
                <Text style={styles.badgeModalTitle}>Badge Unlocked!</Text>
                <Text style={styles.badgeModalName}>{newBadge?.name}</Text>
                <Text style={styles.badgeModalDescription}>
                  {newBadge?.description}
                </Text>
                <Pressable
                  style={styles.badgeModalButton}
                  onPress={() => setShowBadgeModal(false)}
                >
                  <Text style={styles.badgeModalButtonText}>Awesome!</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {activeTarget ? (
          <CheckinSuccessModal
            visible={showCheckinSuccess}
            place={activeTarget}
            userId={user?.id ?? ""}
            newBadges={checkinNewBadges}
            onContinue={() => setShowCheckinSuccess(false)}
          />
        ) : null}
      </View>
    );
  }

  const spin = arrowRotation.interpolate({
    inputRange: [-360, 0, 360],
    outputRange: ["-360deg", "0deg", "360deg"],
  });

  const compassSpin = compassRotation.interpolate({
    inputRange: [-360, 0, 360],
    outputRange: ["-360deg", "0deg", "360deg"],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
      >
        {/* Page 0: Map Mode (default) */}
        <View key="0" style={styles.pageContainer}>
          <HuntMapView
            userLocation={userLocation}
            target={activeTarget}
            distance={distance}
          />
        </View>

        {/* Page 1: Compass Mode */}
        <View key="1" style={[styles.pageContainer, styles.compassPage]}>
          <View style={styles.compassWrapper}>
            <View style={styles.compassOuter}>
              <Animated.View 
                style={[
                  styles.compassDial,
                  { transform: [{ rotate: compassSpin }] }
                ]}
              >
                {renderCompassDial()}
              </Animated.View>
              
              <View style={styles.compassInner}>
                <Text style={styles.distanceValue}>
                  {distance !== null ? Math.round(distance) : "---"}
                </Text>
                <Text style={styles.distanceLabel}>METERS</Text>
                {locationAccuracy !== null ? (
                  <Text style={styles.accuracyLabel}>[+/- {Math.round(locationAccuracy)} m]</Text>
                ) : null}
              </View>
              
              <Animated.View 
                style={[
                  styles.pointerContainer,
                  { transform: [{ rotate: spin }] }
                ]}
              >
                <View style={styles.pointer}>
                  <View style={styles.pointerTriangle} />
                </View>
              </Animated.View>
            </View>
          </View>

          {showCalibrationHint ? (
            <View style={styles.calibrationBanner}>
              <Feather name="alert-triangle" size={14} color="#F5A623" />
              <Text style={styles.calibrationText}>
                Move your phone in a figure-8 to improve compass accuracy
              </Text>
            </View>
          ) : null}

          <View style={styles.coordinatesContainer}>
            <View style={styles.coordinateBlock}>
              <Text style={styles.coordinateLabel}>MY LOCATION</Text>
              {userLocation ? (
                <>
                  <Text style={styles.coordinateValue}>
                    {formatCoordinate(userLocation.latitude, true)}
                  </Text>
                  <Text style={styles.coordinateValue}>
                    {formatCoordinate(userLocation.longitude, false)}
                  </Text>
                </>
              ) : (
                <Text style={styles.coordinateValue}>Locating...</Text>
              )}
            </View>
            
            <View style={styles.coordinateBlock}>
              <Text style={styles.coordinateLabel}>MY DESTINATION</Text>
              <Text style={styles.coordinateValue}>
                {formatCoordinate(activeTarget.latitude, true)}
              </Text>
              <Text style={styles.coordinateValue}>
                {formatCoordinate(activeTarget.longitude, false)}
              </Text>
            </View>
          </View>
        </View>
      </PagerView>

      {/* Mode switcher tabs */}
      <View style={styles.modeSwitcher}>
        <Pressable
          style={[styles.modeButton, currentPage === 0 && styles.modeButtonActive]}
          onPress={() => {
            pagerRef.current?.setPage(0);
            setCurrentPage(0);
          }}
        >
          <Feather name="map" size={15} color={currentPage === 0 ? "#000000" : "#888888"} />
          <Text style={[styles.modeButtonText, currentPage === 0 && styles.modeButtonTextActive]}>
            Map
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, currentPage === 1 && styles.modeButtonActive]}
          onPress={() => {
            pagerRef.current?.setPage(1);
            setCurrentPage(1);
          }}
        >
          <Feather name="compass" size={15} color={currentPage === 1 ? "#000000" : "#888888"} />
          <Text style={[styles.modeButtonText, currentPage === 1 && styles.modeButtonTextActive]}>
            Compass
          </Text>
        </Pressable>
      </View>

      {/* Shared bottom: check-in + controls */}
      {!isGuest && canCheckIn && !alreadyCheckedIn ? (
        <View style={styles.checkInContainer}>
          <Pressable
            style={[styles.actionButton, styles.checkInButton]}
            onPress={handleCheckIn}
            disabled={checkingIn}
          >
            {checkingIn ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="check" size={20} color="#FFFFFF" />
                <Text style={styles.checkInButtonText}>Check In Now</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : !isGuest && !canCheckIn && distance !== null && distance < 60 ? (
        <View style={styles.checkInContainer}>
          <View style={[styles.actionButton, styles.disabledCheckInButton]}>
            <Feather name="map-pin" size={20} color="#666" />
            <Text style={styles.disabledCheckInText}>Get within {CHECKIN_THRESHOLD}m to check in</Text>
          </View>
        </View>
      ) : alreadyCheckedIn ? (
        <View style={styles.checkInContainer}>
          <View style={[styles.actionButton, styles.checkedInButton]}>
            <Feather name="check-circle" size={20} color="#4CAF50" />
            <Text style={styles.checkedInText}>Checked In</Text>
          </View>
          <Pressable
            style={[styles.checkOutButton]}
            onPress={handleCheckOut}
            disabled={checkingOut}
          >
            {checkingOut ? (
              <ActivityIndicator size="small" color="#E74C3C" />
            ) : (
              <>
                <Feather name="x-circle" size={16} color="#E74C3C" />
                <Text style={styles.checkOutText}>Remove Check-in</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          style={({ pressed }) => [
            styles.controlButton,
            styles.stopButton,
            pressed && styles.controlButtonPressed,
          ]}
          onPress={handleStopHunt}
        >
          <Feather name="chevron-left" size={20} color="#AAAAAA" />
          <Text style={[styles.controlButtonText, styles.stopButtonText]}>End Hunt</Text>
        </Pressable>
      </View>

      {activeTarget ? (
        <CheckinSuccessModal
          visible={showCheckinSuccess}
          place={activeTarget}
          userId={user?.id ?? ""}
          newBadges={checkinNewBadges}
          onContinue={() => setShowCheckinSuccess(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  pager: {
    flex: 1,
  },
  pageContainer: {
    flex: 1,
  },
  compassPage: {
    paddingTop: Spacing.lg,
  },
  modeSwitcher: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  modeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 10,
  },
  modeButtonActive: {
    backgroundColor: "#D4AF7A",
  },
  modeButtonText: {
    color: "#888888",
    fontSize: 14,
    fontWeight: "600",
  },
  modeButtonTextActive: {
    color: "#000000",
  },
  noTargetContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  noTargetText: {
    color: "#AAAAAA",
    fontSize: 20,
    fontWeight: "600",
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  backButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: "#333333",
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  compassWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  compassOuter: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  compassDial: {
    position: "absolute",
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
  },
  tickMark: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    transformOrigin: "center top",
  },
  cardinalLabel: {
    position: "absolute",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  compassInner: {
    width: COMPASS_SIZE * 0.55,
    height: COMPASS_SIZE * 0.55,
    borderRadius: COMPASS_SIZE * 0.275,
    backgroundColor: "#1A1A1A",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  distanceValue: {
    color: "#FFFFFF",
    fontSize: 56,
    fontWeight: "300",
    letterSpacing: -2,
  },
  distanceLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 2,
    marginTop: 4,
  },
  accuracyLabel: {
    color: "#888888",
    fontSize: 12,
    marginTop: 8,
  },
  pointerContainer: {
    position: "absolute",
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  pointer: {
    marginTop: -4,
    alignItems: "center",
  },
  pointerTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 24,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#E53935",
  },
  calibrationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.3)",
  },
  calibrationText: {
    color: "#F5A623",
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  coordinatesContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  coordinateBlock: {
    flex: 1,
  },
  coordinateLabel: {
    color: "#888888",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1,
    marginBottom: 8,
  },
  coordinateValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "300",
    lineHeight: 24,
  },
  checkInContainer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  checkInButton: {
    backgroundColor: "#4CAF50",
  },
  checkInButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  disabledCheckInButton: {
    backgroundColor: "#222222",
  },
  disabledCheckInText: {
    color: "#666666",
    fontSize: 14,
  },
  checkedInButton: {
    backgroundColor: "#1A3A1A",
  },
  checkedInText: {
    color: "#4CAF50",
    fontSize: 16,
    fontWeight: "600",
  },
  checkOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  checkOutText: {
    color: "#E74C3C",
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: "#333333",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  controls: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  controlButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: "#222222",
    gap: Spacing.sm,
  },
  controlButtonPressed: {
    opacity: 0.7,
  },
  controlButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  stopButton: {
    backgroundColor: "#1E1E1E",
  },
  stopButtonText: {
    color: "#AAAAAA",
  },
  arrivedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  arrivedIcon: {
    marginBottom: Spacing.xl,
  },
  arrivedTitle: {
    color: "#4CAF50",
    fontSize: 36,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  arrivedSubtitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  arrivedDescription: {
    color: "#AAAAAA",
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing["3xl"],
    paddingHorizontal: Spacing.lg,
  },
  badgeModalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  badgeModalContent: {
    width: "85%",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  badgeModalInner: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  badgeIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(212, 175, 122, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  badgeModalTitle: {
    color: "#D4AF7A",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  badgeModalName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  badgeModalDescription: {
    color: "#AAAAAA",
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  badgeModalButton: {
    paddingHorizontal: Spacing["3xl"],
    paddingVertical: Spacing.md,
    backgroundColor: "#D4AF7A",
    borderRadius: BorderRadius.md,
  },
  badgeModalButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "600",
  },
});
