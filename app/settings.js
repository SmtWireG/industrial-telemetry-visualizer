import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import modbusService from '../services/modbusService';

// --- SABİT TANIMLAMALAR ---
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

const OPTIONS = {
    mod: [{ label: 'Kapalı', value: 0 }, { label: 'Sürekli', value: 1 }, { label: 'Modbus', value: 2 }],
    baudrate: [{ label: '1200', value: 0 }, { label: '2400', value: 1 }, { label: '4800', value: 2 }, { label: '9600', value: 3 }, { label: '19200', value: 4 }, { label: '38400', value: 5 }, { label: '57600', value: 6 }, { label: '115200', value: 7 }],
    bit: [{ label: '7 bit', value: 0 }, { label: '8 bit', value: 1 }],
    parity: [{ label: 'Yok', value: 0 }, { label: 'Çift', value: 1 }, { label: 'Tek', value: 2 }],
    period: [{ label: '10Hz', value: 0 }, { label: '50Hz', value: 1 }, { label: '100Hz', value: 2 }, { label: '400Hz', value: 3 }],
    usbMod: [{ label: 'Kapalı', value: 0 }, { label: 'Sürekli', value: 1 }],
    usbPeriod: [{ label: '5 Hz', value: 0 }, { label: '10 Hz', value: 1 }, { label: '15 Hz', value: 2 }, { label: '20 Hz', value: 3 }, { label: '50 Hz', value: 4 }],
    wirelessType: [{ label: 'Kapalı', value: 0 }, { label: 'Bluetooth', value: 1 }, { label: 'Wifi', value: 2 }],
    relayControl: [{ label: 'Modbus', value: 0 }, { label: 'TR4', value: 1 }],
    relayContact: [{ label: 'Norm. Açık', value: 0 }, { label: 'Norm. Kapalı', value: 1 }],
    relayDelay: [{ label: '0s', value: 0 }, { label: '0.2s', value: 1 }, { label: '0.4s', value: 2 }, { label: '1s', value: 5 }, { label: '2s', value: 6 }, { label: '5s', value: 9 }],
    unit: [{ label: 'kg', value: 0 }, { label: 'g', value: 1 }, { label: 'lb', value: 2 }, { label: 'mV/V', value: 3 }, { label: 'mV', value: 4 }],
    zeroLimit: [{ label: '%1', value: 0 }, { label: '%2', value: 1 }, { label: '%10', value: 2 }, { label: '%100', value: 3 }],
    stability: [{ label: 'Bekle', value: 1 }, { label: 'Bekleme', value: 0 }],
    tare: [{ label: 'Açık', value: 0 }, { label: 'Kapalı', value: 1 }],
    filterType: [{ label: 'Kapalı', value: 0 }, { label: 'Özel', value: 1 }, { label: 'Hareketli Ort.', value: 2 }],
    responseTime: [{ label: 'Hızlı', value: 0 }, { label: 'Yavaş', value: 1 }],
    vibration: [{ label: 'Az', value: 0 }, { label: 'Orta', value: 1 }, { label: 'Çok', value: 2 }],
    decisionTime: [{ label: 'Kısa (0.5s)', value: 0 }, { label: 'Orta (1.0s)', value: 1 }, { label: 'Uzun (2.0s)', value: 2 }],
    adcHz: [{ label: '6 Hz', value: 0 }, { label: '12 Hz', value: 1 }, { label: '25 Hz', value: 2 }, { label: '50 Hz', value: 3 }, { label: '100 Hz', value: 4 }, { label: '200 Hz', value: 5 }, { label: '400 Hz', value: 6 }],
    avgCount: [{ label: '2', value: 0 }, { label: '4', value: 1 }, { label: '8', value: 2 }, { label: '16', value: 3 }, { label: '32', value: 4 }, { label: '64', value: 5 }, { label: '128', value: 6 }],
    language: [{ label: 'Türkçe', value: 1 }, { label: 'İngilizce', value: 0 }],
    passwordMode: [{ label: 'Kullanma', value: 0 }, { label: 'Kullan', value: 1 }],
    calibType: [{ label: 'Ağırlık', value: 0 }, { label: 'Dara', value: 1 }]
};

// --- YARDIMCI BİLEŞENLER (FONKSİYON DIŞINDA - KLAVYE KAPANMASINI ÖNLER) ---
const AccordionHeader = ({ title, sectionId, expandedSection, setExpandedSection }) => (
    <TouchableOpacity style={styles.accordionHeader} onPress={() => setExpandedSection(expandedSection === sectionId ? null : sectionId)}>
        <Text style={styles.accordionTitle}>{sectionId}. {title}</Text>
        <Text style={styles.iconText}>{expandedSection === sectionId ? "-" : "+"}</Text>
    </TouchableOpacity>
);

const SubHeader = ({ title, isOpen, onToggle }) => (
    <View style={styles.subHeaderRow}>
        <Text style={styles.subHeaderText}>{title}</Text>
        <TouchableOpacity style={styles.miniButton} onPress={onToggle}>
            <Text style={styles.miniButtonText}>{isOpen ? "-" : "+"}</Text>
        </TouchableOpacity>
    </View>
);

const SettingRow = ({ label, value, onChange, onSet, keyboardType = "numeric" }) => (
    <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <TextInput style={styles.input} value={value.toString()} onChangeText={onChange} keyboardType={keyboardType} />
        <TouchableOpacity style={styles.setButton} onPress={onSet}><Text style={styles.setText}>SET</Text></TouchableOpacity>
    </View>
);

