import BleManager from 'react-native-ble-manager';

import {
    buildModbusMessage,

    COMMANDS,

    REGISTERS,

    splitInt32
} from './modbusUtils';



class ModbusService {

  constructor() {

    this.slaveId = 1; // Varsayılan slave ID

    this.serviceUUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";

    this.characteristicUUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

    this.deviceId = null;

    this.responseTimeout = 5000; // 5 saniye

  }



  setDevice(deviceId, slaveId = 1) {

    this.deviceId = deviceId;

    this.slaveId = slaveId;

  }



  // Modbus Komutu Gönder ve Yanıt Al

  async sendCommand(functionCode, startAddress, quantity = null, values = null) {

    if (!this.deviceId) {

      throw new Error('Cihaz seçilmedi');

    }



    try {

      const request = buildModbusMessage(

        this.slaveId,

        functionCode,

        startAddress,

        quantity,

        values

      );



      // Request'i array'e çevir (BLE yazma için)

      const requestArray = Array.from(request);



      console.log(`📤 Modbus Gönderiliyor (Adres: ${startAddress}):`, requestArray);



      // BLE cihazına yaz

      await BleManager.write(

        this.deviceId,

        this.serviceUUID,

        this.characteristicUUID,

        requestArray

      );



      console.log(`✓ Komut gönderildi (Adres: ${startAddress})`);



      // NOT: Yanıt notification ile gelecek, burada okumaya gerek yok

      // Aksi halde sonsuz notification döngüsüne girebiliriz

     

      // Basit yanıt objesi döndür

      return { success: true, address: startAddress };

     

    } catch (error) {

      console.error('❌ Modbus Hatası:', error.message);

      throw error;

    }

  }



  // Register Oku (Tek Seferlik Notification ile)

  async readRegister(address, count = 1) {

    console.log(`📖 Okuma başlıyor (Adres: ${address}, Adet: ${count})`);

   

    try {

      // 1. Notification'ı geçici olarak aç

      await BleManager.startNotification(

        this.deviceId,

        this.serviceUUID,

        this.characteristicUUID

      );

      console.log('✓ Notification geçici olarak açıldı');

     

      // 2. Okuma komutunu gönder

      await this.sendCommand(3, address, count);

     

      // 3. Yanıtın gelmesi için bekle (500ms)

      console.log('⏳ Yanıt bekleniyor...');

      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log(resolve)

     

      // 4. Notification'ı hemen kapat

      await BleManager.stopNotification(

        this.deviceId,

        this.serviceUUID,

        this.characteristicUUID

      );

      console.log('✓ Notification kapatıldı');

     

      // NOT: Gerçek veri notification handler'da parse edilmeli

      // Şimdilik sadece komutun gönderildiğini belirtelim

      return { success: true, address: address };

     

    } catch (error) {

      console.error('❌ Okuma hatası:', error);

      // Hata durumunda notification'ı kapatmayı dene

      try {

        await BleManager.stopNotification(

          this.deviceId,

          this.serviceUUID,

          this.characteristicUUID

        );

      } catch (e) {

        console.log('Notification zaten kapalıydı');

      }

      throw error;

    }

  }



  // Register Yaz (Tek)

  async writeRegister(address, value) {

    return this.sendCommand(6, address, null, [value]);

  }



  // Register Yaz (Çoklu)

  async writeRegisters(address, values) {

    return this.sendCommand(16, address, null, values);

  }



  // --- KOMUT FONKSİYONLARI ---



  // Sıfırlama Komutu

  async zero() {

    console.log('🔄 Sıfırlama komutu gönderiliyor...');

    return this.writeRegister(REGISTERS.COMMAND, COMMANDS.ZERO);

  }



  // Dara Komutu (Tare)

  async tare() {

    console.log('⚙️ Dara komutu gönderiliyor...');

    return this.writeRegister(REGISTERS.COMMAND, COMMANDS.TARE);

  }



  // Yeniden Başlat

  async restart() {

    console.log('🔁 Cihaz yeniden başlatılıyor...');

    return this.writeRegister(REGISTERS.COMMAND, COMMANDS.RESTART);

  }



  // Fabrika Ayarlarına Dön

  async factoryReset() {

    console.log('⚠️ Fabrika ayarlarına dönüyor...');

    return this.writeRegister(REGISTERS.COMMAND, COMMANDS.FACTORY_RESET);

  }



