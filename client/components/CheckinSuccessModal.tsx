import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Animated,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getCheckinSuccessStats, type CheckinSuccessStats, type UserBadge } from "@/lib/checkins";
import type { Curio } from "@/lib/supabase";

interface Achievement {
  icon: string;
  text: string;
  points: number;
}

interface Props {
  visible: boolean;
  place: Curio;
  userId: string;
  newBadges: UserBadge[];
  onContinue: () => void;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function computeAchievements(
  stats: CheckinSuccessStats,
  place: Curio,
  newBadges: UserBadge[]
): Achievement[] {
  const achievements: Achievement[] = [];
  const { placeVisitCount, totalCheckins } = stats;

  if (placeVisitCount === 1) {
    achievements.push({
      icon: "star",
      text: `First discovery of ${place.name}! The mystery unfolds.`,
      points: 10,
    });
  } else {
    achievements.push({
      icon: "refresh-cw",
      text: `Your ${ordinal(placeVisitCount)} visit here. The secrets grow deeper.`,
      points: 3,
    });
  }

  if (totalCheckins === 1) {
    achievements.push({
      icon: "map-pin",
      text: "Your very first curio discovered!",
      points: 5,
    });
  } else if (totalCheckins === 5) {
    achievements.push({
      icon: "award",
      text: "5 curios discovered — you're on a roll.",
      points: 5,
    });
  } else if (totalCheckins === 10) {
    achievements.push({
      icon: "award",
      text: "10 curios! A seasoned explorer emerges.",
      points: 10,
    });
  } else if (totalCheckins === 25) {
    achievements.push({
      icon: "award",
      text: "25 curios discovered. A true Curio master.",
      points: 25,
    });
  } else if (totalCheckins % 10 === 0) {
    achievements.push({
      icon: "award",
      text: `${totalCheckins} total discoveries — remarkable.`,
      points: 5,
    });
  }

  for (const badge of newBadges) {
    achievements.push({
      icon: "shield",
      text: `Badge unlocked: ${badge.name}!`,
      points: 15,
    });
  }

  achievements.push({
    icon: "book-open",
    text: "Knowledge gathered from the hidden world.",
    points: 1,
  });

  return achievements;
}

export default function CheckinSuccessModal({
  visible,
  place,
  userId,
  newBadges,
  onContinue,
}: Props) {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<CheckinSuccessStats | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    if (visible) {
      setStats(null);
      fadeAnim.setValue(0);
      slideAnim.setValue(40);
      getCheckinSuccessStats(userId, place.id).then(setStats);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
      ]).start();
    }
  }, [visible]);

  const achievements = stats ? computeAchievements(stats, place, newBadges) : [];
  const totalPoints = achievements.reduce((sum, a) => sum + a.points, 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
    >
      <LinearGradient
        colors={["#0D0B18", "#13102A", "#0A0E14"]}
        style={styles.gradient}
      >
        <Animated.View
          style={[
            styles.container,
            {
              paddingTop: insets.top + Spacing.xl,
              paddingBottom: insets.bottom + Spacing.lg,
              opacity: fadeAnim,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.content,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            {stats ? (
              <>
                <Text style={styles.visitSubtitle}>
                  {stats.placeVisitCount === 1
                    ? "First discovery"
                    : `Your ${ordinal(stats.placeVisitCount)} time here`}
                </Text>
                <Text style={styles.placeName}>{place.name}</Text>
              </>
            ) : (
              <>
                <Text style={styles.visitSubtitle}>Discovery logged</Text>
                <Text style={styles.placeName}>{place.name}</Text>
              </>
            )}

            <View style={styles.card}>
              {stats === null ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={AMBER} />
                </View>
              ) : (
                <>
                  <ScrollView
                    scrollEnabled={achievements.length > 4}
                    showsVerticalScrollIndicator={false}
                  >
                    {achievements.map((item, i) => (
                      <AchievementRow key={i} item={item} isLast={i === achievements.length - 1} />
                    ))}
                  </ScrollView>

                  <View style={styles.divider} />

                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Points earned</Text>
                    <View style={styles.totalRight}>
                      <View style={styles.coinDot} />
                      <Text style={styles.totalPoints}>{totalPoints}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.continueButton,
                pressed && styles.continueButtonPressed,
              ]}
              onPress={onContinue}
            >
              <Text style={styles.continueText}>Continue</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </LinearGradient>
    </Modal>
  );
}

function AchievementRow({
  item,
  isLast,
}: {
  item: Achievement;
  isLast: boolean;
}) {
  return (
    <View style={[styles.achievementRow, !isLast && styles.achievementRowBorder]}>
      <View style={styles.iconWrap}>
        <Feather name={item.icon as any} size={18} color={AMBER} />
      </View>
      <Text style={styles.achievementText}>{item.text}</Text>
      <Text style={styles.pointsText}>+{item.points}</Text>
    </View>
  );
}

const AMBER = "#D4AF7A";
const CARD_BG = "rgba(255,255,255,0.06)";
const CARD_BORDER = "rgba(255,255,255,0.10)";

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing["2xl"],
  },
  content: {
    flex: 1,
    alignItems: "center",
  },
  visitSubtitle: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
    fontWeight: "500",
    marginBottom: Spacing.sm,
    marginTop: Spacing.xl,
    letterSpacing: 0.3,
  },
  placeName: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 34,
    marginBottom: Spacing["3xl"],
    letterSpacing: -0.3,
  },
  card: {
    width: "100%",
    backgroundColor: CARD_BG,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: "hidden",
    marginBottom: Spacing["2xl"],
  },
  loadingRow: {
    paddingVertical: Spacing["3xl"],
    alignItems: "center",
  },
  achievementRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
    gap: Spacing.md,
  },
  achievementRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CARD_BORDER,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(212,175,122,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  achievementText: {
    flex: 1,
    color: "rgba(255,255,255,0.88)",
    fontSize: 13.5,
    fontWeight: "600",
    lineHeight: 18,
  },
  pointsText: {
    color: AMBER,
    fontSize: 14,
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CARD_BORDER,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
  },
  totalLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: "500",
  },
  totalRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  coinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: AMBER,
  },
  totalPoints: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  continueButton: {
    width: "100%",
    height: 54,
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginTop: "auto",
  },
  continueButtonPressed: {
    opacity: 0.85,
  },
  continueText: {
    color: "#0D0B18",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
