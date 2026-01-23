import { Buffer } from 'buffer';



// Modbus RTU CRC-16 Hesaplaması

const CRC16_TABLE = new Uint16Array(256);

(() => {

  for (let i = 0; i < 256; i++) {

    let crc = i;

    for (let j = 0; j < 8; j++) {

      crc = (crc & 1) ? (crc >> 1) ^ 0xa001 : crc >> 1;

    }

    CRC16_TABLE[i] = crc;

  }

})();



export const calculateCRC = (buffer) => {

  let crc = 0xffff;

  for (let i = 0; i < buffer.length; i++) {

    crc = (CRC16_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >> 8)) & 0xffff;

  }

  return crc;

};



// Modbus RTU Paket Oluşturma

export const buildModbusMessage = (slaveId, functionCode, startAddress, quantity = null, values = null) => {

  let buffer;



  switch (functionCode) {

    case 3: // Read Holding Registers (Okuma)

      buffer = Buffer.alloc(6);

      buffer.writeUInt8(slaveId, 0);

      buffer.writeUInt8(functionCode, 1);

      buffer.writeUInt16BE(startAddress, 2);

      buffer.writeUInt16BE(quantity, 4);

      break;



    case 6: // Write Single Register

      buffer = Buffer.alloc(6);

      buffer.writeUInt8(slaveId, 0);

      buffer.writeUInt8(functionCode, 1);

      buffer.writeUInt16BE(startAddress, 2);

      buffer.writeUInt16BE(values[0], 4);

      break;



    case 16: // Write Multiple Registers

      const byteCount = values.length * 2;

      buffer = Buffer.alloc(7 + byteCount);

      buffer.writeUInt8(slaveId, 0);

      buffer.writeUInt8(functionCode, 1);

      buffer.writeUInt16BE(startAddress, 2);

      buffer.writeUInt16BE(values.length, 4);

      buffer.writeUInt8(byteCount, 6);

      for (let i = 0; i < values.length; i++) {

        buffer.writeUInt16BE(values[i], 7 + i * 2);

      }

      break;



    default:

      throw new Error(`Desteklenmeyen Modbus fonksiyonu: ${functionCode}`);

  }



  // CRC ekle

  const crc = calculateCRC(buffer);

  const message = Buffer.alloc(buffer.length + 2);

  buffer.copy(message, 0);

  message.writeUInt16LE(crc, buffer.length);



  return message;

};



// Modbus Yanıtını Parse Et

export const parseModbusResponse = (buffer) => {

  if (buffer.length < 5) {

    throw new Error('Geçersiz Modbus yanıtı: çok kısa');

  }



  const slaveId = buffer.readUInt8(0);

  const functionCode = buffer.readUInt8(1);

  const crcReceived = buffer.readUInt16LE(buffer.length - 2);

  const crcCalculated = calculateCRC(buffer.slice(0, buffer.length - 2));



  if (crcReceived !== crcCalculated) {

    throw new Error(`CRC hatası: alınan ${crcReceived}, hesaplanan ${crcCalculated}`);

  }



  // Hata Kodu Kontrolü

  if (functionCode & 0x80) {

    const errorCode = buffer.readUInt8(2);

    const errorMessages = {

      1: 'İllegal Fonksiyon',

      2: 'İllegal Veri Adresi',

      3: 'İllegal Veri Değeri',

      5: 'İşlem Devam Ediyor (Tamamlanması bekleniyor)',

      6: 'Cihaz Meşgul'

    };

    throw new Error(`Modbus Hatası: ${errorMessages[errorCode] || `Bilinmeyen Hata ${errorCode}`}`);

  }



  const registers = [];

  if (functionCode === 3) {

    const byteCount = buffer.readUInt8(2);

    const registerCount = byteCount / 2;

    for (let i = 0; i < registerCount; i++) {

      registers.push(buffer.readUInt16BE(3 + i * 2));

    }

  }



  return { slaveId, functionCode, registers };

};



// 32-bit Değer (2 Register) İçin Helper

export const splitInt32 = (value) => {

  const high = (value >> 16) & 0xffff;

  const low = value & 0xffff;

  return [high, low];

};



export const combineInt32 = (high, low) => {

  return ((high << 16) | low) >>> 0;

};



// Register Listesi (Enum)

