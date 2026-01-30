import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import bleService from '../services/bleService';
import { ModbusService } from '../services/modbusService';

export default function HomeScreen() {
  const [devices, setDevices] = useState([]); // BLE + WiFi cihazları
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [selectedDevices, setSelectedDevices] = useState([]); // Çoklu seçim için
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  // Subnet yönetimi
  const [subnet, setSubnet] = useState("192.168.137"); // Kullanıcının durumuna göre güncellendi
  const [isSubnetModalVisible, setIsSubnetModalVisible] = useState(false);

  // Manüel IP Modal
  const [manualIp, setManualIp] = useState("192.168.137.116");
  const [manualPort, setManualPort] = useState("23");
  const [isManualModalVisible, setIsManualModalVisible] = useState(false);

  // Kayıtlı Cihazlar
  const [savedDevices, setSavedDevices] = useState([]);

  const router = useRouter();

  useEffect(() => {
    // Metro IP üzerinden subnet tahmini
    const hostUri = Constants.expoConfig?.hostUri || "";
    if (hostUri.includes('.')) {
      const parts = hostUri.split(':')[0].split('.');
      if (parts.length === 4) {
        const detectedSubnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
        console.log(`[UI] Metro IP üzerinden tespit edilen ağ: ${detectedSubnet}.x`);
        // Sadece varsayılan değerdeyse veya çok büyük fark varsa güncelle
        setSubnet(prev => (prev === "192.168.1" ? detectedSubnet : prev));
      }
    }

    loadSavedDevices();

    return () => {
      bleService.getManager().stopDeviceScan();
    };
  }, []);

  const loadSavedDevices = async () => {
    try {
      const stored = await AsyncStorage.getItem('@saved_devices');
      if (stored) {
        setSavedDevices(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Kayıtlı cihazlar yüklenemedi:", e);
    }
  };

  const saveDevice = async (device) => {
    try {
      if (device.type !== 'TCP') return;
      const updated = [device, ...savedDevices.filter(d => d.ip !== device.ip)].slice(0, 5);
      setSavedDevices(updated);
      await AsyncStorage.setItem('@saved_devices', JSON.stringify(updated));
    } catch (e) {
      console.error("Cihaz kaydedilemedi:", e);
    }
  };

  const removeSavedDevice = async (ip) => {
    Alert.alert(
      "Cihazı Sil",
      "Bu cihazı kayıtlı listesinden kaldırmak istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: async () => {
            try {
              const updated = savedDevices.filter(d => d.ip !== ip);
              setSavedDevices(updated);
              await AsyncStorage.setItem('@saved_devices', JSON.stringify(updated));
            } catch (e) {
              console.error("Cihaz silinemedi:", e);
            }
          }
        }
      ]
    );
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return (
        granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  };

  // --- BLE TARAMA ---
  const startBLEScan = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert("İzin Hatası", "Lütfen Bluetooth ve Konum izinlerini verin.");
      return;
    }

    setDevices([]);
    setIsScanning(true);
    const manager = bleService.getManager();

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('Scan error:', error);
        setIsScanning(false);
        return;
      }
      if (device && device.name) {
        setDevices((prev) => {
          if (!prev.find((d) => d.id === device.id)) {
            return [...prev, { id: device.id, name: device.name, rssi: device.rssi, type: 'BLE' }];
          }
          return prev;
        });
      }
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 10000);
  };

  // --- WiFi TARAMA ---
  // --- WiFi TARAMA (GÜNCELLENMİŞ HALİ) ---
  const startWiFiScan = async () => {
    setDevices([]);
    setIsScanning(true);
    setScanProgress(0);

    try {
      console.log(`[UI] Akıllı WiFi Taraması Başlatılıyor...`);

      // ESKİ KOD: const found = await ModbusService.scanNetwork(subnet, ...);
      // YENİ KOD: Artık smartScan kullanıyoruz, subnet parametresi vermemize gerek yok.
      const found = await ModbusService.smartScan((progress) => {
        setScanProgress(progress);
      });

      if (found.length === 0) {
        Alert.alert("Sonuç", "Hiçbir ağda (192.168.1.x, 137.x, 4.x) cihaz bulunamadı. \n\nLütfen cihazın ve telefonun aynı Hotspot'a bağlı olduğundan emin olun.");
      }

      setDevices(found.map(d => ({
        id: d.ip,
        name: d.name,
        ip: d.ip,
        port: d.port,
        type: 'TCP'
      })));

      // Bulunanları otomatik hafızaya ekle
      if (found.length > 0) {
        found.forEach(d => saveDevice({ id: d.ip, name: d.name, ip: d.ip, port: d.port, type: 'TCP' }));
      }

    } catch (error) {
      Alert.alert("Tarama Hatası", error.message);
    } finally {
      setIsScanning(false);
    }
  };






  const addManualDevice = () => {
    const trimmedIp = manualIp.trim();
    if (!trimmedIp || !trimmedIp.includes('.')) {
      Alert.alert("Hata", "Geçerli bir IP girin.");
      return;
    }

    const numericPort = parseInt(manualPort) || 502;

    const newDevice = {
      id: trimmedIp,
      name: `Cihaz (${trimmedIp})`,
      ip: trimmedIp,
      port: numericPort,
      type: 'TCP'
    };

    setDevices(prev => {
      if (prev.find(d => d.id === newDevice.id)) return prev;
      return [...prev, newDevice];
    });

    setIsManualModalVisible(false);
    Alert.alert("Başarılı", "Cihaz listeye eklendi.");
  };

  const toggleDeviceSelection = (device) => {
    setSelectedDevices(prev => {
      const isSelected = prev.find(d => d.id === device.id);
      if (isSelected) {
        return prev.filter(d => d.id !== device.id);
      } else {
        return [...prev, device];
      }
    });
  };

  const handleConnect = () => {
    if (isMultiSelectMode) {
      if (selectedDevices.length === 0) {
        Alert.alert("Uyarı", "Lütfen en az bir cihaz seçin.");
        return;
      }
      // Çoklu Tartım Ekranına Git
      router.push({
        pathname: "/multiWeight",
        params: { devicesJson: JSON.stringify(selectedDevices) }
      });
    } else {
      // Tekli Bağlantı (Mevcut Akış)
      const device = selectedDevices[0];
      if (!device) return;

      // TCP ise hafızaya al
      if (device.type === 'TCP') {
        saveDevice(device);
      }

      router.push({
        pathname: "/details",
        params: {
          deviceId: device.id,
          deviceName: device.name,
          transport: device.type,
          ip: device.ip || "",
          port: device.port?.toString() || ""
        }
      });
    }
  };

  const renderDevice = ({ item }) => {
    const isSelected = selectedDevices.some(d => d.id === item.id);
    return (
      <TouchableOpacity
        style={[styles.deviceItem, isSelected && styles.selectedItem]}
        onPress={() => {
          if (isMultiSelectMode) {
            toggleDeviceSelection(item);
          } else {
            setSelectedDevices([item]);
          }
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.deviceName}>{item.name}</Text>
          <Text style={styles.deviceId}>{item.type === 'BLE' ? item.id : `${item.ip}:${item.port}`}</Text>
          {item.type === 'BLE' && <Text style={styles.rssi}>Sinyal: {item.rssi}</Text>}
        </View>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{item.type}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Terazi Fabrikası</Text>
        <View style={styles.scanButtons}>
          <TouchableOpacity
            style={[styles.scanBtn, styles.bleBtn]}
            onPress={startBLEScan}
            disabled={isScanning}
          >
            <Text style={styles.btnText}>BLE TARA</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanBtn, styles.wifiBtn]}
            onPress={startWiFiScan}
            disabled={isScanning}
          >
            <Text style={styles.btnText}>WIFI TARA ({subnet}.x)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanBtn, styles.manualBtn]}
            onPress={() => setIsManualModalVisible(true)}
          >
            <Text style={styles.btnText}>+ MANUEL IP EKLE</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.subnetConfig}
          onPress={() => setIsSubnetModalVisible(true)}
        >
          <Text style={styles.subnetText}>⚙️ Subnet: {subnet}.x (Değiştir)</Text>
        </TouchableOpacity>

        {isScanning && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator color="#2196F3" />
            {scanProgress > 0 && <Text style={styles.progressText}>%{Math.round(scanProgress * 100)}</Text>}
          </View>
        )}

        <View style={styles.modeContainer}>
          <TouchableOpacity
            style={[styles.modeToggle, isMultiSelectMode && styles.activeMode]}
            onPress={() => {
              setIsMultiSelectMode(!isMultiSelectMode);
              setSelectedDevices([]);
            }}
          >
            <Text style={styles.modeText}>{isMultiSelectMode ? "Çoklu Seçim Açık" : "Tekli Seçim Modu"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={[
          ...(savedDevices.length > 0 ? [{ id: 'header-saved', type: 'HEADER', title: 'KAYITLI CİHAZLAR' }, ...savedDevices.map(d => ({ ...d, isSaved: true }))] : []),
          ...(devices.length > 0 ? [
            { id: 'header-discovered', type: 'HEADER', title: 'BULUNAN CİHAZLAR' },
            // ÖNEMLİ: Zaten kayıtlı olanları listeden çıkar (Mükerrer Key hatasını önler)
            ...devices.filter(d => !savedDevices.some(sd => sd.ip === d.ip && d.type === 'TCP'))
          ] : []),
          ...(savedDevices.length === 0 && devices.length === 0 ? [{ id: 'empty', type: 'EMPTY' }] : [])
        ]}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          if (item.type === 'HEADER') {
            return <Text style={styles.sectionHeader}>{item.title}</Text>;
          }
          if (item.type === 'EMPTY') {
            return <Text style={styles.emptyText}>Henüz cihaz bulunamadı.</Text>;
          }
          const isSelected = selectedDevices.some(d => d.id === item.id);
          return (
            <TouchableOpacity
              style={[styles.deviceItem, isSelected && styles.selectedItem]}
              onPress={() => {
                if (isMultiSelectMode) {
                  toggleDeviceSelection(item);
                } else {
                  setSelectedDevices([item]);
                }
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>{item.name} {item.isSaved && "⭐"}</Text>
                <Text style={styles.deviceId}>{item.type === 'BLE' ? item.id : `${item.ip}:${item.port}`}</Text>
                {item.type === 'BLE' && <Text style={styles.rssi}>Sinyal: {item.rssi}</Text>}
              </View>
              {item.isSaved && (
                <TouchableOpacity onPress={() => removeSavedDevice(item.ip)} style={{ padding: 10 }}>
                  <Text style={{ fontSize: 18 }}>🗑️</Text>
                </TouchableOpacity>
              )}
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{item.type}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ paddingBottom: 180 }}
      />

      {/* Ağ Maskesi Modal */}
      <Modal visible={isSubnetModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ağ Maskesi Ayarla</Text>
            <Text style={styles.modalInfo}>Taramak istediğiniz ağın ilk 3 hanesini girin:</Text>
            <TextInput
              style={styles.modalInput}
              value={subnet}
              onChangeText={setSubnet}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#757575' }]} onPress={() => setIsSubnetModalVisible(false)}>
                <Text style={styles.btnText}>İPTAL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#2196F3' }]} onPress={() => setIsSubnetModalVisible(false)}>
                <Text style={styles.btnText}>TAMAM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manüel IP Modal */}
      <Modal visible={isManualModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Manüel Cihaz Ekle</Text>

            <View style={{ width: '100%', marginBottom: 15 }}>
              <Text style={{ fontSize: 12, color: '#666', marginBottom: 5 }}>IP Adresi:</Text>
              <TextInput
                style={styles.modalInput}
                value={manualIp}
                onChangeText={setManualIp}
                keyboardType="numeric"
                placeholder="192.168.137.116"
              />
            </View>

            {(() => {
              const hostUri = Constants.expoConfig?.hostUri || "";
              if (!hostUri || !manualIp) return null;
              const phoneSubnet = hostUri.split(':')[0].split('.').slice(0, 3).join('.');
              const deviceSubnet = manualIp.split('.').slice(0, 3).join('.');
              if (phoneSubnet !== deviceSubnet) {
                return (
                  <View style={{ backgroundColor: '#FFEBEE', padding: 10, borderRadius: 10, marginBottom: 15, borderWeight: 1, borderColor: '#EF5350' }}>
                    <Text style={{ fontSize: 11, color: '#B71C1C', fontWeight: 'bold' }}>⚠️ AĞ UYUMSUZLUĞU TESPİT EDİLDİ</Text>
                    <Text style={{ fontSize: 10, color: '#D32F2F', marginTop: 3 }}>
                      Telefonunuz: {phoneSubnet}.x | Hedef: {deviceSubnet}.x
                    </Text>
                  </View>
                );
              }
              return null;
            })()}

            <View style={{ width: '100%', marginBottom: 15 }}>
              <Text style={{ fontSize: 12, color: '#666', marginBottom: 5 }}>Port (Modbus TCP: 502, RTU/TCP: 23):</Text>
              <TextInput
                style={styles.modalInput}
                value={manualPort}
                onChangeText={setManualPort}
                keyboardType="numeric"
                placeholder="502"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#757575' }]} onPress={() => setIsManualModalVisible(false)}>
                <Text style={styles.btnText}>İPTAL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#4CAF50' }]} onPress={addManualDevice}>
                <Text style={styles.btnText}>EKLE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Teşhis Bilgisi */}
      <View style={styles.diagnosisBar}>
        <Text style={styles.diagnosisText}>
          Metro IP: {Constants.expoConfig?.hostUri || '---'} | Hedef: {subnet}.x
        </Text>
      </View>

      {selectedDevices.length > 0 && (
        <TouchableOpacity style={styles.floatingButton} onPress={handleConnect}>
          <Text style={styles.floatBtnText}>
            {isMultiSelectMode ? `${selectedDevices.length} CİHAZA BAĞLAN` : "BAĞLAN"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { padding: 25, paddingTop: 50, backgroundColor: '#fff', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 5 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 20, color: '#1a1a1a', textAlign: 'center' },
  scanButtons: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  scanBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 15, elevation: 2 },
  bleBtn: { backgroundColor: '#007AFF' },
  wifiBtn: { backgroundColor: '#4CAF50' },
  manualBtn: { backgroundColor: '#9C27B0' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  subnetConfig: { marginTop: 15, alignSelf: 'center' },
  subnetText: { fontSize: 13, color: '#2196F3', fontWeight: '600' },
  loaderContainer: { marginTop: 15, alignItems: 'center' },
  progressText: { fontSize: 12, color: '#666', marginTop: 5 },
  modeContainer: { marginTop: 20, alignItems: 'center' },
  modeToggle: { paddingVertical: 6, paddingHorizontal: 15, borderRadius: 20, borderWeight: 1, borderColor: '#ddd' },
  activeMode: { backgroundColor: '#FFF9C4', borderColor: '#FBC02D' },
  modeText: { fontSize: 12, color: '#555' },
  deviceItem: {
    flexDirection: 'row', alignItems: 'center', padding: 18,
    backgroundColor: '#fff', marginVertical: 6, marginHorizontal: 20,
    borderRadius: 15, borderLeftWidth: 5, borderLeftColor: '#ddd'
  },
  selectedItem: { backgroundColor: '#e3f2fd', borderLeftColor: '#2196F3' },
  deviceName: { fontSize: 17, fontWeight: '700', color: '#333' },
  sectionHeader: { marginHorizontal: 25, marginTop: 20, marginBottom: 5, fontSize: 13, fontWeight: '900', color: '#888', letterSpacing: 1 },
  deviceId: { fontSize: 12, color: '#888', marginTop: 3 },
  rssi: { fontSize: 11, color: '#bbb', marginTop: 2 },
  typeBadge: { backgroundColor: '#f0f0f0', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  typeText: { fontSize: 10, fontWeight: '900', color: '#888' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#bbb', fontSize: 16 },
  floatingButton: {
    position: 'absolute', bottom: 90, left: 30, right: 30,
    backgroundColor: '#2196F3', padding: 18, borderRadius: 20,
    alignItems: 'center', elevation: 8
  },
  floatBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 20, padding: 25, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  modalInfo: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  modalInput: { width: '100%', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, fontSize: 18, textAlign: 'center', backgroundColor: '#f9f9f9', marginBottom: 15 },
  modalInfoBox: { backgroundColor: '#FFF9C4', padding: 10, borderRadius: 10, marginBottom: 20 },
  infoBoxText: { fontSize: 12, color: '#F57F17', textAlign: 'center' },
  modalButtons: { flexDirection: 'row', gap: 10, width: '100%' },
  modalBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
  diagnosisBar: { position: 'absolute', bottom: 60, width: '100%', backgroundColor: '#f0f0f0', padding: 5, borderTopWidth: 1, borderTopColor: '#ddd', opacity: 0.8 },
  diagnosisText: { fontSize: 9, color: '#999', textAlign: 'center' }
});
