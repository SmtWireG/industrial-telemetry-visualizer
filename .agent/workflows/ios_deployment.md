---
description: Windows üzerinden iOS Deployment (Test ve App Store)
---

# 🍎 Windows Üzerinden iOS Uygulama Yükleme Rehberi

Windows bilgisayar kullandığınız için **Mac (Xcode)** gerektirmeden iOS uygulaması derlemek için **Expo Application Services (EAS)** kullanacağız.

## 📋 Ön Hazırlık
1.  **Apple Developer Hesabı:** ($99/yıl) Apple Developer hesabınızın aktif olması şarttır.
2.  **Expo Hesabı:** expo.dev üzerinde bir hesap açın.

## 🛠️ Adım 1: EAS CLI Kurulumu
EAS (Expo Application Services) aracını bilgisayarınıza kurun:
```powershell
npm install -g eas-cli
```
Kurulum bitince giriş yapın:
```powershell
eas login
```

## ⚙️ Adım 2: Projeyi Yapılandırma
Proje dizininde şu komutu çalıştırarak yapılandırmayı başlatın:
```powershell
eas build:configure
```
*   Size `Select platform` diye soracak -> `All` veya `iOS` seçin.
*   Bu işlem sonucunda `eas.json` dosyası oluşacaktır.

## 📱 Adım 3: Test Cihazına Yükleme (Development Build)
Uygulamayı kendi iPhone'unuzda test etmek için "Development Profile" oluşturmalıyız.

1.  Komutu çalıştırın:
    ```powershell
    eas build --profile development --platform ios
    ```
2.  **Apple ID Girişi:** Terminal sizden Apple ID ve şifrenizi isteyecek. Giriş yapın.
3.  **Cihaz Ekleme:** Terminal size bir **QR Kod** veya **Link** verecek. 
    *   Bu linki test yapacağınız iPhone'da açın.
    *   Bir profil yüklemenizi isteyecek, yükleyin.
    *   Bu işlem cihazınızın UDID numarasını Expo'ya ve Apple Developer hesabınıza kaydeder.
4.  Cihaz kaydından sonra terminaldeki işlem devam eder ve **Build** başlar.
5.  **Build Bittiğinde:**
    *   Size bir QR kod verecek. iPhone kamerasını açıp okutun.
    *   "Install" diyerek uygulamayı telefonunuza indirin.
    *   **Not:** Bu versiyon "Expo Go" gibidir ama içinde sizin native kütüphaneleriniz (BLE, TCP) gömülüdür.
    *   Uygulamayı açın -> Terminalden `npx expo start` -> QR kodu okutun -> Uygulama çalışır.

## 🚀 Adım 4: App Store'a Yükleme (Production Build)
Testler bitti, markete yüklemek istiyorsunuz:

1.  Build alın:
    ```powershell
    eas build --profile production --platform ios
    ```
2.  Bu işlem bittiğinde `.ipa` dosyası oluşmaz, dosya Expo sunucularında tutulur.
3.  Store'a gönderin:
    ```powershell
    eas submit -p ios
    ```
    *   Bu komut, oluşturulan son production build'i otomatik seçer ve App Store Connect'e (TestFlight) yükler.

## ⚠️ Önemli Uyarılar
*   **İzinler:** `app.json` dosyasına Bluetooth ve Yerel Ağ (TCP/WiFi) izinlerini ekledim. Apple bu konuda çok hassastır.
*   **Süre:** EAS Build işlemi sunucularda yapıldığı için yoğunluğa göre 15-40 dakika sürebilir (Free Tier kullanıyorsanız sıra bekleyebilirsiniz).