export const REGISTERS = {

  COMMAND: 0,           // Komut (yazılabilir)

  STATUS: 7,            // Durum (okunabilir)

  DISPLAY_VALUE: 8,     // Ekran Değeri

  TARE_VALUE: 12,       // Dara Değeri

  GROSS_VALUE: 16,      // Brüt Değer

  TARE_INTERNAL: 16,    // Dara (İç)

  ZERO_INTERNAL: 20,    // Sıfır (İç)

  ADC_FILTERED: 28,     // ADC Filtreli

  ADC_RAW: 30,          // ADC Ham

  ADC_MV_V: 32,         // ADC mV/V

  COMM_MODE: 34,        // İletişim Modu

  COMM_ID: 35,          // İletişim ID

  BAUDRATE: 36,         // Baud Rate

  DATA_BIT: 37,         // Veri Biti

  PARITY: 38,           // Eşlik

  PERIOD: 39,           // Periyot

  USB_MODE: 46,         // USB Modu

  USB_PERIOD: 47,       // USB Periyot

  WIRELESS_TYPE: 48,    // Kablosuz Tür

  CALIBRATION_VALUE: 99,    // Kalibrasyon Değeri

  CALIBRATION_COEFF: 101,   // Kalibrasyon Katsayısı

  DIGITAL_CALIB_MV_V: 103,  // Dijital Kalibrasyon mV/V

  CALIBRATION_CMD: 106,     // Kalibrasyon Komutu

  FILTER_TYPE: 107,     // Filtre Türü

  ADC_HZ: 108,          // ADC Hz

  MOVING_AVG_COUNT: 109,// Hareketli Ort. Adet

  RESPONSE_TIME: 110,   // Tepki Süresi

  VIBRATION: 111,       // Titreşim

  DECISION_TIME: 112,   // Karar Süresi

  MAX_CAPACITY: 113,    // MAX Kapasite

  ZERO_LIMIT: 115,      // Sıfırlama Limiti

  RESOLUTION_FACTOR: 116,

  STEP: 117,

  DEVICE_DOT: 118,

  UNIT: 119,            // Birim (kg, g, lb, mv/v, mv)

  STABILITY: 120,       // Hareketsizlik

  TARE_ENABLE: 121,     // Dara Fonksiyonu

  LANGUAGE: 122,        // Dil

  PASSWORD_MODE: 123,   // Şifre Modu

  RELAY1_CONTROL: 74,   // Röle 1 Kontrol

  RELAY1_SET: 75,       // Röle 1 Set Değeri

  RELAY1_HYSTERESIS: 77,// Röle 1 Histerisis

  RELAY1_DIRECTION: 79, // Röle 1 Set Yönü

  RELAY1_ON_DELAY: 80,  // Röle 1 Açma Gecikmesi

  RELAY1_OFF_DELAY: 81, // Röle 1 Kapatma Gecikmesi

  SERIAL_NUMBER: 128,   // Seri Numarası

  FIRMWARE_VERSION: 130 // Yazılım Sürümü

};



// Komut Kodları

export const COMMANDS = {

  ZERO: 5,              // Sıfırlama

  TARE: 6,              // Dara Alma/Bırakma

  RESTART: 13,          // Yeniden Başlat

  FACTORY_RESET: 14,    // Fabrika Ayarları

  FIRMWARE_UPDATE: 15   // Yazılım Güncelleme

};



// Durum Bit'leri (Register 7)

export const STATUS_BITS = {

  OVERWEIGHT: 4,        // Ağırlık maksimumun üstünde

  ABSOLUTE_ZERO: 5,     // Mutlak sıfır var

  STABILITY: 6,         // 1=hareketsiz, 0=hareketli

  ZERO_FAILED: 8,       // Sıfırlama yapılamaz

  TARE_FAILED: 9,       // Dara alınamaz

  TARE_EXIST: 10,       // Dara var

  RELAY1_ON: 11,        // Röle 1 kapalı (enerjili)

  RELAY2_ON: 12         // Röle 2 kapalı (enerjili)

};



// Durum Kontrolü

export const checkStatus = (statusValue, bitPosition) => {

  return (statusValue & (1 << (bitPosition - 1))) !== 0;

};



// Kullanıcı Dostu Durum Mesajları

export const getStatusMessage = (statusValue) => {

  const messages = [];

 

  if (checkStatus(statusValue, STATUS_BITS.OVERWEIGHT)) {

    messages.push('⚠️ Ağırlık Maksimumun Üstünde');

  }

  if (checkStatus(statusValue, STATUS_BITS.ABSOLUTE_ZERO)) {

    messages.push('✓ Mutlak Sıfır Modu');

  }

  if (checkStatus(statusValue, STATUS_BITS.STABILITY)) {

    messages.push('✓ Hareketsiz (Kararlı)');

  } else {

    messages.push('⚠️ Hareketli');

  }

  if (checkStatus(statusValue, STATUS_BITS.ZERO_FAILED)) {

    messages.push('❌ Sıfırlama Yapılamaz');

  }

  if (checkStatus(statusValue, STATUS_BITS.TARE_FAILED)) {

    messages.push('❌ Dara Alınamaz');

  }

  if (checkStatus(statusValue, STATUS_BITS.TARE_EXIST)) {

    messages.push('✓ Dara Aktif');

  }

 

  return messages;

};