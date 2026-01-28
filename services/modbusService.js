import { Buffer } from 'buffer';
import {
  buildModbusMessage,
  COMMANDS,
  REGISTERS,
  stringToRegisters
} from './modbusUtils';

class ModbusService {
  constructor() {
    this.slaveId = 1;
    this.serviceUUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
    this.characteristicUUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
    this.deviceId = null;
    this.device = null;
    this.queue = [];
    this.processing = false;
    this.isRebooting = false;
    this.onDataCallback = null; // UI için global dinleyici
    this.readResolver = null;   // Bekleyen okuma işlemi için resolver
    this.subscription = null;
  }

  setDevice(deviceId, device, slaveId = 1) {
    this.deviceId = deviceId;
    this.device = device;
    this.slaveId = slaveId;

    if (device) {
      this.setupMonitor();
    }
  }

  setupMonitor() {
    if (this.subscription) {
      this.subscription.remove();
    }

    this.subscription = this.device.monitorCharacteristicForService(
      this.serviceUUID,
      this.characteristicUUID,
      (error, characteristic) => {
        if (error) {
          console.log("📡 Modbus Monitor Hatası:", error.message);
          return;
        }
        if (characteristic?.value) {
          const data = Buffer.from(characteristic.value, 'base64');
          this.handleIncomingData(Array.from(data));
        }
      },
      `modbus_monitor_${this.deviceId}`
    );
  }

  handleIncomingData(data) {
    // 1. Bekleyen bir readRegister (FC 3) varsa onu çöz
    if (this.readResolver && data[1] === 3) {
      const resolver = this.readResolver;
      this.readResolver = null;

      // Registers'ları ayıkla
      const byteCount = data[2];
      const registers = [];
      for (let i = 0; i < byteCount; i += 2) {
        registers.push((data[3 + i] << 8) | data[4 + i]);
      }
      resolver({ success: true, registers });
    }

    // 2. Global dinleyiciye (Details ekranı gibi) haber ver
    if (this.onDataCallback) {
      this.onDataCallback(data);
    }
  }

