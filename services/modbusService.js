import { Buffer } from 'buffer';
import TcpSocket from 'react-native-tcp-socket';
import {
  buildModbusMessage,
  COMMANDS,
  REGISTERS,
  stringToRegisters
} from './modbusUtils';

/**
 * ModbusService: BLE ve TCP (WiFi) üzerinden Modbus haberleşmesini yöneten sınıf.
 * Her bir cihaz bağlantısı için yeni bir instance oluşturulabilir.
 */
export class ModbusService {
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
    this.port = 23; // Varsayılan port (RTU Over TCP için 23, Standart Modbus için 502)

    this.queue = [];
    this.processing = false;
    this.isRebooting = false;
    this.isTransitioningToWiFi = false;
    this.onDataCallback = null;
    this.readResolver = null;
    this.subscription = null;
    this.isTeardown = false; // Teardown sırasında logları susturmak için
  }

  /**
   * BLE Cihazını ayarlar ve dinlemeye başlar.
   */
  setDevice(deviceId, device, slaveId = 1) {
    console.log(`[MODBUS_SERVICE] 📱 BLE Cihazı Ayarlanıyor: ${deviceId}`);
    this.deviceId = deviceId;
    this.device = device;
    this.slaveId = slaveId;
    this.transport = 'BLE';

    if (device) {
      this.setupMonitor();
    }
  }

  /**
   * TCP (WiFi) bağlantısını başlatır.
   */
  async connectTCP(ip, port = 502, retryCount = 10) {
    if (!ip) throw new Error("IP adresi belirtilmedi.");
    const cleanIp = ip.toString().trim();
    let cleanPort = parseInt(port) || 502;

    this.transport = 'TCP';
    this.ip = cleanIp;
    this.port = cleanPort;

    console.log(`[MODBUS_SERVICE] 🚀 TCP Bağlantı Süreci Başladı: ${cleanIp}:${cleanPort} (Retry: ${retryCount})`);

    for (let i = 1; i <= retryCount; i++) {
      try {
        console.log(`[MODBUS_SERVICE] 🌐 Deneme ${i}/${retryCount} -> ${cleanIp}:${cleanPort}`);
        const result = await this._doConnect(cleanIp, cleanPort);
        return result;
      } catch (error) {
        console.warn(`[MODBUS_SERVICE] ⚠️ Deneme ${i} Başarısız: ${error.message}`);

        if (i === retryCount) {
          throw error;
        }

        // WiFi geçişi ve zayıf ağlar için bekleme süresi 3 saniye yapıldı
        await new Promise(resolve => setTimeout(resolve, 3000));
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
          console.log(`[MODBUS_SERVICE] ✅ TCP Bağlantısı BAŞARILI (${ip}:${port})`);
          // Nagle Algoritmasını devre dışı bırak (Gecikmeyi önlemek için)
          this.tcpClient.setNoDelay(true);
          isResolved = true;
          resolve({ success: true });
        });

        this.tcpClient.on('data', (data) => {
          this.handleIncomingData(Array.from(data));
        });

        this.tcpClient.on('error', (error) => {
          if (!isResolved) {
            isResolved = true;
            console.error(`[MODBUS_SERVICE] ❌ TCP Hatası Detayı:`, error);
            const errorMsg = error?.message || (error ? JSON.stringify(error) : 'Bilinmeyen TCP Hatası');
            console.error(`[MODBUS_SERVICE] ❌ TCP Hata Mesajı: ${errorMsg}`);
            reject(new Error(errorMsg));
          }
          // Hata durumunda da temizlik yap ki "Socket is closed" sarmalına girmesin
          this.tcpClient = null;
          this.transport = 'NONE';
        });

        this.tcpClient.on('close', () => {
          console.log(`[MODBUS_SERVICE] 🔌 TCP Bağlantısı Kapandı (${this.ip})`);
          this.tcpClient = null;
          this.transport = 'NONE';
        });

        // 6 saniye timeout
        setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            if (this.tcpClient) {
              this.tcpClient.destroy();
              this.tcpClient = null;
            }
            reject(new Error("Bağlantı zaman aşımı (6s)"));
          }
        }, 6000);

      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * BLE Notification kanalını açar.
   */
  setupMonitor() {
    if (this.subscription) {
      this.subscription.remove();
    }

    console.log(`[MODBUS_SERVICE] 📡 BLE Monitor Başlatılıyor: ${this.deviceId}`);
    this.subscription = this.device.monitorCharacteristicForService(
      this.serviceUUID,
      this.characteristicUUID,
      (error, characteristic) => {
        if (error) {
          console.log("[MODBUS_SERVICE] 📡 Monitor Hatası:", error.message);
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

  /**
   * Gelen ham veriyi Modbus protokolüne göre işler.
   */
  handleIncomingData(data) {
    // Okuma yanıtı kontrolü (FC 3)
    // Modbus TCP (502) ile RTU Over TCP (23) farklı ofsetler kullanır
    const isStandardTCP = this.transport === 'TCP' && this.port === 502;
    const funcCode = isStandardTCP ? data[7] : data[1];

    if (this.readResolver && (funcCode === 3)) {
      const resolver = this.readResolver;
      this.readResolver = null;

      let registers = [];
      const dataOffset = isStandardTCP ? 9 : 3;
      const byteCount = isStandardTCP ? data[8] : data[2];

      for (let i = 0; i < byteCount; i += 2) {
        registers.push((data[dataOffset + i] << 8) | data[dataOffset + i + 1]);
      }
      resolver({ success: true, registers });
    }

    // Global dinleyiciye veriyi ilet
    if (this.onDataCallback) {
      this.onDataCallback(data);
    }
  }

  /**
   * Modbus komutu gönderir (Sıraya alarak).
   */
  async sendCommand(functionCode, startAddress, quantity = null, values = null, withoutResponse = false, isPriority = false) {
    if (this.isRebooting) {
      return Promise.reject(new Error("Cihaz yeniden başlatılıyor..."));
    }

    return new Promise((resolve, reject) => {
      const item = { functionCode, startAddress, quantity, values, withoutResponse, resolve, reject };

      if (isPriority) {
        // Öncelikli komutları (ZERO/TARE gibi) sıranın başına ekle (ama mevcut işleme dokunma)
        this.queue.unshift(item);
        console.log(`[MODBUS_SERVICE] ⚡ Öncelikli komut sıraya alındı: Addr ${startAddress}`);
      } else {
        // Okuma komutları için kuyruk şişmesini önle
        if (functionCode === 3 && this.queue.length > 5) {
          // Eğer kuyrukta çok fazla okuma biriktiyse, eskisini at (Çünkü yenisi zaten yolda)
          const redundantIndex = this.queue.findIndex(q => q.functionCode === 3 && q.startAddress === startAddress);
          if (redundantIndex !== -1) {
            this.queue.splice(redundantIndex, 1);
          }
        }
        this.queue.push(item);
      }
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true; // Kuyruğu kilitle

    const item = this.queue.shift();
    if (!item) {
      this.processing = false;
      return;
    }
    const { functionCode, startAddress, quantity, values, withoutResponse, resolve, reject } = item;

    try {
      let request;
      if (this.transport === 'BLE') {
        if (!this.device) throw new Error('Cihaz bağlı değil (BLE)');

        request = buildModbusMessage(this.slaveId, functionCode, startAddress, quantity, values);
        const base64Data = Buffer.from(request).toString('base64');

        if (withoutResponse) {
          await this.device.writeCharacteristicWithoutResponseForService(this.serviceUUID, this.characteristicUUID, base64Data);
        } else {
          await this.device.writeCharacteristicWithResponseForService(this.serviceUUID, this.characteristicUUID, base64Data);
        }
      } else {
        if (!this.tcpClient) throw new Error('TCP Bağlantısı mevcut değil (Socket null)');

        try {
          if (this.port === 502) {
            // Modbus TCP (MBAP Header + PDU)
            const pdu = this.buildPDU(functionCode, startAddress, quantity, values);
            request = Buffer.alloc(7 + pdu.length);
            request.writeUInt16BE(Math.floor(Math.random() * 65535), 0);
            request.writeUInt16BE(0, 2);
            request.writeUInt16BE(pdu.length + 1, 4);
            request.writeUInt8(this.slaveId, 6);
            pdu.copy(request, 7);
          } else {
            // RTU Over TCP
            request = buildModbusMessage(this.slaveId, functionCode, startAddress, quantity, values);
          }
          this.tcpClient.write(request);
        } catch (writeErr) {
          this.tcpClient = null;
          this.transport = 'NONE';
          throw new Error("Socket yazma hatası: " + writeErr.message);
        }
      }

      // Okuma bekliyor ise
      if (functionCode === 3) {
        const result = await new Promise((res) => {
          this.readResolver = res;
          setTimeout(() => {
            if (this.readResolver === res) {
              this.readResolver = null;
              res({ success: false, error: 'Timeout' });
            }
          }, 1500);
        });
        resolve(result);
      } else {
        // Yazma komutlarından sonra bekleme süresini azalt (Performans artışı)
        await new Promise(r => setTimeout(r, 20));
        resolve({ success: true, address: startAddress });
      }
    } catch (error) {
      if (!this.isTeardown) {
        console.error(`[MODBUS_SERVICE] ❌ İşlem Hatası (Addr: ${startAddress}):`, error.message);
      }
      reject(error);
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

  /**
   * Ağ Taraması (Subnet Scanning) - Sınıf seviyesinde yardımcı metod.
   */
  /**
   * Ağ Taraması (Subnet Scanning) - Sınıf seviyesinde yardımcı metod.
   */
  static async scanNetwork(subnet, onProgress) {
    const foundDevices = [];
    const ports = [23, 502];
    const timeout = 1200; // Optimize: 1.2 saniye bekleme
    const subnetToScan = subnet.trim();

    console.log(`[MODBUS_SCAN] 🔍 Hyper-Speed Tarama Başlatılıyor: ${subnetToScan}.x`);

    // Öncelikli IP'ler: Bunlar taramanın en başında denenecek
    const priorityOctets = [1, 116, 100, 200, 10, 50, 101, 150];
    const allOctets = Array.from({ length: 254 }, (_, i) => i + 1);
    const scanOrder = [...new Set([...priorityOctets, ...allOctets])];

    const chunkSize = 30; // 30 paralel sorgu
    for (let i = 0; i < scanOrder.length; i += chunkSize) {
      const currentChunk = scanOrder.slice(i, i + chunkSize);
      const promises = [];

      currentChunk.forEach(lastOctet => {
        const ip = `${subnetToScan}.${lastOctet}`;
        onProgress && onProgress(i / scanOrder.length);

        ports.forEach(port => {
          promises.push(new Promise((resolve) => {
            let isResolved = false;
            let socket = null;

            const cleanup = () => {
              if (isResolved) return;
              isResolved = true;
              if (timer) clearTimeout(timer);
              if (socket) {
                try { socket.destroy(); } catch (e) { }
              }
              resolve();
            };

            const timer = setTimeout(cleanup, timeout);

            try {
              socket = TcpSocket.createConnection({ host: ip, port: port }, () => {
                if (!isResolved) {
                  console.log(`[MODBUS_SCAN] ✨ Cihaz Bulundu: ${ip}:${port}`);
                  foundDevices.push({ ip, port, name: `WiFi Cihaz (${ip})` });
                  cleanup();
                }
              });

              socket.on('error', cleanup);
              socket.on('close', cleanup);

            } catch (err) {
              cleanup();
            }
          }));
        });
      });

      await Promise.all(promises);
      await new Promise(r => setTimeout(r, 25)); // Ağ dinlenmesi
    }

    console.log(`[MODBUS_SCAN] ✅ Tarama Bitti. Toplam ${foundDevices.length} cihaz bulundu.`);
    return foundDevices;
  }

  async safeTeardown(isManual = true) {
    console.log(`🧹 Merkezi güvenli kapatma başlatıldı... (isManual: ${isManual})`);
    this.isTeardown = true; // Logları sustur
    const wasRebooting = this.isRebooting;

    // Kuyruktaki bekleyenleri "Bağlantı Kesildi" hatasıyla reddet
    this.queue.forEach(item => {
      if (item.reject) item.reject(new Error("Bağlantı kesildi"));
    });
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
        this.isTeardown = false;
        return;
      }

      try {
        console.log("🔌 BLE Bağlantısı kesiliyor...");
        if (dev && typeof dev.cancelConnection === 'function') {
          await dev.cancelConnection().catch(e => console.warn("[BLE] cancelConnection caught:", e.message));
        }
        console.log("✓ Cihaz bağlantısı merkezden kesildi.");
      } catch (e) {
        console.warn("[MODBUS_SERVICE] Bağlantı kesme hatası sessize alındı:", e.message);
      }
    }

    this.isRebooting = false;
    this.isTeardown = false;
    // this.isTransitioningToWiFi = false; 
  }

  // --- Kısayol Metodları ---
  async readRegister(address, count = 1) { return this.sendCommand(3, address, count); }
  async writeRegister(address, value) { return this.sendCommand(6, address, null, [value]); }
  async writeRegisters(address, values) { return this.sendCommand(16, address, null, values); }
  async zero() { return this.sendCommand(6, REGISTERS.COMMAND, null, [COMMANDS.ZERO], false, true); }
  async tare() { return this.sendCommand(6, REGISTERS.COMMAND, null, [COMMANDS.TARE], false, true); }


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