const DropdownRow = ({ label, value, options, onSelect, onSet, openModal }) => {
    const selectedLabel = options.find(o => o.value === value)?.label || "Seçiniz";
    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal(options, onSelect)}>
                <Text style={styles.dropdownText}>{selectedLabel}</Text>
                <Text style={styles.caret}>▼</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.setButton} onPress={onSet}><Text style={styles.setText}>SET</Text></TouchableOpacity>
        </View>
    );
};

const ActionRow = ({ label, btnText, onPress }) => (
    <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity style={styles.actionButton} onPress={onPress}><Text style={styles.actionText}>{btnText}</Text></TouchableOpacity>
    </View>
);

// --- ANA FONKSİYON ---
export default function SettingsScreen() {
    const { deviceId } = useLocalSearchParams();
    const router = useRouter();

    // Modbus Service'ini cihaz ID ile ayarla
    useEffect(() => {
        const isTCP = modbusService.transport === 'TCP';
        if (deviceId || isTCP) {
            console.log('✓ Settings ekranı - modbusService.device mevcut mu?', !!modbusService.device, '| Transport:', modbusService.transport);

            if (!modbusService.device && !isTCP) {
                console.error('❌ Settings ekranında device objesi yok! Details ekranından geçiş yapılmalı.');
                Alert.alert('Hata', 'Lütfen önce Details ekranından cihaza bağlanın.');
                return;
            }

            // Mevcut kablosuz modu oku
            fetchWirelessMode();
        }
    }, [deviceId]);

    const fetchWirelessMode = async () => {
        try {
            const res = await modbusService.readRegister(48, 1);
            if (res && res.registers) {
                setWirelessType(res.registers[0]);
            }
        } catch (e) {
            console.warn("Kablosuz mod okunamadı:", e.message);
            // Eğer TCP ise zaten Wifi modundadır
            if (modbusService.transport === 'TCP') setWirelessType(2);
        }
    };

    // UI STATE
    const [expandedSection, setExpandedSection] = useState(null);
    const [subSectionState, setSubSectionState] = useState({ seri: true, usb: false, kablosuz: false, role1: true, role2: false, digKalib: false, pass: false });
    const [modalVisible, setModalVisible] = useState(false);
    const [currentOptions, setCurrentOptions] = useState([]);
    const [currentCallback, setCurrentCallback] = useState(null);
    const [loading, setLoading] = useState(false);

    // DATA STATES
    const [commMod, setCommMod] = useState(2);
    const [commId, setCommId] = useState("1");
    const [baudrate, setBaudrate] = useState(3);
    const [dataBit, setDataBit] = useState(1);
    const [parity, setParity] = useState(0);
    const [period, setPeriod] = useState(2);
    const [usbMod, setUsbMod] = useState(0);
    const [usbPeriod, setUsbPeriod] = useState(1);
    const [wirelessType, setWirelessType] = useState(0);
    const [ssid, setSsid] = useState("ESITWIFI");
    const [password, setPassword] = useState("ESIT1234");
    const [ipAddress, setIpAddress] = useState("192.168.137.116");
    const [port, setPort] = useState("23");
    const [ipModalVisible, setIpModalVisible] = useState(false);

    const [r1Ctrl, setR1Ctrl] = useState(1);
    const [r1Val, setR1Val] = useState("1000");
    const [r1Hyst, setR1Hyst] = useState("0");
    const [r1Cont, setR1Cont] = useState(0);
    const [r1OpenDly, setR1OpenDly] = useState(0);
    const [r1CloseDly, setR1CloseDly] = useState(0);
    const [r2Ctrl, setR2Ctrl] = useState(1);
    const [r2Val, setR2Val] = useState("2000");
    const [r2Hyst, setR2Hyst] = useState("0");
    const [r2Cont, setR2Cont] = useState(0);
    const [r2OpenDly, setR2OpenDly] = useState(0);
    const [r2CloseDly, setR2CloseDly] = useState(0);
    const [capacity, setCapacity] = useState("60000");
    const [zeroLimit, setZeroLimit] = useState(2);
    const [dot, setDot] = useState(0);
    const [step, setStep] = useState("1");
    const [unit, setUnit] = useState(0);
    const [stability, setStability] = useState(1);
    const [tareMode, setTareMode] = useState(1);
    const [anaMaxLoad, setAnaMaxLoad] = useState("10000");
    const [anaMinLoad, setAnaMinLoad] = useState("0");
    const [anaMaxMa, setAnaMaxMa] = useState("20.0");
    const [anaMinMa, setAnaMinMa] = useState("4.0");
    const [anaMaxV, setAnaMaxV] = useState("10.0");
    const [anaMinV, setAnaMinV] = useState("0.0");
    const [calibWeight, setCalibWeight] = useState("1000");
    const [digCalType, setDigCalType] = useState(0);
    const [digCalValue, setDigCalValue] = useState("0");
    const [digMvV, setDigMvV] = useState("2.0000");
    const [filterType, setFilterType] = useState(0);
    const [response, setResponse] = useState(0);
    const [vibration, setVibration] = useState(1);
    const [decisionTime, setDecisionTime] = useState(1);
    const [adcHz, setAdcHz] = useState(0);
    const [avgCount, setAvgCount] = useState("10");
    const [lang, setLang] = useState(1);
    const [passMode, setPassMode] = useState(0);
    const [newPass, setNewPass] = useState("111111");

    const toggleSub = (key) => setSubSectionState(prev => ({ ...prev, [key]: !prev[key] }));

    const openModal = (options, callback) => {
        setCurrentOptions(options);
        setCurrentCallback(() => callback);
        setModalVisible(true);
    };

    // TCP Bağlantısı Başlat
    const handleWiFiTransition = async () => {
        setIpModalVisible(false);
        setLoading(true);
        try {
            const trimmedIp = ipAddress.trim();
            const numericPort = parseInt(port) || 502;
            console.log(`[SETTINGS_SCREEN] TCP Geçişi başlatılıyor -> ${trimmedIp}:${numericPort}`);
            // Önce BLE'yi pasif kapat
            await modbusService.safeTeardown(false);

            // Sonra TCP ile bağlan
            const result = await modbusService.connectTCP(trimmedIp, numericPort);
            if (result.success) {
                modbusService.isTransitioningToWiFi = false; // Geçiş tamamlandı
                Alert.alert("✓ Başarılı", "WiFi üzerinden TCP bağlantısı kuruldu. Tartım ekranına dönülüyor.");
                router.replace({ pathname: "/details", params: { deviceId, deviceName: "WiFi Cihazı", transport: "TCP", ip: ipAddress } });
            }
        } catch (err) {
            console.error("❌ TCP Geçiş Hatası:", err);
            modbusService.isTransitioningToWiFi = false; // Hata durumunda bayrağı indir
            Alert.alert("❌ TCP Bağlantı Hatası", err.message);
        } finally {
            setLoading(false);
        }
    };

    // Yardımcı: Register Yazma (GUI için)
    const writeRegisterUI = async (address, value, is32Bit = false) => {
        const isTCP = modbusService.transport === 'TCP';

        // ÖZEL DURUM: Kablosuz mod değişikliği (Adres 48)
        if (address === 48) {
            if (isTCP && value === 1) { // WiFi'den BLE'ye geçiş
                Alert.alert(
                    "Kablosuz Mod Değişimi",
                    "Cihaz Bluetooth moduna geçirilecek. Mevcut WiFi bağlantısı kesilecek ve uygulama ana ekrana dönecektir. Onaylıyor musunuz?",
                    [
                        { text: "İptal", style: "cancel" },
                        {
                            text: "Evet, Değiştir",
                            onPress: async () => {
                                try {
                                    setLoading(true);
                                    await modbusService.writeRegister(48, 1);
                                    // 2 saniye bekle cihazın modu değişsin
                                    setTimeout(() => {
                                        modbusService.safeTeardown(true);
                                        router.replace('/');
                                        Alert.alert("Başarılı", "Cihaz BLE moduna alındı. Lütfen BLE ile tekrar tarama yapın.");
                                    }, 2000);
                                } catch (e) {
                                    Alert.alert("Hata", "Mod değiştirilemedi: " + e.message);
                                } finally {
                                    setLoading(false);
                                }
                            }
                        }
                    ]
                );
                return;
            }
        }

        setLoading(true);
        try {
            if (is32Bit) {
                const intVal = Math.round(parseFloat(value.toString().replace(',', '.')));
                const [high, low] = splitInt32(intVal);
                await modbusService.writeRegisters(address, [high, low]);
            } else {
                await modbusService.writeRegister(address, parseInt(value));
            }
            Alert.alert("✓ Başarılı", `Değer yazıldı (Adres: ${address})`);
        } catch (err) {
            Alert.alert("❌ Hata", err.message);
        } finally {
            setLoading(false);
        }
    };

    // WiFi SSID Yazma
    const handleSetSSID = async () => {
        setLoading(true);
        try {
            await modbusService.writeWiFiSSID(ssid);
            modbusService.isTransitioningToWiFi = true; // Geçiş başladı
            Alert.alert(
                "✓ Başarılı",
                "SSID başarıyla yazıldı. Şimdi WiFi moduna geçtikten sonra cihaz ekranındaki IP ile bağlanmak ister misiniz?",
                [
                    { text: "Daha Sonra", style: "cancel" },
                    { text: "IP ile Bağlan", onPress: () => setIpModalVisible(true) }
                ]
            );
        } catch (err) {
            Alert.alert("❌ Hata", err.message);
        } finally {
            setLoading(false);
        }
    };

    // WiFi Şifre Yazma
    const handleSetPassword = async () => {
        setLoading(true);
        try {
            await modbusService.writeWiFiPassword(password);
            modbusService.isTransitioningToWiFi = true; // Geçiş başladı
            Alert.alert(
                "✓ Başarılı",
                "Şifre başarıyla yazıldı. Bağlantıyı TCP üzerinden sürdürmek için IP girin.",
                [
                    { text: "Kapat", style: "cancel" },
                    { text: "IP Gir", onPress: () => setIpModalVisible(true) }
                ]
            );
        } catch (err) {
            Alert.alert("❌ Hata", err.message);
        } finally {
            setLoading(false);
        }
    };

    // İç Sayım Oku (mV/V)
    const [mvvValue, setMvvValue] = useState("0.0000");
    const handleReadInternal = async () => {
        setLoading(true);
        try {
            // mV/V değeri Register 32'dedir (R32)
            const res = await modbusService.readRegister(32, 2);
            if (res && res.registers && res.registers.length >= 2) {
                // High word (R32) ve Low word (R33) birleştirilir
                const val = (res.registers[0] << 16) | res.registers[1];
                setMvvValue((val / 100000).toFixed(4));
                console.log("mV/V değeri: ", mvvValue);
            } else {
                Alert.alert("❌ Hata", "Veri okunamadı.");
            }
        } catch (err) {
            Alert.alert("❌ Hata", err.message);
        } finally {
            setLoading(false);
        }
    };

    // Yardımcı: 32-bit Ayırma
    const splitInt32 = (value) => {
        const high = (value >> 16) & 0xffff;
        const low = value & 0xffff;
        return [high, low];
    };

    return (
        <View style={styles.container}>
            {loading && <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#000" /></View>}
            <ScrollView>
                <AccordionHeader title="Haberleşme" sectionId="1" expandedSection={expandedSection} setExpandedSection={setExpandedSection} />
                {expandedSection === "1" && (
                    <View style={styles.sectionContent}>
                        <SubHeader title="1.1 Seri" isOpen={subSectionState.seri} onToggle={() => toggleSub('seri')} />
                        {subSectionState.seri && (
                            <View style={styles.subSection}>
                                <DropdownRow label="1.1.1 Mod" value={commMod} options={OPTIONS.mod} onSelect={setCommMod} onSet={() => writeRegisterUI(34, commMod)} openModal={openModal} />
                                {commMod === 2 && <SettingRow label="1.1.2 Cihaz ID" value={commId} onChange={setCommId} onSet={() => writeRegisterUI(35, commId)} />}
                                <DropdownRow label="1.1.3 Hız" value={baudrate} options={OPTIONS.baudrate} onSelect={setBaudrate} onSet={() => writeRegisterUI(36, baudrate)} openModal={openModal} />
                                <DropdownRow label="1.1.4 Bit" value={dataBit} options={OPTIONS.bit} onSelect={setDataBit} onSet={() => writeRegisterUI(37, dataBit)} openModal={openModal} />
                                <DropdownRow label="1.1.5 Denklik" value={parity} options={OPTIONS.parity} onSelect={setParity} onSet={() => writeRegisterUI(38, parity)} openModal={openModal} />
                                <DropdownRow label="1.1.6 Periyot" value={period} options={OPTIONS.period} onSelect={setPeriod} onSet={() => writeRegisterUI(39, period)} openModal={openModal} />
                            </View>
                        )}
                        <SubHeader title="1.2 USB" isOpen={subSectionState.usb} onToggle={() => toggleSub('usb')} />
                        {subSectionState.usb && (
                            <View style={styles.subSection}>
                                <DropdownRow label="1.2.1 Mod" value={usbMod} options={OPTIONS.usbMod} onSelect={setUsbMod} onSet={() => writeRegisterUI(46, usbMod)} openModal={openModal} />
                                {usbMod === 1 && <DropdownRow label="1.2.2 Periyot" value={usbPeriod} options={OPTIONS.usbPeriod} onSelect={setUsbPeriod} onSet={() => writeRegisterUI(47, usbPeriod)} openModal={openModal} />}
                            </View>
                        )}


                        <SubHeader title="1.3 Kablosuz" isOpen={subSectionState.kablosuz} onToggle={() => toggleSub('kablosuz')} />
                        {subSectionState.kablosuz && (
                            <View style={styles.subSection}>
                                {modbusService.transport === 'TCP' ? (
                                    <View style={[styles.infoBox, { backgroundColor: '#E3F2FD', borderColor: '#2196F3', borderWidth: 1, marginBottom: 10 }]}>
                                        <Text style={[styles.infoText, { color: '#0D47A1', fontWeight: 'bold' }]}>
                                            ✓ Cihaz şu an WiFi modundadır.
                                        </Text>
                                    </View>
                                ) : null}

                                <DropdownRow
                                    label="1.3 Kablosuz Tip"
                                    value={wirelessType}
                                    options={modbusService.transport === 'TCP'
                                        ? OPTIONS.wirelessType.map(o => o.value === 2 ? { ...o, label: 'Wifi (Aktif)' } : o)
                                        : OPTIONS.wirelessType
                                    }
                                    onSelect={setWirelessType}
                                    onSet={() => writeRegisterUI(48, wirelessType)}
                                    openModal={openModal}
                                />

                                {wirelessType === 2 && (
                                    <>
                                        <SettingRow label="SSID" value={ssid} onChange={setSsid} onSet={handleSetSSID} keyboardType="default" />
                                        <SettingRow label="Şifre" value={password} onChange={setPassword} onSet={handleSetPassword} keyboardType="default" />
                                    </>
                                )}
                                {wirelessType === 1 && (
                                    <View style={styles.infoBox}>
                                        <Text style={styles.infoText}>
                                            {modbusService.transport === 'BLE'
                                                ? "Şu an Bluetooth uygulama ile bağlısınız."
                                                : "Bluetooth moduna geçmek için SET butonuna basın."}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}


                    </View>
                )}

                <AccordionHeader title="Röleler" sectionId="2" expandedSection={expandedSection} setExpandedSection={setExpandedSection} />
                {expandedSection === "2" && (
                    <View style={styles.sectionContent}>
                        <SubHeader title="2.1 Röle 1" isOpen={subSectionState.role1} onToggle={() => toggleSub('role1')} />
                        {subSectionState.role1 && (
                            <View style={styles.subSection}>
                                <DropdownRow label="2.1.1 Kontrol" value={r1Ctrl} options={OPTIONS.relayControl} onSelect={setR1Ctrl} onSet={() => writeRegisterUI(74, r1Ctrl)} openModal={openModal} />

                                {r1Ctrl === 1 && (
                                    <>
                                        <SettingRow label="2.1.2 Değer (kg)" value={r1Val} onChange={setR1Val} onSet={() => writeRegisterUI(75, r1Val, true)} />
                                        <SettingRow label="2.1.3 Histerisis (kg)" value={r1Hyst} onChange={setR1Hyst} onSet={() => writeRegisterUI(77, r1Hyst, true)} />
                                        <DropdownRow label="2.1.4 Kontak Durumu" value={r1Cont} options={OPTIONS.relayContact} onSelect={setR1Cont} onSet={() => writeRegisterUI(79, r1Cont)} openModal={openModal} />
                                        <DropdownRow label="2.1.5 Açma Gecikmesi" value={r1OpenDly} options={OPTIONS.relayDelay} onSelect={setR1OpenDly} onSet={() => writeRegisterUI(80, r1OpenDly)} openModal={openModal} />
                                        <DropdownRow label="2.1.6 Kapatma Gecikmesi" value={r1CloseDly} options={OPTIONS.relayDelay} onSelect={setR1CloseDly} onSet={() => writeRegisterUI(81, r1CloseDly)} openModal={openModal} />
                                    </>
                                )}

                                {r1Ctrl === 0 && (
                                    <View style={styles.infoBox}>
                                        <Text style={styles.infoText}>Modbus kontrolünde iken röleler doğrudan Modbus komutlarıyla açılıp kapatılır.</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        <SubHeader title="2.2 Röle 2" isOpen={subSectionState.role2} onToggle={() => toggleSub('role2')} />
                        {subSectionState.role2 && (
                            <View style={styles.subSection}>
                                <DropdownRow label="2.2.1 Kontrol" value={r2Ctrl} options={OPTIONS.relayControl} onSelect={setR2Ctrl} onSet={() => writeRegisterUI(82, r2Ctrl)} openModal={openModal} />

                                {r2Ctrl === 1 && (
                                    <>
                                        <SettingRow label="2.2.2 Değer (kg)" value={r2Val} onChange={setR2Val} onSet={() => writeRegisterUI(83, r2Val, true)} />
                                        <SettingRow label="2.2.3 Histerisis (kg)" value={r2Hyst} onChange={setR2Hyst} onSet={() => writeRegisterUI(85, r2Hyst, true)} />
                                        <DropdownRow label="2.2.4 Kontak Durumu" value={r2Cont} options={OPTIONS.relayContact} onSelect={setR2Cont} onSet={() => writeRegisterUI(87, r2Cont)} openModal={openModal} />
                                        <DropdownRow label="2.2.5 Açma Gecikmesi" value={r2OpenDly} options={OPTIONS.relayDelay} onSelect={setR2OpenDly} onSet={() => writeRegisterUI(88, r2OpenDly)} openModal={openModal} />
                                        <DropdownRow label="2.2.6 Kapatma Gecikmesi" value={r2CloseDly} options={OPTIONS.relayDelay} onSelect={setR2CloseDly} onSet={() => writeRegisterUI(89, r2CloseDly)} openModal={openModal} />
                                    </>
                                )}

                                {r2Ctrl === 0 && (
                                    <View style={styles.infoBox}>
                                        <Text style={styles.infoText}>Modbus kontrolünde iken röleler doğrudan Modbus komutlarıyla açılıp kapatılır.</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                )}




                <AccordionHeader title="Tartı" sectionId="3" expandedSection={expandedSection} setExpandedSection={setExpandedSection} />
                {expandedSection === "3" && (
                    <View style={styles.sectionContent}>
                        <SettingRow label="3.1 Kapasite" value={capacity} onChange={setCapacity} onSet={() => writeRegisterUI(113, capacity, true)} />
                        <DropdownRow label="3.2 Sıfır Limit" value={zeroLimit} options={OPTIONS.zeroLimit} onSelect={setZeroLimit} onSet={() => writeRegisterUI(115, zeroLimit)} openModal={openModal} />

                        <SubHeader title="3.3 Çözünürlük" isOpen={subSectionState.resolution} onToggle={() => setSubSectionState(p => ({ ...p, resolution: !p.resolution }))} />
                        {subSectionState.resolution && (
                            <View style={styles.subSection}>
                                <SettingRow label="3.3.1 Çarpan (Dot)" value={dot} onChange={(v) => setDot(parseInt(v) || 0)} onSet={() => writeRegisterUI(116, dot)} />
                                <SettingRow label="3.3.2 Adım (Step)" value={step} onChange={setStep} onSet={() => writeRegisterUI(117, step)} />
                            </View>
                        )}

                        <DropdownRow label="3.4 Birim" value={unit} options={OPTIONS.unit} onSelect={setUnit} onSet={() => writeRegisterUI(119, unit)} openModal={openModal} />
                        <DropdownRow label="3.5 Hareketsizlik" value={stability} options={OPTIONS.stability} onSelect={setStability} onSet={() => writeRegisterUI(120, stability)} openModal={openModal} />

                        <ActionRow label={`3.6 İç Sayım: ${mvvValue} mV/V`} btnText="OKU" onPress={handleReadInternal} />

                        <DropdownRow label="3.7 Dara" value={tareMode} options={OPTIONS.tare} onSelect={setTareMode} onSet={() => writeRegisterUI(121, tareMode)} openModal={openModal} />
                    </View>
                )}




                <AccordionHeader title="Analog" sectionId="4" expandedSection={expandedSection} setExpandedSection={setExpandedSection} />
                {expandedSection === "4" && (
                    <View style={styles.sectionContent}>
                        <View style={styles.infoBox}>
                            <Text style={styles.infoText}>
                                ⚠️ Analog çıkışın türü (Akım veya voltaj) kart üzerindeki tuş konumu ile ayarlanmaktadır.
                                Bu ayar yapılırken cihazın çalışmıyor olması gerekmektedir.
                            </Text>
                        </View>

                        <SettingRow label="4.1 Yük Maks" value={anaMaxLoad} onChange={setAnaMaxLoad} onSet={() => writeRegisterUI(91, parseFloat(anaMaxLoad) * 1000, true)} />
                        <SettingRow label="4.2 Yük Min" value={anaMinLoad} onChange={setAnaMinLoad} onSet={() => writeRegisterUI(93, parseFloat(anaMinLoad) * 1000, true)} />

                        <View style={styles.divider} />

                        <SettingRow label="4.3 mA maks (Maks: 21.5)" value={anaMaxMa} onChange={setAnaMaxMa} onSet={() => writeRegisterUI(95, parseFloat(anaMaxMa) * 1000, true)} />
                        <SettingRow label="4.4 mA min (Min: 0)" value={anaMinMa} onChange={setAnaMinMa} onSet={() => writeRegisterUI(97, parseFloat(anaMinMa) * 1000, true)} />

                        <View style={styles.divider} />

                        <SettingRow label="4.5 V maks (Maks: 11.5)" value={anaMaxV} onChange={setAnaMaxV} onSet={() => writeRegisterUI(124, parseFloat(anaMaxV) * 1000, true)} />
                        <SettingRow label="4.6 V min (Min: 0)" value={anaMinV} onChange={setAnaMinV} onSet={() => writeRegisterUI(126, parseFloat(anaMinV) * 1000, true)} />
                    </View>
                )}




                <AccordionHeader title="Kalibrasyon" sectionId="5" expandedSection={expandedSection} setExpandedSection={setExpandedSection} />
                {expandedSection === "5" && (
                    <View style={styles.sectionContent}>
                        <View style={styles.infoBox}>
                            <Text style={styles.infoText}>
                                ℹ️ {lang === 1 ? "Kalibrasyon ayarları için indikatörün stabil olması gerekmektedir." : "Indicator must be stable for calibration settings."}
                            </Text>
                        </View>

                        <ActionRow label="5.1 Sıfır Kalibrasyonu" btnText="Sıfırla" onPress={() => {
                            Alert.alert(
                                "5.1 Sıfır Kalibrasyonu",
                                "Yük Hücresi üzerindeki yükü sıfır yapın ve onaylayın.",
                                [
                                    { text: 'İptal', style: 'cancel' },
                                    {
                                        text: 'Onayla (ENTER)',
                                        onPress: () => {
                                            modbusService.calibrationZero()
                                                .then(() => Alert.alert("✓ Başarılı", "Sıfır kalibrasyonu başlatıldı. ~10sn bekleyin."))
                                                .catch(err => Alert.alert("❌ Hata", err.message));
                                        }
                                    }
                                ]
                            );
                        }} />
                        <View style={styles.divider} />

                        <View style={{ marginTop: 10 }}>
                            <Text style={styles.subHeader}>5.2 Yük Kalibrasyonu</Text>
                            <SettingRow label="Yük Değeri (kg)" value={calibWeight} onChange={setCalibWeight} onSet={() => { }} />
                            <TouchableOpacity style={styles.fullWidthButton} onPress={() => {
                                Alert.alert(
                                    "5.2 Yük Kalibrasyonu",
                                    `${calibWeight} kg yükü yükleyin ve onaylayın.`,
                                    [
                                        { text: 'İptal', style: 'cancel' },
                                        {
                                            text: 'Onayla (ENTER)',
                                            onPress: () => {
                                                modbusService.calibrationLoad(parseFloat(calibWeight))
                                                    .then(() => Alert.alert("✓ Başarılı", "Yük kalibrasyonu başlatıldı. ~10sn bekleyin."))
                                                    .catch(err => Alert.alert("❌ Hata", err.message));
                                            }
                                        }
                                    ]
                                );
                            }}>
                                <Text style={styles.actionText}>BAŞLAT</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.divider} />

                        <View style={{ marginTop: 10 }}>
                            <Text style={styles.subHeader}>5.3 Dijital Kalibrasyon</Text>
                            <DropdownRow label="5.3.1 Tür" value={digCalType} options={OPTIONS.calibType} onSelect={setDigCalType} onSet={() => { }} openModal={openModal} />
                            <SettingRow label="5.3.2 Kapasite (kg)" value={capacity} onChange={setCapacity} onSet={() => { }} />
                            <SettingRow label={digCalType === 0 ? "5.3.3 Ağırlık (kg)" : "5.3.3 Dara (kg)"} value={digCalValue} onChange={setDigCalValue} onSet={() => { }} />
                            <SettingRow label="5.3.4 mV/V" value={digMvV} onChange={setDigMvV} onSet={() => { }} />

                            <TouchableOpacity style={styles.fullWidthButton} onPress={() => {
                                Alert.alert(
                                    "5.3 Dijital Kalibrasyon",
                                    "Girilen değerlerle dijital kalibrasyon yapılacaktır. Onaylıyor musunuz?",
                                    [
                                        { text: 'İptal', style: 'cancel' },
                                        {
                                            text: 'Onayla (ENTER)',
                                            onPress: () => {
                                                modbusService.calibrationDigital(parseFloat(capacity), parseFloat(digCalValue), parseFloat(digMvV))
                                                    .then(() => Alert.alert("✓ Başarılı", "Dijital kalibrasyon tamamlandı."))
                                                    .catch(err => Alert.alert("❌ Hata", err.message));
                                            }
                                        }
                                    ]
                                );
                            }}>
                                <Text style={styles.actionText}>KALİBRE ET</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}






                <AccordionHeader title="Filtre" sectionId="6" expandedSection={expandedSection} setExpandedSection={setExpandedSection} />
                {expandedSection === "6" && (
                    <View style={styles.sectionContent}>
                        <DropdownRow label="6.1 Filtre Ayarı" value={filterType} options={OPTIONS.filterType} onSelect={setFilterType} onSet={() => writeRegisterUI(107, filterType)} openModal={openModal} />

                        {/* KAPALI: ADCHZ, Karar Süresi */}
                        {filterType === 0 && (
                            <>
                                <DropdownRow label="6.1.4 ADC Hz" value={adcHz} options={OPTIONS.adcHz} onSelect={setAdcHz} onSet={() => writeRegisterUI(108, adcHz)} openModal={openModal} />
                                <DropdownRow label="6.1.3 Karar Süresi" value={decisionTime} options={OPTIONS.decisionTime} onSelect={setDecisionTime} onSet={() => writeRegisterUI(111, decisionTime)} openModal={openModal} />
                            </>
                        )}

                        {/* ÖZEL: Tepki Süresi, Titreşim, Karar Süresi */}
                        {filterType === 1 && (
                            <>
                                <DropdownRow label="6.1.1 Tepki Süresi" value={response} options={OPTIONS.responseTime} onSelect={setResponse} onSet={() => writeRegisterUI(109, response)} openModal={openModal} />
                                <DropdownRow label="6.1.2 Titreşim" value={vibration} options={OPTIONS.vibration} onSelect={setVibration} onSet={() => writeRegisterUI(110, vibration)} openModal={openModal} />
                                <DropdownRow label="6.1.3 Karar Süresi" value={decisionTime} options={OPTIONS.decisionTime} onSelect={setDecisionTime} onSet={() => writeRegisterUI(111, decisionTime)} openModal={openModal} />
                            </>
                        )}

                        {/* HAREKETLİ ORTALAMA: ADC Hz, Ortalama Adet, Karar Süresi */}
                        {filterType === 2 && (
                            <>
                                <DropdownRow label="6.1.4 ADC Hz" value={adcHz} options={OPTIONS.adcHz} onSelect={setAdcHz} onSet={() => writeRegisterUI(108, adcHz)} openModal={openModal} />
                                <DropdownRow label="6.1.5 Ortalama Adet" value={parseInt(avgCount) || 0} options={OPTIONS.avgCount} onSelect={setAvgCount} onSet={() => writeRegisterUI(112, avgCount)} openModal={openModal} />
                                <DropdownRow label="6.1.3 Karar Süresi" value={decisionTime} options={OPTIONS.decisionTime} onSelect={setDecisionTime} onSet={() => writeRegisterUI(111, decisionTime)} openModal={openModal} />
                            </>
                        )}
                    </View>
                )}






                <AccordionHeader title="Genel" sectionId="7" expandedSection={expandedSection} setExpandedSection={setExpandedSection} />
                {expandedSection === "7" && (
                    <View style={styles.sectionContent}>
                        <DropdownRow label="7.1 Dil" value={lang} options={OPTIONS.language} onSelect={setLang} onSet={() => writeRegisterUI(122, lang)} openModal={openModal} />

                        <SubHeader title="7.2 Şifre" isOpen={subSectionState.pass} onToggle={() => setSubSectionState(p => ({ ...p, pass: !p.pass }))} />
                        {subSectionState.pass && (
                            <View style={styles.subSection}>
                                <DropdownRow label="7.2.1 Mod" value={passMode} options={OPTIONS.passwordMode} onSelect={setPassMode} onSet={() => writeRegisterUI(123, passMode)} openModal={openModal} />
                                <SettingRow label="7.2.2 Yeni Şifre" value={newPass} onChange={setNewPass} onSet={() => writeRegisterUI(137, newPass, true)} />
                            </View>
                        )}

                        <ActionRow label="7.3 Fabrika Ayarları" btnText="SIFIRLA" onPress={() => {
                            Alert.alert(
                                "7.3 Fabrika Ayarları",
                                "Kalibrasyon dışındaki tüm parametreler varsayılana dönecektir. Emin misiniz?",
                                [
                                    { text: 'İptal', style: 'cancel' },
                                    {
                                        text: 'Evet, Sıfırla',
                                        onPress: () => {
                                            modbusService.factoryReset().catch(() => { });
                                            router.replace('/');
                                        },
                                        style: 'destructive'
                                    }
                                ]
                            );
                        }} />

                        <ActionRow label="7.4 & 7.5 Cihaz Bilgileri" btnText="OKU" onPress={() => {
                            Promise.all([
                                modbusService.readSerialNumber(),
                                modbusService.readFirmwareVersion()
                            ])
                                .then(([serial, firmware]) => {
                                    Alert.alert(
                                        "ℹ️ Bilgiler",
                                        `7.4 Seri No: ${serial}\n7.5 Versiyon: v${(firmware / 100).toFixed(2)}`
                                    );
                                })
                                .catch(err => Alert.alert("❌ Hata", err.message));
                        }} />

                        <View style={styles.divider} />

                        <ActionRow label="Sistem Yeniden Başlat" btnText="BAŞLAT" onPress={() => {
                            Alert.alert(
                                "Yeniden Başlat",
                                "Cihaz yeniden kapatılıp açılacaktır. Onaylıyor musunuz?",
                                [
                                    { text: 'İptal', style: 'cancel' },
                                    {
                                        text: 'Başlat',
                                        onPress: () => {
                                            modbusService.restart().catch(() => { });
                                            router.replace('/');
                                        }
                                    }
                                ]
                            );
                        }} />
                    </View>
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            <Modal visible={modalVisible} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}><View style={styles.modalContent}>
                    <FlatList data={currentOptions} keyExtractor={(item) => item.value.toString()} renderItem={({ item }) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => { currentCallback(item.value); setModalVisible(false); }}><Text style={styles.modalText}>{item.label}</Text></TouchableOpacity>
                    )} />
                    <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}><Text style={{ color: 'white' }}>Kapat</Text></TouchableOpacity>
                </View></View>
            </Modal>

            {/* IP Giriş Modalı */}
            <Modal visible={ipModalVisible} transparent={true} animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>IP Adresi Girin</Text>
                        <Text style={styles.infoText}>Cihaz ekranında görünen IP adresini yazın.</Text>
                        <Text style={{ fontSize: 12, color: '#666', marginBottom: 2, marginTop: 10 }}>IP Adresi:</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={ipAddress}
                            onChangeText={setIpAddress}
                            keyboardType="numeric"
                            placeholder="192.168.137.116"
                        />

                        <Text style={{ fontSize: 12, color: '#666', marginBottom: 2, marginTop: 10 }}>Port (Varsayılan: 502):</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={port}
                            onChangeText={setPort}
                            keyboardType="numeric"
                            placeholder="502"
                        />

                        <View style={{ backgroundColor: '#FFF9C4', padding: 8, borderRadius: 5, marginTop: 15, marginBottom: 10 }}>
                            <Text style={{ fontSize: 11, color: '#F57F17' }}>
                                ⚠️ "Host unreachable" alıyorsanız: Telefonunuzun Mobil Verisini kapatın ve cihazla aynı ağda olduğunuzdan emin olun.
                            </Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                            <TouchableOpacity style={[styles.closeButton, { flex: 1, backgroundColor: '#757575' }]} onPress={() => setIpModalVisible(false)}>
                                <Text style={{ color: 'white' }}>İptal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.closeButton, { flex: 1, backgroundColor: '#4CAF50' }]} onPress={handleWiFiTransition}>
                                <Text style={{ color: 'white' }}>Bağlan</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            {/* Teşhis Bilgisi */}
            <View style={{ padding: 10, backgroundColor: '#f0f0f0', borderTopWidth: 1, borderTopColor: '#ddd', width: '100%' }}>
                <Text style={{ fontSize: 10, color: '#888', textAlign: 'center' }}>
                    Tel IP (Metro): {Constants.expoConfig?.hostUri || 'Bilinmiyor'} | Mod: {modbusService.transport === 'TCP' ? 'WiFi' : 'BLE'}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    accordionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#000' },
    accordionTitle: { fontSize: 22, fontWeight: 'bold', color: '#000' },
    iconText: { fontSize: 24, fontWeight: 'bold', color: '#555' },
    subHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 5, backgroundColor: '#FFFFFF', paddingRight: 10 },
    subHeaderText: { fontSize: 16, color: '#000', flex: 1 },
    miniButton: { backgroundColor: '#E0E0E0', width: 60, height: 35, justifyContent: 'center', alignItems: 'center', borderRadius: 3, borderWidth: 1, borderColor: '#BDBDBD' },
    miniButtonText: { fontSize: 20, fontWeight: 'bold' },
    subSection: { marginBottom: 10 },
    sectionContent: { padding: 10 },
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'space-between' },
    label: { flex: 1, fontSize: 16, color: '#000' },
    input: { borderWidth: 1, borderColor: '#CCC', borderRadius: 2, padding: 5, width: 100, backgroundColor: '#F5F5F5' },
    dropdown: { borderWidth: 1, borderColor: '#CCC', borderRadius: 2, padding: 8, width: 120, backgroundColor: '#D1D1D1', flexDirection: 'row', justifyContent: 'space-between' },
    dropdownText: { fontSize: 14 },
    setButton: { backgroundColor: '#D1D1D1', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 2, borderWidth: 1, borderColor: '#BBB' },
    setText: { fontWeight: 'bold' },
    infoBox: { padding: 10, backgroundColor: '#f5f5f5', borderRadius: 4, marginTop: 5 },
    infoText: { fontSize: 12, color: '#666', fontStyle: 'italic' },
    actionButton: { backgroundColor: '#D1D1D1', padding: 8, borderRadius: 2, borderWidth: 1, borderColor: '#BBB' },
    actionText: { fontWeight: 'bold', fontSize: 12 },
    fullWidthButton: { backgroundColor: '#D1D1D1', padding: 12, borderRadius: 2, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#BBB' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '80%', backgroundColor: '#fff', borderRadius: 10, padding: 20, maxHeight: '60%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
    modalItem: { padding: 15, borderBottomWidth: 1, borderColor: '#eee' },
    modalText: { fontSize: 16, color: 'black' },
    modalInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, width: '100%', marginBottom: 10, fontSize: 16, backgroundColor: '#f9f9f9', color: '#000' },
    closeButton: { marginTop: 15, backgroundColor: '#F44336', padding: 10, alignItems: 'center', borderRadius: 5 }
});
