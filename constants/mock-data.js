/**
 * Mock Data - Geliştirme ve test amaçlı sahte veriler
 * Gerçek cihazlar olmadan uygulamayı test etmek için kullanılır
 */

// Mock şirket bilgileri (Gerçek şirket info yerine)
export const MOCK_COMPANY_INFO = {
  name: 'Industrial Telemetry Solutions',
  website: 'https://telemetry.example.com',
  email: 'support@telemetry.example.com',
  phone: '+1 (555) 123-4567',
  address: '123 Tech Avenue, Silicon Valley, CA 94025',
  logo: 'https://via.placeholder.com/150?text=ITS',
  version: '1.0.0',
  buildDate: '2026-06-09'
};

// Mock cihaz listesi
export const MOCK_DEVICES = [
  {
    id: 'mock-scale-001',
    name: 'Warehouse Scale #1',
    deviceId: 'ESP32-SCALE-001',
    weight: 45.32,
    unit: 'kg',
    isStable: true,
    hasTare: false,
    isOverload: false,
    status: 'Connected',
    manufacturer: 'Industrial Telemetry Solutions',
    model: 'ITS-Scale-Pro',
    firmware: '2.1.0',
    serialNumber: 'SN-2024-001',
    location: 'Warehouse A',
    lastUpdate: new Date().toISOString()
  },
  {
    id: 'mock-scale-002',
    name: 'Lab Scale #2',
    deviceId: 'ESP32-SCALE-002',
    weight: 12.75,
    unit: 'g',
    isStable: true,
    hasTare: true,
    isOverload: false,
    status: 'Connected',
    manufacturer: 'Industrial Telemetry Solutions',
    model: 'ITS-Scale-Precision',
    firmware: '3.0.1',
    serialNumber: 'SN-2024-002',
    location: 'Lab B',
    lastUpdate: new Date().toISOString()
  },
  {
    id: 'mock-scale-003',
    name: 'Production Line #3',
    deviceId: 'ESP32-SCALE-003',
    weight: 234.56,
    unit: 'lb',
    isStable: false,
    hasTare: false,
    isOverload: false,
    status: 'Moving',
    manufacturer: 'Industrial Telemetry Solutions',
    model: 'ITS-Scale-Heavy',
    firmware: '1.9.5',
    serialNumber: 'SN-2024-003',
    location: 'Factory C',
    lastUpdate: new Date().toISOString()
  },
  {
    id: 'mock-scale-004',
    name: 'Overweight Alert #4',
    deviceId: 'ESP32-SCALE-004',
    weight: 1250.00,
    unit: 'kg',
    isStable: true,
    hasTare: false,
    isOverload: true,
    status: 'Overload!',
    manufacturer: 'Industrial Telemetry Solutions',
    model: 'ITS-Scale-Pro',
    firmware: '2.1.0',
    serialNumber: 'SN-2024-004',
    location: 'Warehouse D',
    lastUpdate: new Date().toISOString()
  }
];

// Mock TCP/WiFi cihazları
export const MOCK_TCP_DEVICES = [
  {
    id: 'mock-tcp-001',
    name: 'WiFi Scale #1',
    ipAddress: '192.168.137.100',
    port: 502,
    weight: 56.42,
    unit: 'kg',
    isStable: true,
    status: 'Online'
  },
  {
    id: 'mock-tcp-002',
    name: 'WiFi Scale #2',
    ipAddress: '192.168.137.101',
    port: 502,
    weight: 89.15,
    unit: 'lb',
    isStable: true,
    status: 'Online'
  }
];

// Mock kalibrasyon verileri
export const MOCK_CALIBRATION_DATA = {
  scale001: {
    zero: 0,
    span: 100000, // 100 kg
    tare: 2500,   // 2.5 kg
    unit: 0, // kg
    dot: 2,  // 2 decimal places
    lastCalibrated: '2026-05-01',
    calibratedBy: 'Admin User'
  },
  scale002: {
    zero: 0,
    span: 5000, // 5 kg (precision scale)
    tare: 0,
    unit: 1, // g
    dot: 3,  // 3 decimal places
    lastCalibrated: '2026-06-01',
    calibratedBy: 'Tech Support'
  }
};

