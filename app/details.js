import Constants from 'expo-constants';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import bleService from '../services/bleService';
import modbusService from '../services/modbusService';
import { STATUS_BITS, checkStatus, getStatusMessage } from '../services/modbusUtils';
import { MOCK_COMPANY_INFO } from '../constants/mock-data';

export default function WeightScreen() {
  const { deviceId, deviceName, transport, ip, port: routePort } = useLocalSearchParams();
  const router = useRouter();

  // --- STATE ---
  const [isConnected, setIsConnected] = useState(false);
  const [currentTransport, setCurrentTransport] = useState(transport || 'BLE');
  const [weightDisplay, setWeightDisplay] = useState("0.1");
  const [unit, setUnit] = useState("kg");
  const [isStable, setIsStable] = useState(false);
  const [hasTare, setHasTare] = useState(false);
  const [isOverload, setIsOverload] = useState(false);
  const [ipAddress, setIpAddress] = useState(ip || "192.168.137.182");
  const [port, setPort] = useState(routePort || "23");
  const [ipModalVisible, setIpModalVisible] = useState(false);
  const [dot, setDot] = useState(0);
  const [statusMessages, setStatusMessages] = useState([]);

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
    if (disconnectionSubscriptionRef.current && typeof disconnectionSubscriptionRef.current.remove === 'function') {
      try {
        disconnectionSubscriptionRef.current.remove();
      } catch (e) {
        console.warn("[DETAILS] Subscription removal error:", e);
      }
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
        const res = await modbusService.sendCommand(3, 118, 2);
        if (res && res.success && res.registers && res.registers.length >= 2) {
          const r1 = res.registers[0]; // R118: Dot
          const r2 = res.registers[1]; // R119: Unit

          console.log(`[WEIGHT_SCREEN] Ayarlar Alındı -> Dot: ${r1}, Unit: ${r2}`);
          setDot(r1);
          lastDotRef.current = r1;

          const unitMap = { 0: 'kg', 1: 'g', 2: 'lb', 3: 'mV/V', 4: 'mV' };
          const derivedUnit = unitMap[r2] || 'kg';
          setUnit(derivedUnit);
          console.log(`[WEIGHT_SCREEN] Birim Set Edildi: ${derivedUnit}`);
        }
      }
    } catch (error) {
      console.warn("[WEIGHT_SCREEN] Ayarlar çekilemedi:", error.message);
    }
  }, []);

  const parseDeviceData = useCallback((value) => {
    if (isTeardownRef.current) return;
    try {
      if (!value || value.length < 5) return;

      // TCP'de veri PDU'su 7. byte'dan başlar (MBAP Header 7 byte olduğu için)
      // Ancak modbusService handleIncomingData içinde zaten parse ediyor olabilir mi?
      // Hayır, onDataCallback'e çiğ veri gönderiyoruz.
      const isStandardTCP = modbusService.transport === 'TCP' && modbusService.port === 502;
      const funcCode = isStandardTCP ? value[7] : value[1];

      // Hata Yanıtı (FC | 0x80)
      if (funcCode & 0x80) {
        console.warn(`📡 Cihaz Hatası: FC ${funcCode} `);
        return;
      }

      if (funcCode === 3) {
        const byteCount = isStandardTCP ? value[8] : value[2];
        const dataOffset = isStandardTCP ? 9 : 3;

        if (value.length < dataOffset + byteCount) return;

        // Register 7: Durum (STATUS)
        const status = (value[dataOffset] << 8) | value[dataOffset + 1];
        setIsStable(checkStatus(status, STATUS_BITS.STABILITY));
        setIsOverload(checkStatus(status, STATUS_BITS.OVERWEIGHT));
        setHasTare(checkStatus(status, STATUS_BITS.TARE_EXIST));

        // Cihazdan gelen tüm durum mesajlarını al
        setStatusMessages(getStatusMessage(status));

        // Birim ve Nokta (Register 118 ve 119 okunursa byteCount=4 olur)
        if (byteCount === 4) {
          const r1 = (value[dataOffset] << 8) | value[dataOffset + 1];
          const r2 = (value[dataOffset + 2] << 8) | value[dataOffset + 3];

          console.log(`[WEIGHT_SCREEN] Ayarlar Geldi -> R1: ${r1}, R2: ${r2}`);

          setDot(r1);
          lastDotRef.current = r1;

          const unitMap = { 0: 'kg', 1: 'g', 2: 'lb', 3: 'mV/V', 4: 'mV' };
          const derivedUnit = unitMap[r2] || 'kg';
          setUnit(derivedUnit);
          console.log(`[WEIGHT_SCREEN] Birim Güncellendi: ${derivedUnit} (Kod: ${r2})`);
          return;
        }

        // Ağırlık Verisi
        if (byteCount >= 6) {
          const highWord = (value[dataOffset + 2] << 8) | value[dataOffset + 3];
          const lowWord = (value[dataOffset + 4] << 8) | value[dataOffset + 5];

          // JS Bitwise operators (<<, |) zaten 32-bit signed integer sonuç üretir.
          const rawValue = (highWord << 16) | lowWord;

          // Nokta hanesi kontrolü (RangeError: toFixed hatasını önlemek için)
          let currentDot = parseInt(lastDotRef.current);
          if (isNaN(currentDot) || currentDot < 0 || currentDot > 5) {
            currentDot = 0; // Geçersiz veri gelirse virgülsüz göster
          }

          const formatted = (rawValue / Math.pow(10, currentDot)).toFixed(currentDot);
          setWeightDisplay(formatted);
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
        const targetPort = routePort || 502;
        console.log(`[WEIGHT_SCREEN] TCP Bağlantısı başlatılıyor: ${ip}:${targetPort}`);
        await modbusService.connectTCP(ip, targetPort);
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
      let timeoutId = null;
      let isActive = true;

      const poll = async () => {
        if (!isActive || isTeardownRef.current) return;

        // Eğer bağlantı tamamen koptuysa (transport NONE)
        if (modbusService.transport === 'NONE' || !isConnectedRef.current) {
          if (isConnectedRef.current) {
            console.log("[DETAILS] Bağlantı koptu, yeniden bağlanılıyor...");
            try {
              // Eskisi gibi 3s beklemek yerine hemen dene (veya çok kısa bekle)
              await new Promise(r => setTimeout(r, 500));
              await modbusService.connectTCP(ip, port);

              // Cihaz düşmeden hemen ayarları tazele (Eğer gerekliyse)
              if (!unit) {
                console.log("[DETAILS] Ayarlar eksik, çekiliyor...");
                await new Promise(r => setTimeout(r, 100));
                await fetchSettings();
              }
            } catch (reErr) {
              console.warn("[DETAILS] Reconnect denemesi başarısız.");
            }
          }
          // Bağlantı yokken 2 saniye bekleyip tekrar dene
          timeoutId = setTimeout(poll, 2000);
          return;
        }

        try {
          await modbusService.sendCommand(3, 7, 3, null, false, false);
        } catch (e) {
          // Bağlantı kopma aşamasındayken veya bilinen hatalarda uyarıları sustur
          const isIgnorable = e.message.includes("NONE") || e.message.includes("Socket null") || isTeardownRef.current;
          if (!isIgnorable) {
            console.warn("[WEIGHT_SCREEN] Poll hatası:", e.message);
          }
        }

        // Bir sonraki sorguyu planla (WiFi için 300ms daha stabil)
        if (isActive && isConnectedRef.current && !isTeardownRef.current) {
          const delay = modbusService.transport === 'TCP' ? 300 : 150;
          timeoutId = setTimeout(poll, delay);
        }
      };

      if (isConnected) {
        fetchSettings();
        poll();
      }

      return () => {
        isActive = false;
        if (timeoutId) clearTimeout(timeoutId);
      };
    }, [isConnected, fetchSettings])
  );

  // TCP'ye Manuel Bağlan
  const handleTCPReconnect = async () => {
    setIpModalVisible(false);
    setIsConnected(false);
    isConnectedRef.current = false;
    isConnectingRef.current = true;

    try {
      const trimmedIp = ipAddress.trim();
      const numericPort = parseInt(port) || 502;

      console.log(`[WEIGHT_SCREEN] Manuel TCP bağlantısı başlatılıyor -> ${trimmedIp}:${numericPort}`);

      // Önceki (varsa BLE) bağlantıyı güvenli kapat
      await modbusService.safeTeardown(true);

      // Yeni TCP bağlantısı kur
      await modbusService.connectTCP(trimmedIp, numericPort);

      modbusService.isTransitioningToWiFi = false; // Geçiş tamamlandı
      setCurrentTransport('TCP'); // UI'daki badge'i güncelle

      // Veri dinleyiciyi tekrar bağla
      modbusService.onDataCallback = (data) => {
        if (isTeardownRef.current) return;
        parseDeviceData(data);
      };

      setIsConnected(true);
      isConnectedRef.current = true;
      console.log("✅ WiFi Bağlantısı BAŞARILI");

      // WiFi kararlılığı için kısa bir süre sonra ayarları tekrar çek
      setTimeout(() => {
        if (isConnectedRef.current) fetchSettings();
      }, 500);

    } catch (err) {
      console.error("❌ Manuel TCP Hatası:", err);
      modbusService.isTransitioningToWiFi = false; // Hata durumunda bayrağı indir
      Alert.alert("❌ Bağlantı Hatası", err.message);
    } finally {
      isConnectingRef.current = false;
    }
  };

  const getSubnetWarning = () => {
    const hostUri = Constants.expoConfig?.hostUri || "";
    if (!hostUri || !ipAddress) return null;
    const phoneSubnet = hostUri.split(':')[0].split('.').slice(0, 3).join('.');
    const deviceSubnet = ipAddress.split('.').slice(0, 3).join('.');
    if (phoneSubnet !== deviceSubnet) {
      return `⚠️ Subnet Uyumsuzluğu: Telefonunuz ${phoneSubnet}.x ağında, cihaz ise ${deviceSubnet}.x ağında. Bağlantı kurulamaz!`;
    }
    return null;
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
              onPress={async () => {
                console.log("🔙 Kullanıcı bağlantıyı iptal etti, geri dönülüyor...");
                modbusService.isTransitioningToWiFi = false;
                modbusService.isConnecting = false; // Döngüyü kır
                await teardownConnection(true);
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

              {getSubnetWarning() && (
                <View style={{ backgroundColor: '#FFEBEE', padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#EF5350' }}>
                  <Text style={{ fontSize: 14, color: '#C62828', fontWeight: 'bold', marginBottom: 5 }}>🛑 AĞ UYUMSUZLUĞU!</Text>
                  <Text style={{ fontSize: 12, color: '#D32F2F', lineHeight: 18 }}>
                    {getSubnetWarning()}
                  </Text>
                  <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#FFCDD2', paddingTop: 10 }}>
                    <Text style={{ fontSize: 11, color: '#B71C1C', fontWeight: 'bold' }}>NASIL ÇÖZÜLÜR?</Text>
                    <Text style={{ fontSize: 11, color: '#B71C1C' }}>1. Telefonunuzun WiFi ayarlarına girin.</Text>
                    <Text style={{ fontSize: 11, color: '#B71C1C' }}>2. Bilgisayarınızın açtığı Hotspot'a bağlanın.</Text>
                    <Text style={{ fontSize: 11, color: '#B71C1C' }}>3. Mobily Veri'yi (4G/5G) kapatın.</Text>
                  </View>
                </View>
              )}

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
                  ⚠️ SUBNET UYARISI: ESP32 IP bloğu ({ip ? ip.split('.').slice(0, 3).join('.') : '---'}) ile telefonunuzun bağlı olduğu ağ AYNI olmalıdır.
                  Windows Hotspot kullanıyorsanız telefonunuzun WiFi üzerinden o hotspot'a bağlı olduğundan emin olun.
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
            {MOCK_COMPANY_INFO.name} | v{MOCK_COMPANY_INFO.version} | Mod: {modbusService.transport === 'TCP' ? 'WiFi' : 'BLE'}
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
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#2196F3' }]}
            onPress={() => hasTare ? modbusService.clearTare() : modbusService.tare()}
          >
            <Text style={styles.buttonText}>{hasTare ? "DARA İPTAL" : "TARE"}</Text>
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
      {/* Teşhis Bilgisi & Durum Mesajları */}
      <View style={{ padding: 10, backgroundColor: '#f0f0f0', borderTopWidth: 1, borderTopColor: '#ddd', width: '100%', position: 'absolute', bottom: 0 }}>
        <Text style={{ fontSize: 10, color: '#888', textAlign: 'center' }}>
          {MOCK_COMPANY_INFO.name} | v{MOCK_COMPANY_INFO.version} | Bağlantı: {modbusService.transport === 'TCP' ? 'WiFi' : 'BLE'}
        </Text>
        {statusMessages.length > 0 && (
          <View style={{ marginTop: 5, alignItems: 'center' }}>
            {statusMessages.map((msg, idx) => (
              <Text key={idx} style={{ color: msg.includes('⚠️') ? '#FF9800' : msg.includes('❌') ? '#F44336' : '#666', fontSize: 11, fontWeight: 'bold' }}>
                {msg}
              </Text>
            ))}
          </View>
        )}
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
  modalInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, width: '100%', marginBottom: 20, fontSize: 18, textAlign: 'center', backgroundColor: '#f9f9f9', color: '#000' },
  modalButton: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' }
});
