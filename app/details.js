import { useLocalSearchParams, useRouter } from 'expo-router';

import { useEffect, useState } from 'react';

import { ActivityIndicator, Alert, NativeEventEmitter, NativeModules, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import BleManager from 'react-native-ble-manager';

import modbusService from '../services/modbusService';



const BleManagerModule = NativeModules.BleManager;

const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);



export default function WeightScreen() {

  const { deviceId, deviceName } = useLocalSearchParams();

  const router = useRouter();



  // --- STATE TANIMLAMALARI ---

  const [isConnected, setIsConnected] = useState(false);

  const [weightDisplay, setWeightDisplay] = useState("0.0");

  const [unit, setUnit] = useState("kg");

  const [isStable, setIsStable] = useState(false);

  const [hasTare, setHasTare] = useState(false);

  const [isOverload, setIsOverload] = useState(false);



  const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";

  const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";



  useEffect(() => {

    let isMounted = true;



    // Bağlantı koptuğunda tetiklenecek dinleyici

    const disconnectListener = bleManagerEmitter.addListener(

      "BleManagerDisconnectPeripheral",

      (data) => {

        console.log("Cihazla bağlantı fiziksel olarak kesildi 🔌");

        if (isMounted) {

          setIsConnected(false);

        }

      }

    );









    if (deviceId) {

      modbusService.setDevice(deviceId, 1); // Slave ID = 1

      handleConnection(deviceId);

    }



    return () => {

      isMounted = false;

      disconnectListener.remove();



      // Tartım ekranındayken geriye dönünce bağlantıyı kes

      if (deviceId) {

        BleManager.disconnect(deviceId)

          .then(() => console.log("Cihaz bağlantısı temizlendi 🧹"))

          .catch((err) => console.log("Temizlik hatası:", err));

      }

    };

  }, [deviceId]);



  // --- GÜVENLİ BAĞLANTI ---

  const handleConnection = async (id) => {

    try {

      // 1. Önce taramayı durdur ve kısa bir süre bekle

      await BleManager.stopScan();

      await new Promise(resolve => setTimeout(resolve, 800)); // Süreyi biraz artırdık



      console.log("Bağlantı kuruluyor: ", id);



      // 2. Bağlanmayı dene

      await BleManager.connect(id);



      // 3. Bağlantı başarılı ise servisleri çek

      await BleManager.retrieveServices(id);



      // NOT: Bildirim BAŞLATILMIYOR - cihaz sürekli veri gönderiyor ve crash oluyor

      // Sadece yazma (ZERO/TARE) komutları kullanılacak





      setIsConnected(true);

      console.log("Bağlantı tamamlandı ✅ (Notification kapalı)");



    } catch (error) {

      console.error("Bağlantı hatası:", error);



      // 5. BAĞLANAMAZSA UYARI VER VE ANA SAYFAYA DÖN

      setIsConnected(false);

      Alert.alert(

        "Bağlantı Başarısız",

        "Cihaza bağlanılamadı. Cihaz meşgul olabilir veya kapsama alanı dışındadır.",

        [

          {

            text: "Tamam",

            onPress: () => router.replace('/') // Index sayfasına geri gönderir

          }

        ]

      );

    }

  };



  // --- KOŞULLU RENDER ---

  // Bağlantı kurulana kadar sadece yükleme ekranı gösterilir

  if (!isConnected) {

    return (

      <View style={styles.container}>

        <ActivityIndicator size="large" color="#2196F3" />

        <Text style={styles.loadingText}>Cihaza Bağlanılıyor...</Text>

        <Text style={styles.footerText}>ID: {deviceId}</Text>

      </View>

    );

  }



  // Bağlantı kurulduğunda asıl ekran gelir

  return (

    <View style={styles.container}>

      <View style={styles.statusContainer}>

        <Text style={[styles.badge, { backgroundColor: isStable ? '#4CAF50' : '#FF9800' }]}>

          {isStable ? "STABİL" : "HAREKETLİ"}

        </Text>

        {hasTare && <Text style={[styles.badge, { backgroundColor: '#2196F3' }]}>NET</Text>}

        {isOverload && <Text style={[styles.badge, { backgroundColor: '#F44336' }]}>AŞIRI YÜK</Text>}

      </View>



      <View style={styles.weightCard}>

        <Text style={styles.weightText}>{weightDisplay}</Text>

        <Text style={styles.unitText}>{unit}</Text>

      </View>



      <View style={styles.controlPanel}>

        <View style={styles.buttonRow}>

          <TouchableOpacity

            style={[styles.actionButton, { backgroundColor: '#FF9800' }]}

            onPress={async () => {

              try {

                await modbusService.zero();

                Alert.alert('Başarılı', 'Sıfırlama komutu gönderildi');

              } catch (error) {

                Alert.alert('Hata', 'Sıfırlama komutu gönderilemedi');

              }

            }}

          >

            <Text style={styles.buttonText}>ZERO</Text>

          </TouchableOpacity>

          <TouchableOpacity

            style={[styles.actionButton, { backgroundColor: '#2196F3' }]}

            onPress={async () => {

              try {

                await modbusService.tare();

                Alert.alert('Başarılı', 'Dara komutu gönderildi');

              } catch (error) {

                Alert.alert('Hata', 'Dara komutu gönderilemedi');

              }

            }}

          >

            <Text style={styles.buttonText}>TARE</Text>

          </TouchableOpacity>

        </View>



        <TouchableOpacity

          style={styles.settingsButton}

          onPress={() => router.push({ pathname: "/settings", params: { deviceId } })}

        >

          <Text style={styles.buttonText}>SETTINGS</Text>

        </TouchableOpacity>



        <TouchableOpacity

          style={[styles.actionButton, { backgroundColor: '#9C27B0' }]}

          onPress={async () => {

            try {

              console.log('📖 Ağırlık okuma komutu gönderiliyor...');

              const result = await modbusService.readRegister(8, 2); // Register 8-9 (Ağırlık)

              console.log('✅ Okuma sonucu:', result);

              Alert.alert('Test', 'Okuma komutu gönderildi. Konsolu kontrol edin.');

            } catch (error) {

              console.error('❌ Okuma hatası:', error);

              Alert.alert('Hata', error.message);

            }

          }}

        >

          <Text style={styles.buttonText}>READ TEST</Text>

        </TouchableOpacity>

      </View>



      <Text style={styles.footerText}>Bağlı Cihaz: {deviceId}</Text>

    </View>

  );

}



const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center' },

  loadingText: { marginTop: 20, fontSize: 16, color: '#333' },

  statusContainer: { flexDirection: 'row', gap: 10, position: 'absolute', top: 60 },

  badge: { color: '#fff', paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12, fontSize: 12, fontWeight: 'bold', overflow: 'hidden' },

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

  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  footerText: { position: 'absolute', bottom: 30, color: '#999', fontSize: 12 }

});

