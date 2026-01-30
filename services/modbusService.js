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
    this.isConnecting = false;
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

    // NÜKLEER SIFIRLAMA: BLE'ye geçerken WiFi kalıntılarını temizle
    this.isTransitioningToWiFi = false;
    this.isConnecting = false;
    if (this.tcpClient) {
      console.log("[MODBUS_SERVICE] 🔌 Eski TCP temziği yapılıyor...");
      try { this.tcpClient.destroy(); } catch (e) { }
      this.tcpClient = null;
    }

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
    const cleanPort = parseInt(port) || 502;

    console.log(`[MODBUS_SERVICE] 🚀 TCP Bağlantı İsteği: ${cleanIp}:${cleanPort}`);

    // AGGRESSIVE RESET: Önce her şeyi (varsa eski soketleri) temizle
    await this.safeTeardown(false);

    this.transport = 'TCP';
    this.ip = cleanIp;
    this.port = cleanPort;
    this.isConnecting = true;
    this.queue = [];

    console.log(`[MODBUS_SERVICE] 🚀 TCP Bağlantı Süreci Başladı: ${cleanIp}:${cleanPort} (Retry: ${retryCount})`);

    for (let i = 1; i <= retryCount; i++) {
      try {
        console.log(`[MODBUS_SERVICE] 🌐 Deneme ${i}/${retryCount} -> ${cleanIp}:${cleanPort}`);
        const result = await this._doConnect(cleanIp, cleanPort);
        // Minimal Yerleşme: 50ms bekle (Cihazı boş bırakma)
        await new Promise(r => setTimeout(r, 50));
        this.isConnecting = false;
        return result;
      } catch (error) {
        this.isConnecting = false;
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
      // Temizlik: Varsa eski bağlantıyı kapat
      if (this.tcpClient) {
        try {
          this.tcpClient.destroy();
        } catch (e) { }
        this.tcpClient = null;
      }

      this.ip = ip;
      this.port = port;
      this.transport = 'TCP';

      let isResolved = false;
      let timer = null;

      // Yerel değişken kullanımı (Race condition önleyici)
      const client = TcpSocket.createConnection({ host: ip, port: port }, () => {
        // Eğer zaman aşımı (timeout) çoktan çalıştıysa işlem yapma
        if (isResolved) {
          try { client.destroy(); } catch (e) { }
          return;
        }

        console.log(`[MODBUS_SERVICE] ✅ TCP Bağlantısı BAŞARILI (${ip}:${port})`);

        // HATA ÇÖZÜMÜ: this.tcpClient yerine direkt 'client' değişkenini kullanıyoruz
        // Böylece this.tcpClient null olsa bile bu yerel değişken hala yaşıyordur.
        try {
          client.setNoDelay(true);
        } catch (err) {
          console.warn("[MODBUS_SERVICE] setNoDelay hatası (Önemsiz):", err.message);
        }

        // Zamanlayıcıyı iptal et
        if (timer) clearTimeout(timer);

        isResolved = true;
        resolve({ success: true });
      });

      // Global değişkene ata
      this.tcpClient = client;

      client.on('data', (data) => {
        // TCP Kaynağından geldiğini belirt
        this.handleIncomingData(Array.from(data), 'TCP');
      });

      client.on('error', (error) => {
        if (!isResolved) {
          isResolved = true;
          if (timer) clearTimeout(timer);
          console.error(`[MODBUS_SERVICE] ❌ TCP Hata Mesajı: ${error.message}`);
          reject(new Error(error.message));
        }

        // KRİTİK: Bekleyen okuma varsa iptal et (Zombi temizliği)
        if (this.readResolver) {
          this.readResolver({ success: false, error: 'Connection lost' });
          this.readResolver = null;
        }

        // Hata durumunda sınıfı ve kuyruğu temizle
        this.tcpClient = null;
        this.transport = 'NONE';
        this.isConnecting = false;
        this.queue = [];
      });

      client.on('close', () => {
        console.log(`[MODBUS_SERVICE] 🔌 TCP Bağlantısı Kapandı (${this.ip})`);

        // KRİTİK: Bekleyen okuma varsa iptal et
        if (this.readResolver) {
          this.readResolver({ success: false, error: 'Connection closed' });
          this.readResolver = null;
        }

        if (this.tcpClient === client) {
          this.tcpClient = null;
          this.transport = 'NONE';
          this.isConnecting = false;
          this.queue = [];
        }
      });

      // 4 saniye timeout (Hotspot gecikmeleri için ideal süre)
      timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.warn(`[MODBUS_SERVICE] ⚠️ Zaman aşımı (${ip})`);
          if (client) {
            try { client.destroy(); } catch (e) { }
          }
          // Burada this.tcpClient = null YAPMIYORUZ, çünkü 'close' event'i zaten yapacak.
          // Manuel yaparsak yukarıdaki race condition oluşuyor.
          reject(new Error("Bağlantı zaman aşımı (4s)"));
        }
      }, 4000);
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
          // BLE Kaynağından geldiğini belirt
          this.handleIncomingData(Array.from(data), 'BLE');
        }
      },
      `modbus_monitor_${this.deviceId}`
    );
  }

  /**
   * Gelen ham veriyi Modbus protokolüne göre işler.
   */
  handleIncomingData(data, source) {
    // ÇAKIŞMA ÖNLEYİCİ: Eğer gelen veri şu anki taşıma moduyla uyuşmuyorsa görmezden gel
    if (source && source !== this.transport) {
      // Sesi çok çıkarmadan görmezden gel (Log kirliliği yapma)
      return;
    }

    const isStandardTCP = this.transport === 'TCP' && this.port === 502;
    const funcCode = isStandardTCP ? data[7] : data[1];

    // MODBUS ERROR CHECK (FC | 0x80)
    if (this.readResolver && (funcCode & 0x80)) {
      const resolver = this.readResolver;
      this.readResolver = null;
      // Sessiz hata (Log kirliliğini önle)
      resolver({ success: false, error: `Modbus Exception 0x${funcCode.toString(16)}` });
      return;
    }

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

    // FC 6 ve 16 (Yazma) cevaplarını yakala (Echo kontrolü)
    if (this.readResolver && (funcCode === 6 || funcCode === 16)) {
      const resolver = this.readResolver;
      this.readResolver = null;
      resolver({ success: true, functionCode: funcCode });
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
        // Öncelikli komutları (ZERO/TARE gibi) sıranın başına ekle
        this.queue.unshift(item);
        console.log(`[MODBUS_SERVICE] ⚡ Öncelikli komut (${this.ip || this.deviceId}) sıraya alındı: Addr ${startAddress}`);
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

    // YARIŞ HALİ ÖNLEYİCİ: İşlem başladığı andaki durumu sabitle
    const currentTransport = this.transport;
    const currentTcpClient = this.tcpClient;
    const currentDevice = this.device;

    try {
      let request;
      if (currentTransport === 'BLE') {
        if (!currentDevice) throw new Error('Cihaz bağlı değil (BLE)');

        request = buildModbusMessage(this.slaveId, functionCode, startAddress, quantity, values);
        const base64Data = Buffer.from(request).toString('base64');

        if (withoutResponse) {
          await currentDevice.writeCharacteristicWithoutResponseForService(this.serviceUUID, this.characteristicUUID, base64Data);
        } else {
          await currentDevice.writeCharacteristicWithResponseForService(this.serviceUUID, this.characteristicUUID, base64Data);
        }
      } else if (currentTransport === 'TCP') {
        // TCP bağlantısı kuruluyor mu bekleyelim mi?
        if (this.isConnecting) {
          console.log(`[MODBUS_SERVICE] ⏳ ${this.ip} bağlantısı bekleniyor...`);
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (!this.isConnecting && this.tcpClient) break;
          }
        }

        if (!this.tcpClient) throw new Error(`TCP Bağlantısı mevcut değil (${this.ip || 'No IP'})`);
      } else {
        throw new Error(`Geçersiz Transport: ${currentTransport}`);
      }

      if (currentTransport === 'TCP' && this.tcpClient) {
        try {
          if (this.port === 502) {
            const pdu = this.buildPDU(functionCode, startAddress, quantity, values);
            request = Buffer.alloc(7 + pdu.length);
            request.writeUInt16BE(Math.floor(Math.random() * 65535), 0);
            request.writeUInt16BE(0, 2);
            request.writeUInt16BE(pdu.length + 1, 4);
            request.writeUInt8(this.slaveId, 6);
            pdu.copy(request, 7);
          } else {
            request = buildModbusMessage(this.slaveId, functionCode, startAddress, quantity, values);
          }
          this.tcpClient.write(request);
        } catch (writeErr) {
          console.error(`[MODBUS_SERVICE] ❌ ${this.ip} Yazma Hatası:`, writeErr.message);
          this.tcpClient = null;
          throw new Error("Socket yazma hatası: " + writeErr.message);
        }
      }

      // HANDSHAKING: Tüm modlarda (BLE ve TCP) cevap bekle (eğer response isteniyorsa)
      if (!withoutResponse) {
        const result = await new Promise((res) => {
          this.readResolver = res;
          setTimeout(() => {
            if (this.readResolver === res) {
              this.readResolver = null;
              res({ success: false, error: 'Timeout' });
            }
          }, 1500);
        });

        // İşlem sonrası nefes payı (Cihazı yormamak için)
        await new Promise(r => setTimeout(r, 50));
        resolve(result);
      } else {
        // Response istenmeyen durumlarda (Restart vb.) bekleme ama resolve et
        await new Promise(r => setTimeout(r, 50));
        resolve({ success: true });
      }
    } catch (error) {
      if (!this.isTeardown && !error.message.includes("NONE")) {
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
  static async scanNetwork(subnet, onProgress) {

    const foundDevices = [];


    const ports = [502, 23]; // Önce 502'yi denesin (Genelde standart budur)
    const subnetToScan = subnet.trim();


    // Öncelikli IP'ler: Bunlar taramanın en başında denenecek
    const priorityOctets = [182, 1, 116, 100, 200, 10, 50, 101, 150];
    const allOctets = Array.from({ length: 254 }, (_, i) => i + 1);
    const scanOrder = [...new Set([...priorityOctets, ...allOctets])];

    // Optimize Edilmiş Değerler:
    const timeout = 3000;
    const chunkSize = 30;

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
            let timer = null;

            const cleanup = () => {
              if (isResolved) return;
              isResolved = true;
              if (timer) clearTimeout(timer);
              if (socket) {
                try { socket.destroy(); } catch (e) { }
              }
              resolve();
            };

            timer = setTimeout(cleanup, timeout);

            try {
              socket = TcpSocket.createConnection({ host: ip, port: port }, () => {
                // TCP BAĞLANDI -> Şimdi Modbus ile "Ping" atalım (Gerçek cihaz mı?)
                try {
                  const pingBuffer = (port === 502)
                    ? Buffer.from([0, 1, 0, 0, 0, 6, 1, 3, 0, 7, 0, 1]) // Standard TCP
                    : buildModbusMessage(1, 3, 7, 1);                  // RTU over TCP

                  socket.write(pingBuffer);
                } catch (e) { cleanup(); }
              });

              socket.on('data', (data) => {
                if (!isResolved) {
                  // Yanıt plausibility kontrolü (FC 3 veya Error 0x83 gelmeli)
                  const funcCode = (port === 502) ? data[7] : data[1];
                  if (funcCode === 3 || funcCode === 0x83) {
                    console.log(`[MODBUS_SCAN] ✨ GERÇEK Cihaz Bulundu: ${ip}:${port}`);
                    foundDevices.push({ ip, port, name: `WiFi Cihaz (${ip})` });
                    cleanup();
                  }
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

  /**
   * AKILLI TARAMA: En yaygın ESP32/Modem ağ bloklarını sırayla tarar.
   * Kullanıcı IP girmekle uğraşmaz.
   */
  static async smartScan(onProgress) {
    // Taranacak mahallelerin listesi (Önem sırasına göre)
    const targetSubnets = [
      '192.168.137', // 1. Öncelik: Windows Hotspot (Senin şu anki durumun)
      '192.168.1',   // 2. Öncelik: Ev/Ofis Modemleri
      '192.168.4',   // 3. Öncelik: ESP32'nin kendi yayını (AP Modu)
      '192.168.0'    // 4. Öncelik: Bazı eski modemler
    ];

    let allFoundDevices = [];
    console.log("[SMART_SCAN] 🧠 Akıllı Tarama Başlatıldı...");

    // Her bir ağ bloğunu sırayla gez
    for (let i = 0; i < targetSubnets.length; i++) {
      const subnet = targetSubnets[i];

      // İlerleme çubuğu hesabı (Örn: 4 ağ varsa her biri %25 yer kaplar)
      const baseProgress = i / targetSubnets.length;
      const stepSize = 1 / targetSubnets.length;

      try {
        // Senin yazdığın mevcut fonksiyonu çağırıyoruz
        const found = await this.scanNetwork(subnet, (subnetProgress) => {
          // Toplam ilerlemeyi hesapla ve UI'ya gönder
          if (onProgress) {
            const totalProgress = baseProgress + (subnetProgress * stepSize);
            onProgress(totalProgress);
          }
        });

        if (found && found.length > 0) {
          // Mükerrer kayıtları önlemek için kontrol
          found.forEach(device => {
            if (!allFoundDevices.some(d => d.ip === device.ip)) {
              allFoundDevices.push(device);
            }
          });
        }
      } catch (error) {
        console.log(`[SMART_SCAN] ${subnet} taranırken atlandı.`);
      }
    }

    console.log(`[SMART_SCAN] ✅ Bitti. Toplam ${allFoundDevices.length} cihaz bulundu.`);
    if (onProgress) onProgress(1); // %100 yap
    return allFoundDevices;
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
  async clearTare() { return this.sendCommand(6, REGISTERS.COMMAND, null, [COMMANDS.TARE], false, true); }


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
