import { Buffer } from 'buffer';
import TcpSocket from 'react-native-tcp-socket';
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

    // --- TCP (WiFi) Transport ---
    this.tcpClient = null;
    this.transport = 'BLE'; // 'BLE' veya 'TCP'
    this.ip = null;
    this.port = 23; // ESP32 TR4 için varsayılan port 23 (RTU over TCP)

    this.queue = [];
    this.processing = false;
    this.isRebooting = false;
    this.isTransitioningToWiFi = false; // BLE'den WiFi'ye geçiş takibi
    this.onDataCallback = null; // UI için global dinleyici
    this.readResolver = null;   // Bekleyen okuma işlemi için resolver
    this.subscription = null;
  }

  setDevice(deviceId, device, slaveId = 1) {
    this.deviceId = deviceId;
    this.device = device;
    this.slaveId = slaveId;
    this.transport = 'BLE';

    if (device) {
      this.setupMonitor();
    }
  }

  async connectTCP(ip, port = 502, retryCount = 5) {
    const cleanIp = ip.trim();
    const cleanPort = (typeof port === 'number' && !isNaN(port)) ? port : 502;

    for (let i = 1; i <= retryCount; i++) {
      try {
        console.log(`[MODBUS_SERVICE] TCP Bağlantı denemesi ${i}/${retryCount} -> ${cleanIp}:${cleanPort}`);
        const result = await this._doConnect(cleanIp, cleanPort);
        return result;
      } catch (error) {
        console.warn(`[MODBUS_SERVICE] ⚠️ Deneme ${i} başarısız: ${error.message}`);

        if (i === retryCount) {
          if (this.transport === 'TCP') {
            this.transport = 'BLE';
          }
          throw error;
        }

        // WiFi geçişi sırasında denemelere devam et
        this.transport = 'TCP';
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  _doConnect(ip, port) {
    return new Promise((resolve, reject) => {
      try {
        if (this.tcpClient) {
          this.tcpClient.destroy();
          this.tcpClient = null;
        }

        this.ip = ip;
        this.port = port;
        this.transport = 'TCP';

        let isResolved = false;

        this.tcpClient = TcpSocket.createConnection({ host: ip, port: port }, () => {
          console.log('[MODBUS_SERVICE] ✅ TCP Bağlantısı BAŞARILI');
          isResolved = true;
          resolve({ success: true });
        });

        this.tcpClient.on('data', (data) => {
          this.handleIncomingData(Array.from(data));
        });

        this.tcpClient.on('error', (error) => {
          if (!isResolved) {
            isResolved = true;
            const errorMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error)) || 'Bilinmeyen TCP Hatası';
            reject(new Error(errorMsg));
          }
        });

        this.tcpClient.on('close', () => {
          console.log('🔌 TCP Bağlantısı kapandı');
        });

        // Zaman aşımı (her bir deneme için 4sn)
        setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            if (this.tcpClient) this.tcpClient.destroy();
            reject(new Error("Zaman aşımı"));
          }
        }, 4000);

      } catch (err) {
        reject(err);
      }
    });
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
    // Not: TCP'de bazen paketler birleşebilir veya bölünebilir, 
    // ancak basit kullanımda data[1] kontrolü genellikle yeterlidir.
    if (this.readResolver && (data[1] === 3 || (this.transport === 'TCP' && data[7] === 3))) {
      const resolver = this.readResolver;
      this.readResolver = null;

      let registers = [];
      if (this.transport === 'BLE') {
        const byteCount = data[2];
        for (let i = 0; i < byteCount; i += 2) {
          registers.push((data[3 + i] << 8) | data[4 + i]);
        }
      } else {
        // Modbus TCP MBAP Header (7 byte) + PDU
        // MBAP: Transaction ID (2), Protocol ID (2), Length (2), Unit ID (1)
        // PDU: Function Code (1), Byte Count (1), Data...
        const byteCount = data[8];
        for (let i = 0; i < byteCount; i += 2) {
          registers.push((data[9 + i] << 8) | data[10 + i]);
        }
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
      if (this.transport === 'BLE') {
        if (!this.device || !this.device.id) {
          throw new Error('Cihaz bağlı değil (BLE)');
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
      } else {
        // TCP Transport
        if (!this.tcpClient) {
          throw new Error('TCP Bağlantısı mevcut değil');
        }

        // Modbus TCP için MBAP header eklemek gerekecektir.
        // Şimdilik RTU Over TCP mi yoksa Saf Modbus TCP mi olduğunu varsayalım.
        // Genelde WiFi modülleri port 502'de Modbus TCP bekler.

        let request;
        if (this.port === 502) {
          // Modbus TCP (MBAP + PDU, CRC yok)
          const pdu = this.buildPDU(functionCode, startAddress, quantity, values);
          request = Buffer.alloc(7 + pdu.length);
          request.writeUInt16BE(Math.floor(Math.random() * 65535), 0); // Transaction ID
          request.writeUInt16BE(0, 2); // Protocol ID (0 = Modbus)
          request.writeUInt16BE(pdu.length + 1, 4); // Length (Unit ID + PDU)
          request.writeUInt8(this.slaveId, 6); // Unit ID (Slave ID)
          pdu.copy(request, 7);
        } else {
          // RTU Over TCP (Aynı paket, CRC dahil)
          request = buildModbusMessage(this.slaveId, functionCode, startAddress, quantity, values);
        }

        this.tcpClient.write(request);
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
        console.log("📡 Beklenen haberleşme hatası:", error.message);
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

  // Yardımcı metod: PDU oluştur (CRC'siz kısım)
  buildPDU(functionCode, startAddress, quantity, values) {
    let pdu;
    if (functionCode === 3) {
      pdu = Buffer.alloc(5);
      pdu.writeUInt8(functionCode, 0);
      pdu.writeUInt16BE(startAddress, 1);
      pdu.writeUInt16BE(quantity, 3);
    } else if (functionCode === 6) {
      pdu = Buffer.alloc(5);
      pdu.writeUInt8(functionCode, 0);
      pdu.writeUInt16BE(startAddress, 1);
      pdu.writeUInt16BE(values[0], 3);
    } else if (functionCode === 16) {
      const byteCount = values.length * 2;
      pdu = Buffer.alloc(6 + byteCount);
      pdu.writeUInt8(functionCode, 0);
      pdu.writeUInt16BE(startAddress, 1);
      pdu.writeUInt16BE(values.length, 3);
      pdu.writeUInt8(byteCount, 5);
      for (let i = 0; i < values.length; i++) {
        pdu.writeUInt16BE(values[i], 6 + i * 2);
      }
    }
    return pdu;
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

    // KRİTİK: Eğer WiFi geçişi yapılıyorsa TCP bağlantısını öldürme!
    if (this.tcpClient && !this.isTransitioningToWiFi) {
      console.log("🔌 TCP Bağlantısı kapatılıyor...");
      this.tcpClient.destroy();
      this.tcpClient = null;
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
    // this.isTransitioningToWiFi = false; // BU SATIR SİLİNDİ: Geçişi mantık katmanı bitirmeli
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