  // --- KALIBRASYON FONKSİYONLARI ---



  // Sıfır Kalibrasyonu

  async calibrationZero() {

    console.log('🎯 Sıfır kalibrasyonu başlanıyor (yüksüz)...');

    // Adım 1: Kalibrasyon komutu gönder

    const response = await this.writeRegister(REGISTERS.CALIBRATION_CMD, 2);

    console.log('✓ Sıfır kalibrasyonu başladı, lütfen ~10 saniye bekleyiniz');

    return response;

  }



  // Yük Kalibrasyonu

  async calibrationLoad(weight) {

    console.log(`🎯 Yük kalibrasyonu başlanıyor (${weight}kg)...`);

    try {

      // Adım 1: Kalibrasyon ağırlığını yaz (x1000)

      const calibValue = Math.round(weight * 1000);

      await this.writeRegister(REGISTERS.CALIBRATION_VALUE, calibValue);

     

      // Adım 2: Kalibrasyon komutunu gönder (3 = Yük)

      const response = await this.writeRegister(REGISTERS.CALIBRATION_CMD, 3);

      console.log('✓ Yük kalibrasyonu başladı, lütfen ~10 saniye bekleyiniz');

      return response;

    } catch (error) {

      console.error('❌ Yük kalibrasyonu başarısız:', error);

      throw error;

    }

  }



  // Dijital Kalibrasyon

  async calibrationDigital(maxCapacity, mvPerVolt) {

    console.log('🎯 Dijital kalibrasyon başlanıyor...');

    try {

      // Adım 1: Maksimum kapasite (x1000)

      const capValue = Math.round(maxCapacity * 1000);

      const [capHigh, capLow] = splitInt32(capValue);

      await this.writeRegisters(REGISTERS.MAX_CAPACITY, [capHigh, capLow]);



      // Adım 2: mV/V değeri (x100000)

      const mvValue = Math.round(mvPerVolt * 100000);

      const [mvHigh, mvLow] = splitInt32(mvValue);

      await this.writeRegisters(REGISTERS.DIGITAL_CALIB_MV_V, [mvHigh, mvLow]);



      // Adım 3: Kalibrasyon komutunu gönder (4 = Dijital Dara, 5 = Dijital Ağırlık)

      const response = await this.writeRegister(REGISTERS.CALIBRATION_CMD, 4);

      console.log('✓ Dijital kalibrasyon başladı, lütfen ~10 saniye bekleyiniz');

      return response;

    } catch (error) {

      console.error('❌ Dijital kalibrasyon başarısız:', error);

      throw error;

    }

  }



  // --- DURUMU OKUMA FONKSİYONLARI ---



  // Durum Bilgisi Oku

  async readStatus() {

    try {

      console.log('⚠️ Durum okuma: Komut gönderildi, yanıt notification ile gelecek');

      await this.readRegister(REGISTERS.STATUS);

     

      // Geçici: Notification handler'da parse edilmeli

      // Şimdilik basit bir yanıt dönelim

      return {

        value: 0,

        messages: ['Komut gönderildi, cihazdan yanıt bekleniyor'],

        isOverweight: false,

        isStable: true,

        canZero: true,

        canTare: true,

        hasTare: false,

        relay1On: false,

        relay2On: false

      };

    } catch (error) {

      console.error('❌ Durum okunamadı:', error);

      throw error;

    }

  }



  // Tüm Ağırlık Değerlerini Oku

  async readWeightValues() {

    try {

      console.log('⚠️ Ağırlık okuma: Komut gönderildi');

      await this.readRegister(REGISTERS.DISPLAY_VALUE, 6);

      return {

        displayValue: 0,

        tareValue: 0,

        grossValue: 0,

        unit: 'kg'

      };

    } catch (error) {

      console.error('❌ Ağırlık değerleri okunamadı:', error);

      throw error;

    }

  }



  // Ekran Değerini Oku

  async readDisplayValue() {

    try {

      console.log('⚠️ Ekran değeri okuma: Komut gönderildi');

      await this.readRegister(REGISTERS.DISPLAY_VALUE);

      return 0;

    } catch (error) {

      console.error('❌ Ekran değeri okunamadı:', error);

      throw error;

    }

  }



