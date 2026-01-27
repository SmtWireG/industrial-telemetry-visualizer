import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import bleService from '../services/bleService';
import modbusService from '../services/modbusService';

export default function WeightScreen() {
  const { deviceId, deviceName } = useLocalSearchParams();
  const router = useRouter();

  // --- STATE ---
  const [isConnected, setIsConnected] = useState(false);
  const [weightDisplay, setWeightDisplay] = useState("0.0");
  const [unit, setUnit] = useState("kg");
  const [isStable, setIsStable] = useState(false);
  const [hasTare, setHasTare] = useState(false);
  const [isOverload, setIsOverload] = useState(false);
  const [dot, setDot] = useState(0);

  // --- REFS ---
  const connectedDeviceRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const isConnectingRef = useRef(false);
  const isConnectedRef = useRef(false);
  const isTeardownRef = useRef(false);
  const lastDotRef = useRef(0);
  const subscriptionRef = useRef(null);
  const disconnectionSubscriptionRef = useRef(null);

  const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
  const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

  // CRITICAL: Bu ID, Android'deki çökme sorununu çözmek için anahtardır.
  const TRANSACTION_ID = `monitor_${deviceId}`;

  // --- GÜVENLİ KAPATMA (PASSIVE FIX V2) ---
  // DİKKAT: cancelTransaction() veya subscription.remove() Android'de kütüphane içi
  // bir null hata kodu üreterek uygulamayı çökertebiliyor.
  // Bu nedenle "Pasif Kapatma" yöntemini kullanıyoruz.
  const teardownConnection = useCallback(async (isManual = true) => {
    if (isTeardownRef.current) return;
    isTeardownRef.current = true;
    console.log(`🧹 Pasif kapatma süreci başladı... (isManual: ${isManual})`);
    isConnectedRef.current = false;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    // 2. JS taraflı referansları temizle
    modbusService.onDataCallback = null;
    disconnectionSubscriptionRef.current = null;
    await modbusService.safeTeardown(isManual);
    setIsConnected(false);
    isConnectingRef.current = false;
    isTeardownRef.current = false;
    connectedDeviceRef.current = null;
    console.log("✨ Kapatma tamamlandı");
  }, []);

  const handleDisconnection = useCallback((title, message) => {
    teardownConnection(false).then(() => {
      router.replace('/');
      setTimeout(() => Alert.alert(title, message), 500);
    });
  }, [router, teardownConnection]);

  const fetchSettings = useCallback(async () => {
    try {
      if (isConnectedRef.current && !isTeardownRef.current) {
        console.log("🔄 Birim ve nokta ayarları tazeleniyor...");
        await modbusService.sendCommand(3, 118, 2);
      }
    } catch (error) { }
  }, []);

  const parseDeviceData = useCallback((value) => {
    if (isTeardownRef.current) return;
    try {
      if (!value || value.length < 5) return;
      const funcCode = value[1];

      // Hata Yanıtı (FC | 0x80)
      if (funcCode & 0x80) {
        const errorCode = value[2];
        const errorMessages = {
          1: 'İllegal Fonksiyon',
          2: 'İllegal Veri Adresi',
          3: 'İllegal Veri Değeri',
          5: 'İşlem Devam Ediyor (Acknowledge)',
          6: 'Cihaz Meşgul'
        };
        console.warn(`📡 Cihaz Hatası: ${errorMessages[errorCode] || `Hata ${errorCode}`}`);
        return;
      }

      if (funcCode === 3) {
        const byteCount = value[2];
        if (value.length < 3 + byteCount + 2) return;

        // Register 7: Durum (STATUS)
        // Tablo 2: Bit 6: Hareketsizlik, Bit 10: Dara Var, Bit 4: Overload, Bit 5: Mutlak Sıfır
        const status = (value[3] << 8) | value[4];
        setIsStable((status & (1 << 6)) !== 0);
        setIsOverload((status & (1 << 4)) !== 0);
        setHasTare((status & (1 << 10)) !== 0);

        if (byteCount === 4 && value.length >= 7) {
          const dotValue = (value[3] << 8) | value[4];
          const unitCode = (value[5] << 8) | value[6];
          const unitMap = { 0: 'kg', 1: 'g', 2: 'lb', 3: 'mV/V', 4: 'mV' };
          setDot(dotValue);
          lastDotRef.current = dotValue;
          setUnit(unitMap[unitCode] || 'kg');
          return;
        }

        if (byteCount >= 6) {
          const highWord = (value[5] << 8) | value[6];
          const lowWord = (value[7] << 8) | value[8];
          let rawValue = (highWord << 16) | lowWord;
          const currentDot = lastDotRef.current;
          setWeightDisplay((rawValue / Math.pow(10, currentDot)).toFixed(currentDot));
        }
      }
    } catch (error) {
      console.error("❌ Veri işleme hatası:", error);
    }
  }, []);

  const handleConnection = useCallback(async (id) => {
    if (isConnectingRef.current || isConnectedRef.current) return;

    try {
      isConnectingRef.current = true;
      console.log("🔗 Bağlanılıyor: ", id);
      const manager = bleService.getManager();
      const device = await manager.connectToDevice(id);
      await device.discoverAllServicesAndCharacteristics();

      modbusService.setDevice(id, device, 1);

      // Merkezi monitor üzerinden verileri dinle
      modbusService.onDataCallback = (data) => {
        if (isTeardownRef.current) return;
        parseDeviceData(data);
      };

      disconnectionSubscriptionRef.current = manager.onDeviceDisconnected(id, () => {
        if (!isTeardownRef.current) {
          handleDisconnection("Bağlantı Kesildi", "Cihaz ile olan bağlantı koptu.");
        }
      });

      isConnectedRef.current = true;
      setIsConnected(true);
      isConnectingRef.current = false;
      console.log("✅ Cihaz Hazır");

    } catch (error) {
      console.error("Bağlantı hatası:", error);
      handleDisconnection("Bağlantı Başarısız", "Cihaza bağlanılamadı.");
    }
  }, [handleDisconnection, parseDeviceData, TRANSACTION_ID]);

  useEffect(() => {
    if (deviceId && !isConnectedRef.current) {
      handleConnection(deviceId);
    }
    return () => {
      teardownConnection();
    };
  }, [deviceId, handleConnection, teardownConnection]);

  useFocusEffect(
    useCallback(() => {
      let interval = null;
      if (isConnected) {
        fetchSettings();
        interval = setInterval(async () => {
          try {
            if (isConnectedRef.current && !isTeardownRef.current) {
              await modbusService.sendCommand(3, 7, 3);
            }
          } catch (e) { }
        }, 500);
        pollIntervalRef.current = interval;
      }
      return () => {
        if (interval) {
          clearInterval(interval);
          pollIntervalRef.current = null;
        }
      };
    }, [isConnected, fetchSettings])
  );

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Cihaza Bağlanılıyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusContainer}>
        <Text style={[styles.badge, { backgroundColor: isStable ? '#4CAF50' : '#FF9800' }]}>
          {isStable ? "STABİL" : "HAREKETLİ"}
        </Text>
        {hasTare && <Text style={[styles.badge, { backgroundColor: '#2196F3' }]}>NET</Text>}
      </View>

      <View style={styles.weightCard}>
        <Text style={styles.weightText}>{weightDisplay}</Text>
        <Text style={styles.unitText}>{unit}</Text>
      </View>

      <View style={styles.controlPanel}>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#FF9800' }]} onPress={() => modbusService.zero()}>
            <Text style={styles.buttonText}>ZERO</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#2196F3' }]} onPress={() => modbusService.tare()}>
            <Text style={styles.buttonText}>TARE</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.settingsButton} onPress={() => router.push({ pathname: "/settings", params: { deviceId } })}>
          <Text style={styles.buttonText}>SETTINGS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 20, fontSize: 16, color: '#333' },
  statusContainer: { flexDirection: 'row', gap: 10, position: 'absolute', top: 60 },
  badge: { color: '#fff', paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12, fontSize: 12, fontWeight: 'bold', overflow: 'hidden' },
  weightCard: { width: 280, height: 280, backgroundColor: '#fff', borderRadius: 140, borderWidth: 8, borderColor: '#2196F3', alignItems: 'center', justifyContent: 'center', elevation: 10, marginBottom: 40 },
  weightText: { fontSize: 70, fontWeight: 'bold', color: '#333' },
  unitText: { fontSize: 20, color: '#666' },
  controlPanel: { alignItems: 'center', gap: 20 },
  buttonRow: { flexDirection: 'row', gap: 20 },
  actionButton: { paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, elevation: 3 },
  settingsButton: { backgroundColor: '#757575', paddingVertical: 15, paddingHorizontal: 80, borderRadius: 30, elevation: 3 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});
