import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface Fact {
  id: string;
  curio_id: string;
  fact_info: string;
}

interface PlaceData {
  places_id: string;
  curio_id: string;
  name: string;
  detail_overview: string | null;
  [key: string]: any;
}

type TabMode = "manual" | "json";

export default function AdminEditScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const curioId: string = route.params?.curioId || "";
  const curioName: string = route.params?.curioName || "";
  const isNew: boolean = route.params?.isNew || false;

  const [tab, setTab] = useState<TabMode>("manual");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [detailOverview, setDetailOverview] = useState("");
  const [placeName, setPlaceName] = useState(curioName);
  const [savingName, setSavingName] = useState(false);
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editingFactText, setEditingFactText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!isNew) fetchCurioData();
  }, [curioId]);

  const fetchCurioData = async () => {
    setLoading(true);
    try {
      const url = new URL(`/api/admin/curio/${encodeURIComponent(curioId)}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch curio data");
      const data = await res.json();
      setPlace(data.place);
      setFacts(data.facts || []);
      setDetailOverview(data.place?.detail_overview || "");
      setPlaceName(data.place?.name || curioName);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to load curio data");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOverview = async () => {
    if (!place) return;
    const placeId = place.places_id || place.id || (place as any).place_id;
    if (!placeId) {
      Alert.alert("Error", "Could not determine place ID");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/admin/places/${placeId}`, { detail_overview: detailOverview });
      Alert.alert("Saved", "Detail overview updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveName = async () => {
    if (!placeName.trim()) {
      Alert.alert("Error", "Name cannot be empty");
      return;
    }
    setSavingName(true);
    try {
      await apiRequest("PATCH", `/api/admin/place/${encodeURIComponent(curioId)}/name`, { name: placeName.trim() });
      Alert.alert("Saved", "Place name updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save name");
    } finally {
      setSavingName(false);
    }
  };

  const handleStartEditFact = (fact: Fact) => {
    setEditingFactId(fact.id);
    setEditingFactText(fact.fact_info);
  };

  const handleSaveFact = async () => {
    if (!editingFactId) return;
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/admin/facts/${editingFactId}`, { fact: editingFactText });
      setFacts(prev => prev.map(f => f.id === editingFactId ? { ...f, fact_info: editingFactText } : f));
      setEditingFactId(null);
      setEditingFactText("");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save fact");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFact = (factId: string) => {
    Alert.alert("Delete Fact", "Remove this fact?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await apiRequest("DELETE", `/api/admin/facts/${factId}`);
            setFacts(prev => prev.filter(f => f.id !== factId));
            if (editingFactId === factId) {
              setEditingFactId(null);
              setEditingFactText("");
            }
          } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to delete fact");
          }
        }
      }
    ]);
  };

  const handleImportJson = async () => {
    let jsonData: any;
    try {
      jsonData = JSON.parse(jsonText);
    } catch {
      Alert.alert("Invalid JSON", "Please check your JSON format and try again.");
      return;
    }

    setImporting(true);
    const log: string[] = [];
    log.push(`Starting import for ${curioId}...`);

    try {
      const url = new URL(`/api/admin/curio/${encodeURIComponent(curioId)}`, getApiUrl());
      const checkRes = await fetch(url.toString());
      if (!checkRes.ok) throw new Error(`Curio "${curioId}" not found`);
      const curioData = await checkRes.json();
      log.push(`Found: ${curioData.place.name}`);

      if (jsonData["DETAIL-OVERVIEW"]) {
        log.push("Updating detail_overview...");
        const placeId = curioData.place.places_id || curioData.place.id || curioData.place.place_id;
        if (!placeId) {
          log.push("  [ERROR] Could not find place ID");
        } else {
          try {
            await apiRequest("PATCH", `/api/admin/places/${placeId}`, { detail_overview: jsonData["DETAIL-OVERVIEW"] });
            log.push("  [OK] Detail overview updated");
            setDetailOverview(jsonData["DETAIL-OVERVIEW"]);
          } catch {
            log.push("  [FAILED] Could not update detail overview");
          }
        }
      }

      if (jsonData["FACTS"] && Array.isArray(jsonData["FACTS"])) {
        log.push(`Processing ${jsonData["FACTS"].length} facts...`);

        const existingFacts = curioData.facts || [];
        for (const fact of existingFacts) {
          if (fact.id) {
            try {
              await apiRequest("DELETE", `/api/admin/facts/${fact.id}`);
            } catch {}
          }
        }
        log.push(`  Cleared ${existingFacts.length} existing facts`);

        let successCount = 0;
        const newFacts: Fact[] = [];
        for (let i = 0; i < Math.min(jsonData["FACTS"].length, 10); i++) {
          let factItem = jsonData["FACTS"][i];
          let factText = "";

          if (typeof factItem === "string") {
            factText = factItem;
          } else if (factItem && typeof factItem === "object") {
            factText = factItem.fact || factItem.fact_info || factItem.text || factItem.content || "";
          }

          if (!factText) {
            log.push(`  [SKIP] Fact ${i + 1} - empty`);
            continue;
          }

          factText = factText.replace(/^FACT-\d+:\s*/i, "").trim();

          try {
            const res = await apiRequest("POST", "/api/admin/facts", { curio_id: curioId, fact: factText });
            const resData = await res.json();
            if (resData.fact) newFacts.push(resData.fact);
            successCount++;
            log.push(`  [OK] Fact ${i + 1} inserted`);
          } catch {
            log.push(`  [FAILED] Fact ${i + 1}`);
          }
        }
        log.push(`Inserted ${successCount}/${Math.min(jsonData["FACTS"].length, 10)} facts`);
        setFacts(newFacts);
      }

      log.push("");
      log.push("Import complete!");
    } catch (err: any) {
      log.push(`ERROR: ${err.message}`);
    }

    setImportLog(log);
    setImporting(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.accent} style={{ marginTop: 100 }} />
      </View>
    );
  }

  return (
    <Pressable style={[styles.container, { paddingTop: insets.top }]} onPress={Keyboard.dismiss}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1} selectable>{curioName || curioId}</Text>
          <Text style={styles.headerSubtitle}>{curioId}</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabBtn, tab === "manual" && styles.tabBtnActive]}
          onPress={() => setTab("manual")}
        >
          <Text style={[styles.tabBtnText, tab === "manual" && styles.tabBtnTextActive]}>Edit</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === "json" && styles.tabBtnActive, tab === "json" && jsonText.trim() && !importing && styles.importReadyBtn]}
          onPress={() => {
            if (tab === "json" && jsonText.trim() && !importing) {
              handleImportJson();
            } else {
              setTab("json");
            }
          }}
          disabled={tab === "json" && importing}
        >
          {tab === "json" && importing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.tabBtnText, tab === "json" && styles.tabBtnTextActive, tab === "json" && jsonText.trim() && !importing && styles.importReadyBtnText]}>
              {tab === "json" && jsonText.trim() ? "Import Now" : "JSON Import"}
            </Text>
          )}
        </Pressable>
      </View>

      {tab === "manual" ? (
        <KeyboardAwareScrollViewCompat
          style={styles.scrollContent}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.sectionLabel}>Place Name</Text>
          <TextInput
            style={styles.nameInput}
            value={placeName}
            onChangeText={setPlaceName}
            placeholder="Enter place name..."
            placeholderTextColor={Colors.dark.textSecondary}
          />
          <Pressable
            style={[styles.saveBtn, savingName && styles.saveBtnDisabled]}
            onPress={handleSaveName}
            disabled={savingName}
          >
            {savingName ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Name</Text>
            )}
          </Pressable>

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>Detail Overview</Text>
          <TextInput
            style={styles.textArea}
            value={detailOverview}
            onChangeText={setDetailOverview}
            multiline
            placeholder="Enter detail overview..."
            placeholderTextColor={Colors.dark.textSecondary}
            textAlignVertical="top"
          />
          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSaveOverview}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Overview</Text>
            )}
          </Pressable>

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>Facts ({facts.length})</Text>
          {facts.map((fact, index) => (
            <View key={fact.id} style={styles.factCard}>
              <View style={styles.factHeader}>
                <Text style={styles.factIndex}>#{index + 1}</Text>
                <View style={styles.factActions}>
                  <Pressable style={styles.factActionBtn} onPress={() => handleStartEditFact(fact)}>
                    <Feather name="edit-2" size={16} color={Colors.dark.accent} />
                  </Pressable>
                  <Pressable style={styles.factActionBtn} onPress={() => handleDeleteFact(fact.id)}>
                    <Feather name="trash-2" size={16} color="#E53935" />
                  </Pressable>
                </View>
              </View>
              {editingFactId === fact.id ? (
                <>
                  <TextInput
                    style={styles.factEditInput}
                    value={editingFactText}
                    onChangeText={setEditingFactText}
                    multiline
                    textAlignVertical="top"
                    autoFocus
                  />
                  <View style={styles.factEditButtons}>
                    <Pressable
                      style={styles.factCancelBtn}
                      onPress={() => { setEditingFactId(null); setEditingFactText(""); }}
                    >
                      <Text style={styles.factCancelBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.factSaveBtn, saving && styles.saveBtnDisabled]}
                      onPress={handleSaveFact}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.factSaveBtnText}>Save</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              ) : (
                <Text style={styles.factText}>{fact.fact_info}</Text>
              )}
            </View>
          ))}
          {facts.length === 0 ? (
            <Text style={styles.emptyText}>No facts for this curio.</Text>
          ) : null}
        </KeyboardAwareScrollViewCompat>
      ) : (
        <KeyboardAwareScrollViewCompat
          style={styles.scrollContent}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.sectionLabel}>Paste JSON</Text>
          <Text style={styles.hintText}>
            Use keys "DETAIL-OVERVIEW" (string) and/or "FACTS" (array of strings or objects with "fact" key). Max 10 facts.
          </Text>
          <TextInput
            style={[styles.textArea, { minHeight: 200 }]}
            value={jsonText}
            onChangeText={setJsonText}
            multiline
            placeholder={'{\n  "DETAIL-OVERVIEW": "...",\n  "FACTS": [\n    "Fact one",\n    "Fact two"\n  ]\n}'}
            placeholderTextColor={Colors.dark.textSecondary}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {importLog.length > 0 ? (
            <View style={styles.logBox}>
              {importLog.map((line, i) => (
                <Text
                  key={i}
                  style={[
                    styles.logLine,
                    line.includes("[OK]") && styles.logLineOk,
                    line.includes("[FAILED]") && styles.logLineFail,
                    line.includes("ERROR") && styles.logLineFail,
                  ]}
                >
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </KeyboardAwareScrollViewCompat>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: {
    padding: Spacing.xs,
    marginRight: Spacing.sm,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    color: "#fff",
    ...Typography.headline,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 2,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  tabBtnActive: {
    backgroundColor: Colors.dark.accent,
  },
  importReadyBtn: {
    backgroundColor: "#2E7D32",
  },
  importReadyBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  tabBtnText: {
    color: Colors.dark.textSecondary,
    ...Typography.caption,
    fontWeight: "600",
  },
  tabBtnTextActive: {
    color: "#fff",
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  sectionLabel: {
    color: "#fff",
    ...Typography.headline,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  nameInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: "#fff",
    ...Typography.body,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: "#fff",
    ...Typography.body,
    minHeight: 120,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  saveBtn: {
    backgroundColor: "#4CAF50",
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: "#fff",
    ...Typography.body,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.lg,
  },
  factCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  factHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  factIndex: {
    color: Colors.dark.accent,
    ...Typography.caption,
    fontWeight: "700",
  },
  factActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  factActionBtn: {
    padding: 4,
  },
  factText: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
    lineHeight: 22,
  },
  factEditInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    color: "#fff",
    ...Typography.body,
    minHeight: 80,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
  },
  factEditButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  factCancelBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  factCancelBtnText: {
    color: Colors.dark.textSecondary,
    ...Typography.caption,
    fontWeight: "600",
  },
  factSaveBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: "#4CAF50",
  },
  factSaveBtnText: {
    color: "#fff",
    ...Typography.caption,
    fontWeight: "600",
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
    textAlign: "center",
    marginTop: Spacing.xl,
  },
  hintText: {
    color: Colors.dark.textSecondary,
    ...Typography.caption,
    marginBottom: Spacing.sm,
    lineHeight: 18,
  },
  logBox: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  logLine: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  logLineOk: {
    color: "#4CAF50",
  },
  logLineFail: {
    color: "#E53935",
  },
});
