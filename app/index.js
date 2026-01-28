import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import bleService from '../services/bleService';

export default function HomeScreen() {
  const [peripherals, setPeripherals] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const router = useRouter();

  useEffect(() => {
    return () => {
      // Sadece taramayı durdur, manager'ı yok etme!
      bleService.getManager().stopDeviceScan();
    };
  }, []);

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

  const startScan = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert("İzin Hatası", "Lütfen Bluetooth ve Konum izinlerini verin.");
      return;
    }

    setPeripherals([]);
    setIsScanning(true);
    const manager = bleService.getManager();

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('Scan error:', error);
        setIsScanning(false);
        return;
      }
      if (device && device.name) {
        setPeripherals((prev) => {
          if (!prev.find((d) => d.id === device.id)) {
            return [...prev, { id: device.id, name: device.name, rssi: device.rssi }];
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

  const connectToDevice = (item) => {
    bleService.getManager().stopDeviceScan();
    router.push({
      pathname: "/details",
      params: { deviceId: item.id, deviceName: item.name || "Cihaz" }
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Terazi Bağlantısı</Text>
        <Button
          title={isScanning ? 'Aranıyor...' : 'Cihazları Tara'}
          onPress={startScan}
          disabled={isScanning}
        />
      </View>
      <FlatList
        data={peripherals}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.deviceItem} onPress={() => connectToDevice(item)}>
            <View>
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.deviceId}>{item.id}</Text>
              <Text style={styles.rssi}>Sinyal: {item.rssi}</Text>
            </View>
            <Text style={styles.connectText}>Bağlan &gt;</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 30, paddingTop: 60, alignItems: 'center', backgroundColor: '#fff', elevation: 4 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  deviceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', marginVertical: 6, marginHorizontal: 15, borderRadius: 12, elevation: 2 },
  deviceName: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  deviceId: { fontSize: 12, color: '#666', marginTop: 4 },
  rssi: { fontSize: 12, color: '#999', marginTop: 2 },
  connectText: { color: '#007AFF', fontWeight: 'bold' }
});