  // --- YAPILANDIRMA FONKSİYONLARI ---



  // İletişim Modunu Ayarla

  async setCommMode(mode) {

    // 0: Kapalı, 1: Sürekli, 2: Modbus

    console.log(`📡 İletişim modu ayarlanıyor: ${mode}`);

    return this.writeRegister(REGISTERS.COMM_MODE, mode);

  }



  // İletişim ID'si Ayarla

  async setCommId(id) {

    console.log(`📡 İletişim ID ayarlanıyor: ${id}`);

    return this.writeRegister(REGISTERS.COMM_ID, id);

  }



  // Baud Rate Ayarla

  async setBaudrate(baudRateCode) {

    // 0:1200, 1:2400, 2:4800, 3:9600, 4:19200, 5:38400, 6:57600, 7:115200

    console.log(`📡 Baud rate ayarlanıyor: ${baudRateCode}`);

    return this.writeRegister(REGISTERS.BAUDRATE, baudRateCode);

  }



  // Birim Ayarla

  async setUnit(unitCode) {

    // 0: kg, 1: g, 2: lb, 3: mV/V, 4: mV

    console.log(`⚙️ Birim ayarlanıyor: ${unitCode}`);

    return this.writeRegister(REGISTERS.UNIT, unitCode);

  }



  // Filtre Türü Ayarla

  async setFilterType(filterType) {

    // 0: Kapalı, 1: Özel, 2: Hareketli Ortalama

    console.log(`🔧 Filtre türü ayarlanıyor: ${filterType}`);

    return this.writeRegister(REGISTERS.FILTER_TYPE, filterType);

  }



  // ADC Hz Ayarla

  async setAdcHz(hz) {

    // 0:6Hz, 1:12Hz, 2:25Hz, 3:50Hz, 4:100Hz, 5:200Hz, 6:400Hz

    console.log(`📊 ADC Hz ayarlanıyor: ${hz}`);

    return this.writeRegister(REGISTERS.ADC_HZ, hz);

  }



  // Dil Ayarla

  async setLanguage(language) {

    // 0: İngilizce, 1: Türkçe

    console.log(`🌐 Dil ayarlanıyor: ${language}`);

    return this.writeRegister(REGISTERS.LANGUAGE, language);

  }



  // Röle Ayarları

  async setRelayControl(relayNum, controlType) {

    // relayNum: 1 veya 2

    // controlType: 0 (Modbus) veya 1 (TR-4 Parametreleri)

    const address = relayNum === 1 ? REGISTERS.RELAY1_CONTROL : 82;

    console.log(`🔌 Röle ${relayNum} kontrol tipi ayarlanıyor: ${controlType}`);

    return this.writeRegister(address, controlType);

  }



  async setRelayValue(relayNum, setPoint) {

    // setPoint: x1000

    const address = relayNum === 1 ? REGISTERS.RELAY1_SET : 83;

    const value = Math.round(setPoint * 1000);

    const [high, low] = splitInt32(value);

    console.log(`🔌 Röle ${relayNum} set değeri ayarlanıyor: ${setPoint}kg`);

    return this.writeRegisters(address, [high, low]);

  }



  // ADC Ham Değeri Oku

  async readRawADC() {

    try {

      console.log('⚠️ ADC okuma: Komut gönderildi');

      await this.readRegister(REGISTERS.ADC_RAW);

      return 0;

    } catch (error) {

      console.error('❌ ADC değeri okunamadı:', error);

      throw error;

    }

  }



  // Seri Numarası Oku

  async readSerialNumber() {

    try {

      console.log('⚠️ Seri numarası okuma: Komut gönderildi');

      await this.readRegister(REGISTERS.SERIAL_NUMBER);

      return 'N/A';

    } catch (error) {

      console.error('❌ Seri numarası okunamadı:', error);

      throw error;

    }

  }



  // Yazılım Sürümü Oku

  async readFirmwareVersion() {

    try {

      console.log('⚠️ Firmware okuma: Komut gönderildi');

      await this.readRegister(REGISTERS.FIRMWARE_VERSION);

      return 100; // Varsayılan v1.00

    } catch (error) {

      console.error('❌ Yazılım sürümü okunamadı:', error);

      throw error;

    }

  }

}



export default new ModbusService();

