import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, NativeEventEmitter, NativeModules, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BleManager from 'react-native-ble-manager';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

export default function WeightScreen() {
  const { deviceId, deviceName } = useLocalSearchParams();
  const router = useRouter();
  const [weightDisplay, setWeightDisplay] = useState("0.0");
  const [unit, setUnit] = useState("kg");
  const [isStable, setIsStable] = useState(false); // Hareketsizlik kontrolü 
  const [isConnected, setIsConnected] = useState(false);

  const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
  const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

  useEffect(() => {
    let isMounted = true;
    const handler = bleManagerEmitter.addListener(
      "BleManagerDidUpdateValueForCharacteristic",
      ({ value }) => {
        if (isMounted && value && value.length >= 8) {
          // Kılavuz Tablo: Adres 8-9 Ekran Değeri [cite: 638]
          // Byte dizisinden ağırlığı ve durum bitlerini çözüyoruz
          parseDeviceData(value);
        }
      }
    );

    if (deviceId) handleConnection(deviceId);

    return () => {
      isMounted = false;
      handler.remove();
    };
  }, [deviceId]);

  const parseDeviceData = (value) => {
    // Kılavuza göre Modbus Register 8-9 Ekran değerini temsil eder [cite: 638]
    // Register 7 Durum bilgilerini içerir [cite: 638]
    
    // Basit bir örnek çözümleme (Cihazın gönderdiği byte sırasına göre ayarlanmalı):
    const statusByte = value[7]; 
    const stable = (statusByte & (1 << 6)) !== 0; // 6. bit hareketsizlik 
    setIsStable(stable);

    // Ağırlık verisi (Register 8-9)
    const raw = (value[0] << 24) | (value[1] << 16) | (value[2] << 8) | value[3];
    setWeightDisplay((raw / 10).toFixed(1)); 
  };

  // DONANIMSAL SIFIRLAMA (Komut 5) 
  const handleZero = async () => {
    try {
      await BleManager.write(deviceId, SERVICE_UUID, CHARACTERISTIC_UUID, [5]);
      console.log("Cihaz sıfırlandı ");
    } catch (error) {
      Alert.alert("Hata", "Sıfırlama komutu gönderilemedi.");
    }
  };

  // DONANIMSAL DARA (Komut 6) 
  const handleTare = async () => {
    try {
      await BleManager.write(deviceId, SERVICE_UUID, CHARACTERISTIC_UUID, [6]);
      console.log("Dara alındı ");
    } catch (error) {
      Alert.alert("Hata", "Dara komutu gönderilemedi.");
    }
  };

  const handleConnection = async (id) => {
    try {
      await BleManager.stopScan(); 
      await BleManager.connect(id);
      setIsConnected(true);
      await BleManager.retrieveServices(id); 
      await BleManager.startNotification(id, SERVICE_UUID, CHARACTERISTIC_UUID);
    } catch (error) {
      console.error("Bağlantı hatası:", error);
    }
  };

  return (
    <View style={styles.container}>
      {/* Stabilite Göstergesi */}
      <View style={styles.statusHeader}>
        <Text style={[styles.statusText, { color: isStable ? 'green' : 'red' }]}>
          {isStable ? "● STABİL" : "○ HAREKETLİ"}
        </Text>
      </View>

      <View style={styles.weightCard}>
        <Text style={styles.weightText}>{weightDisplay}</Text>
        <Text style={styles.unitText}>{unit}</Text>
      </View>

      <View style={styles.controlPanel}>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#FF9800' }]} onPress={handleZero}>
            <Text style={styles.buttonText}>ZERO</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#2196F3' }]} onPress={handleTare}>
            <Text style={styles.buttonText}>TARE</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.settingsButton} 
          onPress={() => router.push({ pathname: "/settings", params: { deviceId } })}
        >
          <Text style={styles.buttonText}>SETTINGS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center' },
  statusHeader: { position: 'absolute', top: 100 },
  statusText: { fontWeight: 'bold', fontSize: 16 },
  weightCard: {
    width: 280, height: 280, backgroundColor: '#fff', borderRadius: 140,
    borderWidth: 8, borderColor: '#2196F3', alignItems: 'center', justifyContent: 'center',
    elevation: 10, marginBottom: 40
  },
  weightText: { fontSize: 70, fontWeight: 'bold', color: '#333' },
  unitText: { fontSize: 20, color: '#666' },
  controlPanel: { alignItems: 'center', gap: 20 },
  buttonRow: { flexDirection: 'row', gap: 20 },
  actionButton: { paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, elevation: 3 },
  settingsButton: { backgroundColor: '#757575', paddingVertical: 15, paddingHorizontal: 80, borderRadius: 30, elevation: 3 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});