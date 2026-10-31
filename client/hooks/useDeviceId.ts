import { useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "lantern_device_id";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getStoredDeviceId(): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(DEVICE_ID_KEY);
  }
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

async function storeDeviceId(id: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  } else {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
}

export function useDeviceId(): string | null {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let id = await getStoredDeviceId();
      if (!id) {
        id = generateUUID();
        await storeDeviceId(id);
      }
      setDeviceId(id);
    })();
  }, []);

  return deviceId;
}
