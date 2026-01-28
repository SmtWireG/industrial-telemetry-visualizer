import Constants from 'expo-constants';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import bleService from '../services/bleService';
import modbusService from '../services/modbusService';

export default function WeightScreen() {
  const { deviceId, deviceName, transport, ip } = useLocalSearchParams();
  const router = useRouter();

  // --- STATE ---
  const [isConnected, setIsConnected] = useState(false);
  const [currentTransport, setCurrentTransport] = useState(transport || 'BLE');
  const [weightDisplay, setWeightDisplay] = useState("0.0");
  const [unit, setUnit] = useState("kg");
  const [isStable, setIsStable] = useState(false);
  const [hasTare, setHasTare] = useState(false);
  const [isOverload, setIsOverload] = useState(false);
  const [ipAddress, setIpAddress] = useState(ip || "192.168.137.116");
  const [port, setPort] = useState("23");
  const [ipModalVisible, setIpModalVisible] = useState(false);
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
  const TRANSACTION_ID = `monitor_${deviceId || ip} `;

  // --- GÜVENLİ KAPATMA (PASSIVE FIX V2) ---
  const teardownConnection = useCallback(async (isManual = true) => {
    if (isTeardownRef.current) return;
    isTeardownRef.current = true;

    console.log(`🧹 Pasif kapatma süreci başladı... (isManual: ${isManual}, Transport: ${modbusService.transport})`);

    // 1. Polling'i hemen durdur
    isConnectedRef.current = false;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // 2. JS taraflı referansları ve callback'leri temizle
    modbusService.onDataCallback = null;
    if (disconnectionSubscriptionRef.current) {
      disconnectionSubscriptionRef.current = null;
    }

    // 3. Merkezi servisi kapat
    await modbusService.safeTeardown(isManual);

    setIsConnected(false);
    isConnectingRef.current = false;
    isTeardownRef.current = false;
    connectedDeviceRef.current = null;
    console.log("✨ Kapatma tamamlandı");
  }, []); // Bağımlılık dizisi boşaltıldı: stabil hale getirildi.

  const handleDisconnection = useCallback((title, message) => {
    // Eğer WiFi'ye geçiş yapılıyorsa (isTransitioningToWiFi), ana sayfaya atma!
    if (modbusService.isTransitioningToWiFi) {
      console.log("📡 BLE koptu ama WiFi geçişi bekleniyor, sayfada kalınıyor.");
      setIsConnected(false);
      isConnectedRef.current = false;
      // Merkezi servisi pasif kapat (BLE tarafını temizle)
      modbusService.safeTeardown(false);
      return;
    }

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

      // TCP'de veri PDU'su 7. byte'dan başlar (MBAP Header 7 byte olduğu için)
      // Ancak modbusService handleIncomingData içinde zaten parse ediyor olabilir mi?
      // Hayır, onDataCallback'e çiğ veri gönderiyoruz.
      const isTCP = modbusService.transport === 'TCP';
      const funcCode = isTCP ? value[7] : value[1];

      // Hata Yanıtı (FC | 0x80)
      if (funcCode & 0x80) {
        console.warn(`📡 Cihaz Hatası: FC ${funcCode} `);
        return;
      }

      if (funcCode === 3) {
        const byteCount = isTCP ? value[8] : value[2];
        const dataOffset = isTCP ? 9 : 3;

        if (value.length < dataOffset + byteCount) return;

        // Register 7: Durum (STATUS)
        const status = (value[dataOffset] << 8) | value[dataOffset + 1];
        setIsStable((status & (1 << 6)) !== 0);
        setIsOverload((status & (1 << 4)) !== 0);
        setHasTare((status & (1 << 10)) !== 0);

        // Birim ve Nokta
        if (byteCount === 4) {
          const dotValue = (value[dataOffset] << 8) | value[dataOffset + 1];
          const unitCode = (value[dataOffset + 2] << 8) | value[dataOffset + 3];
          const unitMap = { 0: 'kg', 1: 'g', 2: 'lb', 3: 'mV/V', 4: 'mV' };
          setDot(dotValue);
          lastDotRef.current = dotValue;
          setUnit(unitMap[unitCode] || 'kg');
          return;
        }

        // Ağırlık Verisi
        if (byteCount >= 6) {
          const highWord = (value[dataOffset + 2] << 8) | value[dataOffset + 3];
          const lowWord = (value[dataOffset + 4] << 8) | value[dataOffset + 5];

          let rawValue = (highWord << 16) | lowWord;
          // İşaretli tamsayı kontrolü (32-bit signed)
          if (rawValue & 0x80000000) rawValue -= 0x100000000;

          const currentDot = lastDotRef.current;
          setWeightDisplay((rawValue / Math.pow(10, currentDot)).toFixed(currentDot));
        }
      }
    } catch (error) {
      console.error("❌ Veri işleme hatası:", error);
    }
  }, []);

  const handleConnection = useCallback(async () => {
    if (isConnectingRef.current || isConnectedRef.current) return;

    try {
      isConnectingRef.current = true;

      if (transport === 'TCP') {
        console.log("[WEIGHT_SCREEN] TCP Bağlantısı başlatılıyor (Params):", ip);
        await modbusService.connectTCP(ip, 502);
      } else {
        // BLE geçiş sırasında otomatik bağlanmayı engelle (zaten koptuğunda isConnectedRef false olacak)
        if (modbusService.isTransitioningToWiFi) {
          console.log("[WEIGHT_SCREEN] WiFi geçişi aktif, BLE otomatik bağlantısı atlanıyor.");
          isConnectingRef.current = false;
          return;
        }
        console.log("🔗 BLE Bağlantısı kuruluyor: ", deviceId);
        const manager = bleService.getManager();
        const device = await manager.connectToDevice(deviceId);
        await device.discoverAllServicesAndCharacteristics();
        modbusService.setDevice(deviceId, device, 1);

        disconnectionSubscriptionRef.current = manager.onDeviceDisconnected(deviceId, () => {
          if (!isTeardownRef.current) {
            handleDisconnection("Bağlantı Kesildi", "Cihaz ile olan bağlantı koptu.");
          }
        });
      }

      // Merkezi monitor üzerinden verileri dinle
      modbusService.onDataCallback = (data) => {
        if (isTeardownRef.current) return;
        parseDeviceData(data);
      };

      isConnectedRef.current = true;
      setIsConnected(true);
      isConnectingRef.current = false;
      console.log("✅ Cihaz Hazır");

    } catch (error) {
      console.error("Bağlantı hatası:", error);
      handleDisconnection("Bağlantı Başarısız", "Cihaza bağlanılamadı.");
    }
  }, [deviceId, transport, ip, handleDisconnection, parseDeviceData]);

  useEffect(() => {
    // Sadece mount sırasında veya deviceId / parametre IP değiştiğinde çalışır
    if ((deviceId || ip) && !isConnectedRef.current) {
      handleConnection();
    }
    return () => {
      // Unmount sırasında tam temizlik yap
      teardownConnection(true);
    };
  }, [deviceId, ip, handleConnection, teardownConnection]);

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

  // TCP'ye Manuel Bağlan
  const handleTCPReconnect = async () => {
    setIpModalVisible(false);
    setIsConnected(false);
    isConnectingRef.current = true;
    try {
      const trimmedIp = ipAddress.trim();
      const numericPort = parseInt(port) || 502;
      console.log(`[WEIGHT_SCREEN] Manuel TCP bağlantısı başlatılıyor -> ${trimmedIp}:${numericPort} `);
      await modbusService.connectTCP(trimmedIp, numericPort);
      modbusService.isTransitioningToWiFi = false; // Geçiş tamamlandı
      setCurrentTransport('TCP'); // UI'daki badge'i güncelle
      setIsConnected(true);
      isConnectedRef.current = true;
    } catch (err) {
      console.error("❌ Manuel TCP Hatası:", err);
      modbusService.isTransitioningToWiFi = false; // Hata durumunda bayrağı indir
      Alert.alert("❌ Bağlantı Hatası", err.message);
    } finally {
      isConnectingRef.current = false;
    }
  };

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>
          {modbusService.isTransitioningToWiFi ? "WiFi Bağlantısı Bekleniyor..." : "Cihaza Bağlanılıyor..."}
        </Text>

        {modbusService.isTransitioningToWiFi && (
          <View style={{ marginTop: 40, alignItems: 'center' }}>
            <Text style={{ color: '#666', marginBottom: 10 }}>Cihaz WiFi'ye geçince IP girin:</Text>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#4CAF50' }]}
              onPress={() => setIpModalVisible(true)}
            >
              <Text style={styles.buttonText}>IP GİR VE BAĞLAN</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 20 }}
              onPress={() => {
                modbusService.isTransitioningToWiFi = false;
                router.replace('/');
              }}
            >
              <Text style={{ color: '#F44336' }}>İptal Et ve Geri Dön</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* IP Modal */}
        <Modal visible={ipModalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>IP Adresi Girin</Text>
              <View style={{ marginBottom: 15 }}>
                <Text style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>IP Adresi:</Text>
                <TextInput
                  style={styles.modalInput}
                  value={ipAddress}
                  onChangeText={setIpAddress}
                  keyboardType="numeric"
                  placeholder="192.168.137.116"
                />
              </View>

              <View style={{ marginBottom: 15 }}>
                <Text style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>Port (Varsayılan: 502):</Text>
                <TextInput
                  style={styles.modalInput}
                  value={port}
                  onChangeText={setPort}
                  keyboardType="numeric"
                  placeholder="502"
                />
              </View>

              <View style={{ backgroundColor: '#FFF9C4', padding: 8, borderRadius: 5, marginBottom: 10 }}>
                <Text style={{ fontSize: 11, color: '#F57F17' }}>
                  ⚠️ Hata alıyorsanız: Telefonun "Hücresel Veri"sini kapatın ve cihazla aynı WiFi'de olduğunuzdan emin olun.
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#757575' }]} onPress={() => setIpModalVisible(false)}>
                  <Text style={styles.buttonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#4CAF50' }]} onPress={handleTCPReconnect}>
                  <Text style={styles.buttonText}>Bağlan</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        {/* Teşhis Bilgisi */}
        <View style={{ padding: 10, backgroundColor: '#f0f0f0', borderTopWidth: 1, borderTopColor: '#ddd', width: '100%', position: 'absolute', bottom: 0 }}>
          <Text style={{ fontSize: 10, color: '#888', textAlign: 'center' }}>
            Tel IP (Metro): {Constants.expoConfig?.hostUri || 'Bilinmiyor'} | Mod: {modbusService.transport === 'TCP' ? 'WiFi' : 'BLE'}
          </Text>
        </View>
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
        <Text style={[styles.badge, { backgroundColor: currentTransport === 'TCP' ? '#9C27B0' : '#607D8B' }]}>
          {currentTransport === 'TCP' ? `WIFI(${ip})` : "BLE"}
        </Text>
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
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push({
            pathname: "/settings",
            params: { deviceId, transport: currentTransport, ip }
          })}
        >
          <Text style={styles.buttonText}>SETTINGS</Text>
        </TouchableOpacity>
      </View>
      {/* Teşhis Bilgisi */}
      <View style={{ padding: 10, backgroundColor: '#f0f0f0', borderTopWidth: 1, borderTopColor: '#ddd', width: '100%' }}>
        <Text style={{ fontSize: 10, color: '#888', textAlign: 'center' }}>
          Tel IP (Metro): {Constants.expoConfig?.hostUri || 'Bilinmiyor'} | Mod: {modbusService.transport === 'TCP' ? 'WiFi' : 'BLE'}
        </Text>
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
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#fff', borderRadius: 10, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  modalInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, width: '100%', marginBottom: 20, fontSize: 18, textAlign: 'center', backgroundColor: '#f9f9f9' },
  modalButton: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' }
});
