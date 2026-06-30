import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import modbusService from '../services/modbusService';
import { combineInt32, REGISTERS, splitInt32 } from '../services/modbusUtils';

// --- SABİT TANIMLAMALAR ---
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

const OPTIONS = {
    mod: [{ label: 'Kapalı', value: 0 }, { label: 'Sürekli', value: 1 }, { label: 'Modbus', value: 2 }],
    baudrate: [{ label: '1200', value: 0 }, { label: '2400', value: 1 }, { label: '4800', value: 2 }, { label: '9600', value: 3 }, { label: '19200', value: 4 }, { label: '38400', value: 5 }, { label: '57600', value: 6 }, { label: '115200', value: 7 }],
    bit: [{ label: '7 bit', value: 0 }, { label: '8 bit', value: 1 }],
    parity: [{ label: 'Yok', value: 0 }, { label: 'Çift', value: 1 }, { label: 'Tek', value: 2 }],
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
            // Tüm ayarları tazele
            refreshAllSettings();
        }
    }, [deviceId]);

    const [isSyncing, setIsSyncing] = useState(false);

    const refreshAllSettings = async () => {
        setLoading(true);
        setIsSyncing(true);
        try {
            console.log("[SETTINGS] 🔄 Cihaz ayarları senkronize ediliyor...");

            // 1. Seri Haberleşme & USB & Wireless (R34 - R48)
            const res1 = await modbusService.readRegister(REGISTERS.COMM_MODE, 15);
            if (res1.success && res1.registers) {
                setCommMod(res1.registers[0]);
                setCommId(res1.registers[1].toString());
                setBaudrate(res1.registers[2]);
                setDataBit(res1.registers[3]);
                setParity(res1.registers[4]);
                // R46, R47, R48
                setUsbMod(res1.registers[12]);
                setUsbPeriod(res1.registers[13]);
                setWirelessType(res1.registers[14]);
            }

            // 2. Röle Ayarları (R74 - R81)
            const res2 = await modbusService.readRegister(REGISTERS.RELAY1_CONTROL, 8);
            if (res2.success && res2.registers) {
                setR1Ctrl(res2.registers[0]);
                setR1Val(combineInt32(res2.registers[1], res2.registers[2]).toString());
                setR1Hyst(res2.registers[3].toString());
                setR1Cont(res2.registers[5]);
                setR1OpenDly(res2.registers[6]);
                setR1CloseDly(res2.registers[7]);
            }

            // 3. Röle 2 Ayarları (R82 - R89)
            const resRelay2 = await modbusService.readRegister(REGISTERS.RELAY2_CONTROL, 8);
            if (resRelay2.success && resRelay2.registers) {
                setR2Ctrl(resRelay2.registers[0]);
                setR2Val(combineInt32(resRelay2.registers[1], resRelay2.registers[2]).toString());
                setR2Hyst(resRelay2.registers[3].toString());
                setR2Cont(resRelay2.registers[5]);
                setR2OpenDly(resRelay2.registers[6]);
                setR2CloseDly(resRelay2.registers[7]);
            }

            // 4. Filtre Ayarları (R107 - R112)
            const res3 = await modbusService.readRegister(REGISTERS.FILTER_TYPE, 6);
            if (res3.success && res3.registers) {
                setFilterType(res3.registers[0]);
                setAdcHz(res3.registers[1]);
                setAvgCount(res3.registers[2].toString());
                setResponse(res3.registers[3]);
                setVibration(res3.registers[4]);
                setDecisionTime(res3.registers[5]);
            }

            // 4. Kapasite, Nokta, Birim (R113 - R123)
            const res4 = await modbusService.readRegister(REGISTERS.MAX_CAPACITY, 11);
            if (res4.success && res4.registers) {
                setCapacity(combineInt32(res4.registers[0], res4.registers[1]).toString());
                setZeroLimit(res4.registers[2]);
                setStep(res4.registers[4].toString());
                setDot(res4.registers[5]);
                setUnit(res4.registers[6]);
                setStability(res4.registers[7]);
                setTareMode(res4.registers[8]);
                setLang(res4.registers[9]);
                setPassMode(res4.registers[10]);
            }

            console.log("[SETTINGS] ✅ Senkronizasyon tamamlandı.");
        } catch (error) {
            console.warn("[SETTINGS] ❌ Senkronizasyon hatası:", error.message);
            // Alert.alert("Uyarı", "Bazı ayarlar okunamadı, varsayılanlar gösteriliyor.");
        } finally {
            setLoading(false);
            setIsSyncing(false);
        }
    };

    const fetchWirelessMode = async () => {
        try {
            const res = await modbusService.readRegister(REGISTERS.WIRELESS_TYPE, 1);
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
    const [usbMod, setUsbMod] = useState(0);
    const [usbPeriod, setUsbPeriod] = useState(1);
    const [wirelessType, setWirelessType] = useState(0);
    const [ssid, setSsid] = useState("MOCKWIFI");
    const [password, setPassword] = useState("MOCK1234");
    const [ipAddress, setIpAddress] = useState("192.168.1.100");
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

    // PROFILE STATES
    const [profiles, setProfiles] = useState([]);
    const [profileName, setProfileName] = useState("");
    const [saveModalVisible, setSaveModalVisible] = useState(false);
    const [isApplyingProfile, setIsApplyingProfile] = useState(false);

    useEffect(() => {
        loadProfilesFromStorage();
    }, []);

    const loadProfilesFromStorage = async () => {
        try {
            const stored = await AsyncStorage.getItem('settings_profiles');
            if (stored) setProfiles(JSON.parse(stored));
        } catch (e) { console.error("Profiller yüklenemedi:", e); }
    };

    const handleSaveProfile = async () => {
        if (!profileName.trim()) {
            Alert.alert("Hata", "Lütfen bir profil ismi girin.");
            return;
        }

        const newProfile = {
            id: Date.now().toString(),
            name: profileName,
            data: {
                commMod, commId, baudrate, dataBit, parity,
                usbMod, usbPeriod, wirelessType,
                r1Ctrl, r1Val, r1Hyst, r1Cont, r1OpenDly, r1CloseDly,
                r2Ctrl, r2Val, r2Hyst, r2Cont, r2OpenDly, r2CloseDly,
                capacity, zeroLimit, dot, step, unit, stability, tareMode,
                filterType, response, vibration, decisionTime, adcHz, avgCount,
                lang, passMode
            }
        };

        const updated = [...profiles, newProfile];
        setProfiles(updated);
        await AsyncStorage.setItem('settings_profiles', JSON.stringify(updated));
        setSaveModalVisible(false);
        setProfileName("");
        Alert.alert("Başarılı", `${profileName} profili kaydedildi.`);
    };

    const handleDeleteProfile = async (id) => {
        if (loading) return;
        const updated = profiles.filter(p => p.id !== id);
        setProfiles(updated);
        await AsyncStorage.setItem('settings_profiles', JSON.stringify(updated));
    };

    const [isProcessingProfile, setIsProcessingProfile] = useState(false);

    const handleApplyProfile = async (profile) => {
        if (loading || isProcessingProfile) return;
        Alert.alert(
            "Profili Uygula",
            `'${profile.name}' profilindeki tüm ayarlar cihaza yazılacaktır. Bu işlem yaklaşık 10-15 saniye sürebilir. Başlıyoruz?`,
            [
                { text: "Vazgeç", style: "cancel" },
                {
                    text: "Uygula",
                    onPress: async () => {
                        setLoading(true);
                        setIsApplyingProfile(true);
                        setIsProcessingProfile(true);
                        try {
                            const d = profile.data;
                            console.log(`[PROFILES] 🔄 '${profile.name}' uygulanıyor...`);

                            // Merkezi servisi kullanarak tüm ayarları yaz
                            await modbusService.applyProfileData(d, (progress) => {
                                // İstersen burada progress bar güncelleyebilirsin
                                // Şimdilik loading overlay yeterli
                            });

                            Alert.alert("✓ Başarılı", "Profil başarıyla uygulandı.");
                            // UI State'leri de güncelle
                            await refreshAllSettings();
                        } catch (err) {
                            Alert.alert("❌ Hata", "Profil uygulanırken hata oluştu: " + err.message);
                        } finally {
                            setLoading(false);
                            setIsApplyingProfile(false);
                            setIsProcessingProfile(false);
                        }
                    }
                }
            ]
        );
    };

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

            // KRİTİK: BLE Stack'in kapanması için 500ms bekle (Crash önleyici)
            await new Promise(r => setTimeout(r, 500));

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

    return (
        <View style={styles.container}>
            {loading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#2196F3" />
                    <Text style={{ marginTop: 10, fontWeight: 'bold', color: '#000' }}>
                        {isSyncing ? "Ayarlar Senkronize Ediliyor..." : "Lütfen Bekleyin..."}
                    </Text>
                </View>
            )}
            <ScrollView>
                <AccordionHeader title="Haberleşme" sectionId="1" expandedSection={expandedSection} setExpandedSection={setExpandedSection} />
                {expandedSection === "1" && (
                    <View style={styles.sectionContent}>
                        <SubHeader title="1.1 Seri" isOpen={subSectionState.seri} onToggle={() => toggleSub('seri')} />
                        {subSectionState.seri && (
                            <View style={styles.subSection}>
                                <DropdownRow label="1.1.1 Mod" value={commMod} options={OPTIONS.mod} onSelect={setCommMod} onSet={() => writeRegisterUI(REGISTERS.COMM_MODE, commMod)} openModal={openModal} />
                                {commMod === 2 && <SettingRow label="1.1.2 Cihaz ID" value={commId} onChange={setCommId} onSet={() => writeRegisterUI(REGISTERS.COMM_ID, commId)} />}
                                <DropdownRow label="1.1.3 Hız" value={baudrate} options={OPTIONS.baudrate} onSelect={setBaudrate} onSet={() => writeRegisterUI(REGISTERS.BAUDRATE, baudrate)} openModal={openModal} />
                                <DropdownRow label="1.1.4 Bit" value={dataBit} options={OPTIONS.bit} onSelect={setDataBit} onSet={() => writeRegisterUI(REGISTERS.DATA_BIT, dataBit)} openModal={openModal} />
                                <DropdownRow label="1.1.5 Denklik" value={parity} options={OPTIONS.parity} onSelect={setParity} onSet={() => writeRegisterUI(REGISTERS.PARITY, parity)} openModal={openModal} />
                            </View>
                        )}
                        <SubHeader title="1.2 USB" isOpen={subSectionState.usb} onToggle={() => toggleSub('usb')} />
                        {subSectionState.usb && (
                            <View style={styles.subSection}>
                                <DropdownRow label="1.2.1 Mod" value={usbMod} options={OPTIONS.usbMod} onSelect={setUsbMod} onSet={() => writeRegisterUI(REGISTERS.USB_MODE, usbMod)} openModal={openModal} />
                                {usbMod === 1 && <DropdownRow label="1.2.2 Periyot" value={usbPeriod} options={OPTIONS.usbPeriod} onSelect={setUsbPeriod} onSet={() => writeRegisterUI(REGISTERS.USB_PERIOD, usbPeriod)} openModal={openModal} />}
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
                                    onSet={() => writeRegisterUI(REGISTERS.WIRELESS_TYPE, wirelessType)}
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
                                <DropdownRow label="2.1.1 Kontrol" value={r1Ctrl} options={OPTIONS.relayControl} onSelect={setR1Ctrl} onSet={() => writeRegisterUI(REGISTERS.RELAY1_CONTROL, r1Ctrl)} openModal={openModal} />

                                {r1Ctrl === 1 && (
                                    <>
                                        <SettingRow label="2.1.2 Değer (kg)" value={r1Val} onChange={setR1Val} onSet={() => writeRegisterUI(REGISTERS.RELAY1_SET, r1Val, true)} />
                                        <SettingRow label="2.1.3 Histerisis (kg)" value={r1Hyst} onChange={setR1Hyst} onSet={() => writeRegisterUI(REGISTERS.RELAY1_HYSTERESIS, r1Hyst, true)} />
                                        <DropdownRow label="2.1.4 Kontak Durumu" value={r1Cont} options={OPTIONS.relayContact} onSelect={setR1Cont} onSet={() => writeRegisterUI(REGISTERS.RELAY1_DIRECTION, r1Cont)} openModal={openModal} />
                                        <DropdownRow label="2.1.5 Açma Gecikmesi" value={r1OpenDly} options={OPTIONS.relayDelay} onSelect={setR1OpenDly} onSet={() => writeRegisterUI(REGISTERS.RELAY1_ON_DELAY, r1OpenDly)} openModal={openModal} />
                                        <DropdownRow label="2.1.6 Kapatma Gecikmesi" value={r1CloseDly} options={OPTIONS.relayDelay} onSelect={setR1CloseDly} onSet={() => writeRegisterUI(REGISTERS.RELAY1_OFF_DELAY, r1CloseDly)} openModal={openModal} />
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
                                <DropdownRow label="2.2.1 Kontrol" value={r2Ctrl} options={OPTIONS.relayControl} onSelect={setR2Ctrl} onSet={() => writeRegisterUI(REGISTERS.RELAY2_CONTROL, r2Ctrl)} openModal={openModal} />

                                {r2Ctrl === 1 && (
                                    <>
                                        <SettingRow label="2.2.2 Değer (kg)" value={r2Val} onChange={setR2Val} onSet={() => writeRegisterUI(REGISTERS.RELAY2_SET, r2Val, true)} />
                                        <SettingRow label="2.2.3 Histerisis (kg)" value={r2Hyst} onChange={setR2Hyst} onSet={() => writeRegisterUI(REGISTERS.RELAY2_HYSTERESIS, r2Hyst, true)} />
                                        <DropdownRow label="2.2.4 Kontak Durumu" value={r2Cont} options={OPTIONS.relayContact} onSelect={setR2Cont} onSet={() => writeRegisterUI(REGISTERS.RELAY2_DIRECTION, r2Cont)} openModal={openModal} />
                                        <DropdownRow label="2.2.5 Açma Gecikmesi" value={r2OpenDly} options={OPTIONS.relayDelay} onSelect={setR2OpenDly} onSet={() => writeRegisterUI(REGISTERS.RELAY2_ON_DELAY, r2OpenDly)} openModal={openModal} />
                                        <DropdownRow label="2.2.6 Kapatma Gecikmesi" value={r2CloseDly} options={OPTIONS.relayDelay} onSelect={setR2CloseDly} onSet={() => writeRegisterUI(REGISTERS.RELAY2_OFF_DELAY, r2CloseDly)} openModal={openModal} />
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
                        <SettingRow label="3.1 Kapasite" value={capacity} onChange={setCapacity} onSet={() => writeRegisterUI(REGISTERS.MAX_CAPACITY, capacity, true)} />
                        <DropdownRow label="3.2 Sıfır Limit" value={zeroLimit} options={OPTIONS.zeroLimit} onSelect={setZeroLimit} onSet={() => writeRegisterUI(REGISTERS.ZERO_LIMIT, zeroLimit)} openModal={openModal} />

                        <SubHeader title="3.3 Çözünürlük" isOpen={subSectionState.resolution} onToggle={() => setSubSectionState(p => ({ ...p, resolution: !p.resolution }))} />
                        {subSectionState.resolution && (
                            <View style={styles.subSection}>
                                <SettingRow label="3.3.1 Çarpan (Dot)" value={dot} onChange={(v) => setDot(parseInt(v) || 0)} onSet={() => writeRegisterUI(REGISTERS.DEVICE_DOT, dot)} />
                                <SettingRow label="3.3.2 Adım (Step)" value={step} onChange={setStep} onSet={() => writeRegisterUI(REGISTERS.STEP, step)} />
                            </View>
                        )}

                        <DropdownRow label="3.4 Birim" value={unit} options={OPTIONS.unit} onSelect={setUnit} onSet={() => writeRegisterUI(REGISTERS.UNIT, unit)} openModal={openModal} />
                        <DropdownRow label="3.5 Hareketsizlik" value={stability} options={OPTIONS.stability} onSelect={setStability} onSet={() => writeRegisterUI(REGISTERS.STABILITY, stability)} openModal={openModal} />

                        <ActionRow label={`3.6 İç Sayım: ${mvvValue} mV/V`} btnText="OKU" onPress={handleReadInternal} />

                        <DropdownRow label="3.7 Dara" value={tareMode} options={OPTIONS.tare} onSelect={setTareMode} onSet={() => writeRegisterUI(REGISTERS.TARE_ENABLE, tareMode)} openModal={openModal} />
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

                        <SettingRow label="4.1 Yük Maks" value={anaMaxLoad} onChange={setAnaMaxLoad} onSet={() => writeRegisterUI(REGISTERS.ANALOG_MAX_LOAD, parseFloat(anaMaxLoad) * 1000, true)} />
                        <SettingRow label="4.2 Yük Min" value={anaMinLoad} onChange={setAnaMinLoad} onSet={() => writeRegisterUI(REGISTERS.ANALOG_MIN_LOAD, parseFloat(anaMinLoad) * 1000, true)} />

                        <View style={styles.divider} />

                        <SettingRow label="4.3 mA maks (Maks: 21.5)" value={anaMaxMa} onChange={setAnaMaxMa} onSet={() => writeRegisterUI(REGISTERS.ANALOG_MAX_MA, parseFloat(anaMaxMa) * 1000, true)} />
                        <SettingRow label="4.4 mA min (Min: 0)" value={anaMinMa} onChange={setAnaMinMa} onSet={() => writeRegisterUI(REGISTERS.ANALOG_MIN_MA, parseFloat(anaMinMa) * 1000, true)} />

                        <View style={styles.divider} />

                        <SettingRow label="4.5 V maks (Maks: 11.5)" value={anaMaxV} onChange={setAnaMaxV} onSet={() => writeRegisterUI(REGISTERS.ANALOG_MAX_V, parseFloat(anaMaxV) * 1000, true)} />
                        <SettingRow label="4.6 V min (Min: 0)" value={anaMinV} onChange={setAnaMinV} onSet={() => writeRegisterUI(REGISTERS.ANALOG_MIN_V, parseFloat(anaMinV) * 1000, true)} />
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
                        <DropdownRow label="6.1 Filtre Ayarı" value={filterType} options={OPTIONS.filterType} onSelect={setFilterType} onSet={() => writeRegisterUI(REGISTERS.FILTER_TYPE, filterType)} openModal={openModal} />

                        {/* KAPALI: ADCHZ, Karar Süresi */}
                        {filterType === 0 && (
                            <>
                                <DropdownRow label="6.1.4 ADC Hz" value={adcHz} options={OPTIONS.adcHz} onSelect={setAdcHz} onSet={() => writeRegisterUI(REGISTERS.ADC_HZ, adcHz)} openModal={openModal} />
                                <DropdownRow label="6.1.3 Karar Süresi" value={decisionTime} options={OPTIONS.decisionTime} onSelect={setDecisionTime} onSet={() => writeRegisterUI(REGISTERS.DECISION_TIME, decisionTime)} openModal={openModal} />
                            </>
                        )}

                        {/* ÖZEL: Tepki Süresi, Titreşim, Karar Süresi */}
                        {filterType === 1 && (
                            <>
                                <DropdownRow label="6.1.1 Tepki Süresi" value={response} options={OPTIONS.responseTime} onSelect={setResponse} onSet={() => writeRegisterUI(REGISTERS.RESPONSE_TIME, response)} openModal={openModal} />
                                <DropdownRow label="6.1.2 Titreşim" value={vibration} options={OPTIONS.vibration} onSelect={setVibration} onSet={() => writeRegisterUI(REGISTERS.VIBRATION, vibration)} openModal={openModal} />
                                <DropdownRow label="6.1.3 Karar Süresi" value={decisionTime} options={OPTIONS.decisionTime} onSelect={setDecisionTime} onSet={() => writeRegisterUI(REGISTERS.DECISION_TIME, decisionTime)} openModal={openModal} />
                            </>
                        )}

                        {/* HAREKETLİ ORTALAMA: ADC Hz, Ortalama Adet, Karar Süresi */}
                        {filterType === 2 && (
                            <>
                                <DropdownRow label="6.1.4 ADC Hz" value={adcHz} options={OPTIONS.adcHz} onSelect={setAdcHz} onSet={() => writeRegisterUI(REGISTERS.ADC_HZ, adcHz)} openModal={openModal} />
                                <DropdownRow label="6.1.5 Ortalama Adet" value={parseInt(avgCount) || 0} options={OPTIONS.avgCount} onSelect={setAvgCount} onSet={() => writeRegisterUI(REGISTERS.MOVING_AVG_COUNT, avgCount)} openModal={openModal} />
                                <DropdownRow label="6.1.3 Karar Süresi" value={decisionTime} options={OPTIONS.decisionTime} onSelect={setDecisionTime} onSet={() => writeRegisterUI(REGISTERS.DECISION_TIME, decisionTime)} openModal={openModal} />
                            </>
                        )}
                    </View>
                )}






                <AccordionHeader title="Genel" sectionId="7" expandedSection={expandedSection} setExpandedSection={setExpandedSection} />
                {expandedSection === "7" && (
                    <View style={styles.sectionContent}>
                        <DropdownRow label="7.1 Dil" value={lang} options={OPTIONS.language} onSelect={setLang} onSet={() => writeRegisterUI(REGISTERS.LANGUAGE, lang)} openModal={openModal} />

                        <SubHeader title="7.2 Şifre" isOpen={subSectionState.pass} onToggle={() => setSubSectionState(p => ({ ...p, pass: !p.pass }))} />
                        {subSectionState.pass && (
                            <View style={styles.subSection}>
                                <DropdownRow label="7.2.1 Mod" value={passMode} options={OPTIONS.passwordMode} onSelect={setPassMode} onSet={() => writeRegisterUI(REGISTERS.PASSWORD_MODE, passMode)} openModal={openModal} />
                                <SettingRow label="7.2.2 Yeni Şifre" value={newPass} onChange={setNewPass} onSet={() => writeRegisterUI(REGISTERS.PASSWORD_VALUE, newPass, true)} />
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
                                        onPress: async () => {
                                            setLoading(true);
                                            try {
                                                await modbusService.factoryReset();
                                                setTimeout(() => {
                                                    modbusService.safeTeardown(true);
                                                    router.replace('/');
                                                }, 100);
                                            } catch (e) {
                                                Alert.alert("Hata", "Sıfırlanamadı: " + e.message);
                                            } finally {
                                                setLoading(false);
                                            }
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

                        {/* PROFİLLER BÖLÜMÜ */}
                        <View style={{ marginTop: 10 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <Text style={styles.subHeader}>7.6 Profiller</Text>
                                <TouchableOpacity
                                    style={[styles.miniButton, { width: 100, backgroundColor: '#4CAF50', borderColor: '#388E3C' }]}
                                    onPress={() => setSaveModalVisible(true)}
                                >
                                    <Text style={[styles.miniButtonText, { fontSize: 12, color: 'white' }]}>KAYDET</Text>
                                </TouchableOpacity>
                            </View>

                            {profiles.length === 0 ? (
                                <View style={styles.infoBox}>
                                    <Text style={styles.infoText}>Henüz kayıtlı bir profil yok. Mevcut ayarları yukarıdaki butonla kaydedebilirsiniz.</Text>
                                </View>
                            ) : (
                                profiles.map(profile => (
                                    <View key={profile.id} style={styles.profileRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.profileName}>{profile.name}</Text>
                                            <Text style={styles.profileDetail}>Kayıt: {new Date(parseInt(profile.id)).toLocaleDateString()}</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.profileButton, { backgroundColor: '#2196F3' }]}
                                            onPress={() => handleApplyProfile(profile)}
                                        >
                                            <Text style={styles.profileButtonText}>UYGULA</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.profileButton, { backgroundColor: '#F44336', marginLeft: 5 }]}
                                            onPress={() => {
                                                Alert.alert("Sil", "Bu profil silinecektir. Onaylıyor musunuz?", [
                                                    { text: "İptal", style: "cancel" },
                                                    { text: "Sil", style: "destructive", onPress: () => handleDeleteProfile(profile.id) }
                                                ]);
                                            }}
                                        >
                                            <Text style={styles.profileButtonText}>SİL</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </View>

                        <View style={styles.divider} />

                        <ActionRow label="Sistem Yeniden Başlat" btnText="BAŞLAT" onPress={() => {
                            Alert.alert(
                                "Yeniden Başlat",
                                "Cihaz yeniden kapatılıp açılacaktır. Onaylıyor musunuz?",
                                [
                                    { text: 'İptal', style: 'cancel' },
                                    {
                                        text: 'Başlat',
                                        onPress: async () => {
                                            setLoading(true);
                                            try {
                                                await modbusService.restart();
                                                setTimeout(() => {
                                                    modbusService.safeTeardown(true);
                                                    router.replace('/');
                                                }, 100);
                                            } catch (e) {
                                                Alert.alert("Hata", "Yeniden başlatılamadı: " + e.message);
                                            } finally {
                                                setLoading(false);
                                            }
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

            {/* Profil Kaydet Modalı */}
            <Modal visible={saveModalVisible} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Profili Kaydet</Text>
                        <Text style={styles.infoText}>Mevcut tüm ayarlar bu isimle kaydedilecektir.</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Profil İsmi (Örn: Beton Santrali)"
                            value={profileName}
                            onChangeText={setProfileName}
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                            <TouchableOpacity
                                style={[styles.closeButton, { flex: 1, backgroundColor: '#757575', marginTop: 0 }]}
                                onPress={() => { setSaveModalVisible(false); setProfileName(""); }}
                            >
                                <Text style={{ color: 'white' }}>İptal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.closeButton, { flex: 1, backgroundColor: '#4CAF50', marginTop: 0 }]}
                                onPress={handleSaveProfile}
                            >
                                <Text style={{ color: 'white' }}>Kaydet</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
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
                            placeholder="192.168.1.100"
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
                    {Constants.expoConfig?.hostUri ? `Tel IP: ${Constants.expoConfig.hostUri}` : "Mod: Standalone (APK)"} | Bağlantı: {modbusService.transport === 'TCP' ? 'WiFi' : 'BLE'}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safeContainer: { flex: 1, backgroundColor: '#f5f7fa' },
    container: { flex: 1, backgroundColor: '#f5f7fa' },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20,
        backgroundColor: '#fff', elevation: 2
    },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    content: { padding: 15 },
    sectionContent: { paddingHorizontal: 15, paddingBottom: 15 },
    subSection: { paddingLeft: 10, paddingBottom: 10, borderLeftWidth: 1, borderLeftColor: '#eee', marginLeft: 10 },
    infoBox: { backgroundColor: '#f0f0f0', padding: 12, borderRadius: 8, marginVertical: 10 },

    // Accordion Styles
    accordionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 18, backgroundColor: '#fff', borderRadius: 12, marginBottom: 10,
        elevation: 2, borderLeftWidth: 5, borderLeftColor: '#2196F3'
    },
    accordionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    iconText: { fontSize: 20, fontWeight: 'bold', color: '#2196F3' },

    // Row & Input Styles
    row: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff',
        paddingHorizontal: 10
    },
    label: { flex: 1, fontSize: 16, color: '#333', fontWeight: '500' },
    input: {
        width: 100, height: 45, borderWidth: 1, borderColor: '#ddd',
        borderRadius: 10, paddingHorizontal: 10, textAlign: 'center',
        backgroundColor: '#f9f9f9', color: '#000', marginRight: 10,
        fontSize: 16
    },
    setButton: { backgroundColor: '#4CAF50', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
    setText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

    // Dropdown Styles
    dropdown: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        width: 140, height: 45, borderWidth: 1, borderColor: '#ddd',
        borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#f9f9f9', marginRight: 10
    },
    dropdownText: { fontSize: 15, color: '#333', fontWeight: '500' },
    caret: { fontSize: 12, color: '#666' },

    // Sub Header
    subHeaderRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#e3f2fd', padding: 12, borderRadius: 8, marginTop: 10, marginBottom: 5
    },
    subHeaderText: { fontSize: 14, fontWeight: 'bold', color: '#1976D2' },
    miniButton: { backgroundColor: '#fff', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', elevation: 1 },
    miniButtonText: { color: '#1976D2', fontWeight: 'bold', fontSize: 18 },

    // Action Buttons
    actionButton: { backgroundColor: '#2196F3', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
    actionText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

    // Modal & Loading
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 20, padding: 25, elevation: 10 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 15, textAlign: 'center' },
    modalInput: {
        borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12,
        fontSize: 18, textAlign: 'center', backgroundColor: '#f9f9f9', marginBottom: 15, color: '#000'
    },
    modalItem: {
        paddingVertical: 18,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        width: '100%',
        alignItems: 'center'
    },
    modalText: {
        fontSize: 18,
        color: '#333',
        fontWeight: '500'
    },
    closeButton: { padding: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2196F3', marginTop: 10 },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.8)',
        justifyContent: 'center', alignItems: 'center', zIndex: 1000
    },
    loadingText: { marginTop: 15, fontSize: 16, color: '#2196F3', fontWeight: 'bold' },
    progressText: { marginTop: 5, fontSize: 12, color: '#666' },
    infoText: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 10 },

    // Profile Section
    profileSection: { marginTop: 15, padding: 15, backgroundColor: '#fff', borderRadius: 12, elevation: 2 },
    profileSectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15 },
    profileItem: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee'
    },
    profileItemName: { fontSize: 15, color: '#333', fontWeight: '500' },
    profileActions: { flexDirection: 'row', gap: 8 },
    applyBtn: { backgroundColor: '#4CAF50', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    deleteBtn: { backgroundColor: '#F44336', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    btnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    saveBtn: { backgroundColor: '#2196F3', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15 },
});