// Mock ölçüm geçmişi
export const MOCK_MEASUREMENT_HISTORY = [
  {
    id: 1,
    deviceId: 'mock-scale-001',
    weight: 45.30,
    unit: 'kg',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    isStable: true,
    hasTare: false
  },
  {
    id: 2,
    deviceId: 'mock-scale-001',
    weight: 45.31,
    unit: 'kg',
    timestamp: new Date(Date.now() - 45000).toISOString(),
    isStable: true,
    hasTare: false
  },
  {
    id: 3,
    deviceId: 'mock-scale-001',
    weight: 45.32,
    unit: 'kg',
    timestamp: new Date(Date.now() - 30000).toISOString(),
    isStable: true,
    hasTare: false
  },
  {
    id: 4,
    deviceId: 'mock-scale-001',
    weight: 45.33,
    unit: 'kg',
    timestamp: new Date(Date.now() - 15000).toISOString(),
    isStable: true,
    hasTare: false
  },
  {
    id: 5,
    deviceId: 'mock-scale-001',
    weight: 45.32,
    unit: 'kg',
    timestamp: new Date().toISOString(),
    isStable: true,
    hasTare: false
  }
];

// Mock durum mesajları
export const MOCK_STATUS_MESSAGES = {
  stable: '✅ Ölçüm Kararlı',
  unstable: '⚠️ Hareket Algılandı',
  overload: '❌ Aşırı Yük!',
  tare: '🔵 Tare Aktif',
  calibrating: '🔧 Kalibrasyon Sürüyor...',
  error: '⚠️ Cihaz Hatası'
};

// Mock uyarı eşiği
export const MOCK_ALERT_THRESHOLDS = {
  maxWeight: 1000, // kg
  minWeight: 0.1,  // kg
  stabilityTimeout: 5000, // ms
  reconnectTimeout: 3000  // ms
};

// Mock bağlantı durumları
export const MOCK_CONNECTION_STATES = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  ERROR: 'ERROR'
};

// Mock protokol bilgileri
export const MOCK_PROTOCOL_INFO = {
  BLE: {
    name: 'Bluetooth Low Energy',
    description: 'Kablosuz bağlantı, düşük güç tüketimi',
    maxRange: 100, // meter
    isSupported: true
  },
  TCP: {
    name: 'TCP/WiFi',
    description: 'Ağ bağlantısı, daha stabil',
    maxRange: 'Unlimited',
    isSupported: true
  },
  MODBUS_RTU: {
    name: 'Modbus RTU',
    description: 'Endüstriyel protokol, seri haberleşme',
    baudrate: 9600,
    isSupported: false
  }
};

// Uygulama ayarları
export const MOCK_APP_SETTINGS = {
  theme: 'light', // light | dark
  language: 'tr', // tr | en
  pollInterval: 300, // ms
  autoReconnect: true,
  enableNotifications: true,
  debugMode: true, // Console log'ları göster
  mockDataEnabled: false // Mock veri kullan / gerçek cihaz kullan
};

/**
 * Yardımcı fonksiyon: Random ölçüm verisı oluştur
 * @param {number} baseWeight - Temel ağırlık
 * @param {number} variance - Değişkenlik
 * @returns {number} Random ağırlık
 */
export const generateMockWeight = (baseWeight = 45.32, variance = 0.05) => {
  return baseWeight + (Math.random() - 0.5) * variance;
};

/**
 * Yardımcı fonksiyon: Mock cihaz bilgisi al
 * @param {string} deviceId - Cihaz ID'si
 * @returns {object} Mock cihaz bilgisi
 */
export const getMockDevice = (deviceId) => {
  return MOCK_DEVICES.find(device => device.id === deviceId) || MOCK_DEVICES[0];
};

/**
 * Yardımcı fonksiyon: Tüm mock veriler
 * @returns {object} Tüm mock veriler
 */
export const getAllMockData = () => {
  return {
    company: MOCK_COMPANY_INFO,
    devices: MOCK_DEVICES,
    tcpDevices: MOCK_TCP_DEVICES,
    calibration: MOCK_CALIBRATION_DATA,
    history: MOCK_MEASUREMENT_HISTORY,
    status: MOCK_STATUS_MESSAGES,
    thresholds: MOCK_ALERT_THRESHOLDS,
    connections: MOCK_CONNECTION_STATES,
    protocols: MOCK_PROTOCOL_INFO,
    settings: MOCK_APP_SETTINGS
  };
};
