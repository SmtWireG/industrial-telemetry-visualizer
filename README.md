# 📊 Industrial Telemetry Visualizer

Endüstriyel cihazlardan gerçek zamanlı telemetri verilerini toplayan, işleyen ve görselleştiren React Native mobil uygulaması.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-brightgreen.svg)
![Language](https://img.shields.io/badge/language-JavaScript-yellow.svg)
![Framework](https://img.shields.io/badge/framework-Expo%20%7C%20React%20Native-blue.svg)

## 🎯 Proje Özeti

**Industrial Telemetry Visualizer**, endüstriyel ölçüm cihazlarıyla (esp32 tabanlı cihazlar, elektronik terazi vb.) mobil cihazlar arasında **BLE** (Bluetooth Low Energy) ve **TCP/WiFi** protokolleri üzerinden bağlantı sağlayarak:

- ✅ Ağırlık, durum bilgisi ve kalibrasyona bağlı verileri gerçek zamanlı olarak görüntüler
- ✅ Tare (sıfırlama), zero (boş kütleyi belirleme) ve kalibrasyonu yapılandırır
- ✅ Cihaz durumunu (kararlı, aşırı yük, tare modu) takip eder
- ✅ BLE'den TCP/WiFi'ye sorunsuz geçiş sağlar
- ✅ Reconnection ve error handling mekanizmaları ile güvenilir bağlantı yönetimi yapar

## 🚀 Başlıca Özellikler

| Özellik | Açıklama |
|---------|----------|
| 🔌 **Dual Transport** | BLE ve TCP/WiFi protokolleri desteklenir |
| 📡 **Modbus Protocol** | Endüstriyel standart Modbus RTU/TCP iletişimi |
| 📊 **Real-time Monitoring** | Anlık veri takibi ve görselleştirmesi |
| ⚙️ **Configuration** | Cihaz ayarları (birim, hassasiyet, kalibrasyonu) yapılandırılabilir |
| 🔄 **Auto Reconnection** | Bağlantı kopması durumunda otomatik yeniden bağlanma |
| 📱 **Cross-platform** | iOS ve Android cihazlarda çalışır |
| 🎨 **Modern UI** | Kullanıcı dostu ve responsive arayüz |

## 📋 Sistem Gereksinimleri

- **Node.js**: 16+ LTS
- **npm**: 8+
- **Expo CLI**: Global kurulum
- **React Native**: 0.71+
- **Android SDK**: API 21+ (Android 5.0+)
- **Xcode**: 13+ (iOS için, macOS gereklidir)

## 🛠️ Kurulum

### 1. Repository'yi Klonlayın
```bash
git clone https://github.com/SmtWireG/industrial-telemetry-visualizer.git
cd industrial-telemetry-visualizer
```

### 2. Bağımlılıkları Yükleyin
```bash
npm install
```

### 3. Ortam Değişkenlerini Ayarlayın (İsteğe Bağlı)
```bash
# .env dosyası oluşturun (örnek)
DEVICE_DEFAULT_IP=192.168.137.182
DEVICE_DEFAULT_PORT=502
```

### 4. Uygulamayı Başlatın

#### Geliştirim Ortamında:
```bash
npx expo start
```

Çıktıdan birini seçin:
- **Android Emulator**: `a` tuşu
- **iOS Simulator**: `i` tuşu
- **Expo Go**: QR kodu tarayıcı ile

#### APK Oluşturma (Production):
```bash
eas build --platform android --profile preview
```

#### iOS IPA Oluşturma:
```bash
eas build --platform ios --profile preview
```

## 📱 Kullanım

### 1. Uygulama Başlangıcı
- Uygulamayı açtığınızda cihaza bağlanmaya çalışır
- BLE cihazları bulunursa otomatik olarak listelenecek

### 2. Bağlantı Kurma

#### BLE Bağlantısı:
```
1. Cihaz listesinden ölçme cihazını seçin
2. "Bağlan" butonuna tıklayın
3. Bluetooth izni vermeniz istenecek
4. Bağlantı kurulunca anasayfa açılacak
```

#### WiFi/TCP Bağlantısı:
```
1. BLE cihazından WiFi'ye geçişi başlat
2. "WiFi Bağlantısı Bekleniyor..." ekranında IP girin
3. Port numarasını ayarlayın (varsayılan: 502)
4. "Bağlan" butonuna tıklayın
```

### 3. Ölçüm Ekranı

| Düğme | İşlev |
|-------|-------|
| **ZERO** | Cihazı kalibre et (0 referansını ayarla) |
| **TARE** | Net ölçüm başlat (konteyner ağırlığını yoksay) |
| **DARA İPTAL** | TARE modundan çık |
| **SETTINGS** | Cihaz ayarlarını yapılandır |

### 4. Durum Göstergeleri

- 🟢 **STABİL**: Ölçüm kararlı, güvenilir
- 🟠 **HAREKETLİ**: Cihaz hareket etme halinde
- 🔵 **NET**: Tare modu aktif (net ölçüm modu)
- 🟣 **WiFi**: TCP bağlantısı aktif
- ⚫ **BLE**: Bluetooth bağlantısı aktif

## 🏗️ Proje Yapısı

```
industrial-telemetry-visualizer/
├── app/
│   ├── index.js              # Ana ekran (cihaz seçimi)
│   ├── details.js            # Ölçüm ekranı (ağırlık, kontroller)
│   ├── settings.js           # Ayarlar ekranı
│   ├── admin.js              # Admin paneli
│   └── _layout.js            # Routing yapısı
├── services/
│   ├── bleService.js         # BLE bağlantı ve yönetimi
│   ├── modbusService.js      # Modbus protokolü ve TCP bağlantısı
│   └── modbusUtils.js        # Modbus yardımcı fonksiyonları
├── constants/
│   └── mock-data.js          # Mock cihaz ve şirket verileri
├── app.json                  # Expo yapılandırması
├── package.json              # Bağımlılıklar
└── README.md                 # Bu dosya
```

## 🔧 Mimarim ve Teknolojiler

### Kullanılan Teknolojiler:
- **Expo**: React Native framework
- **React Native**: UI bileşenleri
- **Modbus RTU/TCP**: Endüstriyel iletişim protokolü
- **BLE (Bluetooth Low Energy)**: Kablosuz bağlantı
- **React Navigation**: Sayfa yönetimi

### Servisler:

#### `bleService.js`
Bluetooth cihazlarını tarar, bağlanır ve koptuğunda yönetir.

```javascript
import bleService from './services/bleService';

const manager = bleService.getManager();
const devices = await manager.requestPermissions();
```

#### `modbusService.js`
Modbus protokolü ile cihazlarla iletişim kurar. BLE ve TCP arka planında şeffaf şekilde geçiş yapabilir.

```javascript
import modbusService from './services/modbusService';

// TCP bağlantısı
await modbusService.connectTCP('192.168.1.100', 502);

// Veri oku (Fonksiyon kodu 3)
const result = await modbusService.sendCommand(3, 118, 2);

// Tare işlemi
await modbusService.tare();
```

#### `modbusUtils.js`
Modbus veri analizi, durum bitleri ve yardımcı fonksiyonları içerir.

```javascript
import { checkStatus, getStatusMessage, STATUS_BITS } from './services/modbusUtils';

const isStable = checkStatus(status, STATUS_BITS.STABILITY);
const messages = getStatusMessage(status);
```

## 🧪 Test Etme

### Mock Veri Kullanarak Test
```javascript
// constants/mock-data.js dosyasından mock cihazlar yüklenir
import { MOCK_DEVICES } from '../constants/mock-data';

const testDevice = MOCK_DEVICES[0];
console.log(testDevice.name, testDevice.weight);
```

### Debuglama
```bash
# Expo DevTools'u açın
npx expo start

# Terminalden 'd' tuşu ile Debugger'ı açın
```

## ⚙️ Yapılandırma

### Bağlantı Ayarları
`app/details.js` dosyasında varsayılan değerleri düzenleyin:

```javascript
const [ipAddress, setIpAddress] = useState(ip || "192.168.137.182");
const [port, setPort] = useState(routePort || "502");
```

### Modbus İşlemleri
`services/modbusService.js` dosyasından Modbus konfigürasyonunu ayarlayın:

```javascript
const POLLING_INTERVAL_BLE = 150;  // ms
const POLLING_INTERVAL_TCP = 300;  // ms
const RECONNECT_TIMEOUT = 3000;    // ms
```

## 🐛 Sorun Giderme

### Problem: "Ağ Uyumsuzluğu" Uyarısı
**Çözüm**: Telefonunuzun aynı WiFi alt ağında olmasını sağlayın
```
1. Telefonun WiFi ayarları → Bilgisayarın Hotspot'una bağlanın
2. Mobil Veri (4G/5G) kapatın
3. ESP32 cihazının IP'si phone subnet'i ile eşleştiğinden emin olun
```

### Problem: BLE Bağlantısı Kurulmuyor
**Çözüm**:
```
1. Telefon Bluetooth'u açık mı? ✓
2. Cihaz öğütülüyor mu? ✓
3. App izinleri: Ayarlar → App → İzinler → Bluetooth ✓
```

### Problem: TCP Bağlantısı Başarısız
**Çözüm**:
```
1. Cihazın IP adresi doğru mu?
2. Port 502 kullanılabiliyor mu?
3. Firewall engel koymuyor mu?
4. ping komutu ile bağlantı test edin:
   ping <cihaz-ip>
```

### Problem: Veri Alınamıyor
**Çözüm**:
```
1. Polling aralığını kontrol edin (BLE: 150ms, TCP: 300ms)
2. Modbus register adreslerini doğrulayın
3. Console loglarını kontrol edin: App içinde Debugger açın
```

## 📦 Bağımlılıklar

```json
{
  "dependencies": {
    "expo": "^50.0.0",
    "react-native": "^0.73.0",
    "expo-router": "^2.4.0",
    "react-native-ble-plx": "^3.0.0",
    "expo-constants": "^15.0.0"
  }
}
```

## 🔐 Güvenlik

- BLE: Pairing gerektirmek için konfigürasyonu ayarlayabilirsiniz
- TCP: Şifreli iletişim için mTLS desteği planlanmaktadır
- Hassas veriler: `expo-secure-store` ile saklanabilir

## 📝 Mock Veri

Geliştirme sırasında gerçek cihazlar olmadan test etmek için mock veri kullanılır.

**`constants/mock-data.js`:**
```javascript
export const MOCK_DEVICES = [
  {
    id: 'mock-scale-001',
    name: 'Örnek Terazi #1',
    weight: 45.32,
    unit: 'kg',
    isStable: true,
    manufacturer: 'Mock Industries Inc.'
  },
  // ...
];

export const MOCK_COMPANY_INFO = {
  name: 'Industrial Telemetry Inc.',
  website: 'https://telemetry.example.com',
  support: 'support@example.com'
};
```

## 🌐 API İntegrasyonu (Gelecek)

```
[ ] CloudSync: Verileri buluta kaydet
[ ] Analytics: Kullanım istatistikleri
[ ] Alerts: Eşik değer uyarıları
[ ] Multi-device: Birden fazla cihaz senkronizasyonu
```

## 📄 Lisans

Bu proje MIT Lisansı altında yayınlanmıştır. Daha fazla bilgi için [LICENSE](LICENSE) dosyasına bakın.

## 🤝 Katkı

Katkılarınız hoşgeldiniz! Lütfen:

1. Repository'yi fork edin
2. Özellik branch'i oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişiklikleri commit edin (`git commit -m 'Add amazing feature'`)
4. Branch'e push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📞 İletişim & Destek

- **Issues**: [GitHub Issues](https://github.com/SmtWireG/industrial-telemetry-visualizer/issues)
- **Email**: support@example.com
- **Website**: https://telemetry.example.com

## ✨ Teşekkürler

- Expo team for amazing framework
- React Native community
- Modbus protocol documentation

---

**Son Güncelleme**: 2026-06-09  
**Versiyon**: 1.0.0
