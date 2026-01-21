import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import BleManager from 'react-native-ble-manager';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

export default function HomeScreen() {
  const [peripherals, setPeripherals] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 1. BleManager'ı başlat
    BleManager.start({ showAlert: false }).then(() => {
      console.log('BleManager Başlatıldı ✅');
    });

    const handleDiscover = (peripheral) => {
      console.log('--- MÜJDE: CİHAZ GELDİ ---', peripheral.id);
      setPeripherals((prev) => {
        if (!prev.find((d) => d.id === peripheral.id)) {
          return [...prev, peripheral];
        }
        return prev;
      });
    };

    // Büyük harfle başlayan olay ismi
    const sub1 = bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      handleDiscover
    );

    // Küçük harfle başlayan olay ismi (Garanti olsun diye ikisini de ekliyoruz)
    const sub2 = bleManagerEmitter.addListener(
      'bleManagerDiscoverPeripheral',
      handleDiscover
    );

    const sub3 = bleManagerEmitter.addListener(
      'BleManagerStopScan',
      () => {
        setIsScanning(false);
        console.log('Tarama durdu.');
      }
    );

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
    };
  }, []);
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      if (
        granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
      ) {
        console.log('Tüm izinler kullanıcı tarafından onaylandı ✅');
        return true;
      } else {
        console.log('İzinler reddedildi ❌');
        return false;
      }
    }
    return true;
  };

  const startScan = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert("İzin Hatası", "Lütfen Ayarlar'dan Bluetooth ve Konum izinlerini verin.");
      return;
    }

    BleManager.enableBluetooth()
      .then(() => {
        setPeripherals([]);
        setIsScanning(true);

        console.log('Tarama başlatılıyor...');

        // V11 FORMATI: Parametreler dizi olarak gönderilmeli
        // 1. Parametre: Servis UUID'leri dizisi []
        // 2. Parametre: Saniye (sayı)
        // 3. Parametre: Tekrar eden cihazlara izin verilsin mi (boolean)
        BleManager.scan([], 10, true)
          .then(() => {
            console.log('Tarama emri başarıyla iletildi 🚀');
          })
          .catch((err) => {
            console.error('Tarama hatası:', err);
            setIsScanning(false);
          });
      })
      .catch((err) => {
        Alert.alert("Hata", "Lütfen Bluetooth'u açın.");
      });
  };

  const connectToDevice = (item) => {
    BleManager.stopScan();
    router.push({
      pathname: "/details",
      params: { deviceId: item.id, deviceName: item.name || "İsimsiz Cihaz" }
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ESP32 Modbus Okuyucu</Text>
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
          <TouchableOpacity
            style={styles.deviceItem}
            onPress={() => connectToDevice(item)}
          >
            <View>
              <Text style={styles.deviceName}>
                {item.name || item.advertising?.localName || item.advertising?.serviceUUIDs?.[0] || "Bilinmeyen Cihaz"}                </Text>
              <Text style={styles.deviceId}>{item.id}</Text>
              <Text style={styles.rssi}>Sinyal (RSSI): {item.rssi}</Text>
            </View>
            <Text style={styles.connectText}>Bağlan &gt;</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isScanning ? "Çevredeki cihazlar dinleniyor..." : "Taramayı başlatmak için butona basın."}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 30, paddingTop: 60, alignItems: 'center', backgroundColor: '#fff', elevation: 4 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    marginVertical: 6,
    marginHorizontal: 15,
    borderRadius: 12,
    elevation: 2
  },
  deviceName: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  deviceId: { fontSize: 12, color: '#666', marginTop: 4 },
  rssi: { fontSize: 12, color: '#999', marginTop: 2 },
  connectText: { color: '#007AFF', fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#888', fontSize: 16 }
});