  async sendCommand(functionCode, startAddress, quantity = null, values = null, withoutResponse = false) {
    if (this.isRebooting) {
      console.log("⚠️ Reboot işlemi devam ediyor, komut reddedildi.");
      return Promise.reject(new Error("Cihaz yeniden başlatılıyor..."));
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ functionCode, startAddress, quantity, values, withoutResponse, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const { functionCode, startAddress, quantity, values, withoutResponse, resolve, reject } = this.queue.shift();

    try {
      if (!this.device || !this.device.id) {
        throw new Error('Cihaz bağlı değil');
      }

      const request = buildModbusMessage(
        this.slaveId,
        functionCode,
        startAddress,
        quantity,
        values
      );

      const base64Data = Buffer.from(request).toString('base64');

      if (withoutResponse) {
        await this.device.writeCharacteristicWithoutResponseForService(
          this.serviceUUID,
          this.characteristicUUID,
          base64Data
        );
      } else {
        await this.device.writeCharacteristicWithResponseForService(
          this.serviceUUID,
          this.characteristicUUID,
          base64Data
        );
      }

      // Eğer bu bir OKUMA (FC 3) ise, response gelene kadar bekle (max 1sn)
      if (functionCode === 3) {
        const result = await new Promise((res) => {
          this.readResolver = res;
          setTimeout(() => {
            if (this.readResolver === res) {
              this.readResolver = null;
              res({ success: false, error: 'Timeout' });
            }
          }, 1000);
        });
        resolve(result);
      } else {
        // UI'ın nefes alması için çok kısa bir bekleme
        await new Promise(r => setTimeout(r, 50));
        resolve({ success: true, address: startAddress });
      }
    } catch (error) {
      if (this.isRebooting || error.message?.includes("disconnected") || error.message?.includes("not connected")) {
        console.log("📡 Beklenen BLE hatası (Reboot/Bağlantı Kesik):", error.message);
        resolve({ success: false, error: error.message });
      } else {
        console.error('❌ Modbus Hatası:', error.message);
        reject(error);
      }
    } finally {
      this.processing = false;
      this.processQueue();
    }
  }

  async safeTeardown(isManual = true) {
    console.log(`🧹 Merkezi güvenli kapatma başlatıldı... (isManual: ${isManual})`);
    const wasRebooting = this.isRebooting;

    this.queue = [];
    this.processing = false;
    this.onDataCallback = null;
    this.readResolver = null;

    // DİKKAT: Android'de subscription.remove() bazen kütüphane içi (BlePlx) 
    // NullPointerException fırlatabiliyor. Bu yüzden burada sadece null'a çekiyoruz.
    // Bağlantı kesildiğinde (cancelConnection) zaten monitor aboneliği sonlanacaktır.
    if (this.subscription) {
      // this.subscription.remove(); // KRİTİK: Çökmeyi önlemek için devre dışı
      this.subscription = null;
    }

    if (this.device) {
      const dev = this.device;
      this.device = null;

      if (wasRebooting || !isManual) {
        console.log("⏭️ Fiziksel bağlantı kesme işlemi pasif olarak atlanıyor.");
        this.isRebooting = false;
        return;
      }

      try {
        await dev.cancelConnection();
        console.log("✓ Cihaz bağlantısı merkezden kesildi.");
      } catch (e) { }
    }

    this.isRebooting = false;
  }



  //tekli okuma - tekli yazma - birden fazla yazma
  async readRegister(address, count = 1) {
    return this.sendCommand(3, address, count);
  }

  async writeRegister(address, value) {
    return this.sendCommand(6, address, null, [value]);
  }

  async writeRegisters(address, values) {
    return this.sendCommand(16, address, null, values);
  }




  // --- DEVICE INFO ---
  async readSerialNumber() {
    return this.readRegister(128, 2);
  }

  async readFirmwareVersion() {
    return this.readRegister(130, 1);
  }

  // --- CALIBRATION ---
  async calibrationZero() {
    // Manuel: 106 adresine "2" değeri yazılır
    return this.writeRegister(106, 2);
  }

  async calibrationLoad(weight) {
    // Manuel: 99 adresine ağırlık değerinin 1000 katı yazılır
    const w = Math.round(weight * 1000);
    const high = (w >> 16) & 0xFFFF;
    const low = w & 0xFFFF;
    await this.writeRegisters(99, [high, low]);
    // Manuel: 106 adresine "3" değeri yazılır
    return this.writeRegister(106, 3);
  }

  async calibrationDigital(maxCapacity, value, mvvValue) {
    // 1. Kapasite (R113 - 32 Bit)
    const cap = Math.round(parseFloat(maxCapacity) * 1000);
    const capHigh = (cap >> 16) & 0xFFFF;
    const capLow = cap & 0xFFFF;
    await this.writeRegisters(113, [capHigh, capLow]);

    // 2. Ağırlık/Dara Değeri (R99 - 32 Bit)
    const val = Math.round(parseFloat(value) * 1000);
    const valHigh = (val >> 16) & 0xFFFF;
    const valLow = val & 0xFFFF;
    await this.writeRegisters(99, [valHigh, valLow]);

    // 3. mV/V Değeri (R103 - 32 Bit)
    const mvvInt = Math.round(parseFloat(mvvValue) * 100000);
    const mvvHigh = (mvvInt >> 16) & 0xFFFF;
    const mvvLow = mvvInt & 0xFFFF;
    await this.writeRegisters(103, [mvvHigh, mvvLow]);

    // 4. Komut (R106 = 4)
    return this.writeRegister(106, 4);
  }

  // --- STATUS & COMMANDS ---
  async readStatus() {
    await this.readRegister(7, 1);
    return { success: true, messages: ["Durum okundu"], canTare: true, hasTare: false };
  }

  async zero() {
    return this.writeRegister(REGISTERS.COMMAND, COMMANDS.ZERO);
  }

  async tare() {
    return this.writeRegister(REGISTERS.COMMAND, COMMANDS.TARE);
  }

  async restart() {
    const result = await this.sendCommand(6, REGISTERS.COMMAND, null, [COMMANDS.RESTART], true);
    this.isRebooting = true;
    return result;
  }

  async writeWiFiSSID(ssid) {
    const registers = stringToRegisters(ssid, 12);
    return this.writeRegisters(50, registers);
  }

  async writeWiFiPassword(password) {
    const registers = stringToRegisters(password, 12);
    return this.writeRegisters(62, registers);
  }

  async factoryReset() {
    const result = await this.sendCommand(6, REGISTERS.COMMAND, null, [COMMANDS.FACTORY_RESET], true);
    this.isRebooting = true;
    return result;
  }
}

export default new ModbusService();
