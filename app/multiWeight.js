import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import bleService from '../services/bleService';
import { ModbusService } from '../services/modbusService';

export default function MultiWeightScreen() {
    const { devicesJson } = useLocalSearchParams();
    const router = useRouter();
    const [deviceStates, setDeviceStates] = useState({});
    const sessionsRef = useRef({}); // Key: id, Value: ModbusService instance
    const intervalsRef = useRef({}); // Key: id, Value: setInterval id

    const devices = JSON.parse(devicesJson || "[]");

    const [profiles, setProfiles] = useState([]);
    const [profileModalVisible, setProfileModalVisible] = useState(false);
    const [selectedSessionId, setSelectedSessionId] = useState(null);

    useEffect(() => {
        const startAllConnections = async () => {
            loadProfiles();
            for (const connDevice of devices) {
                // Her cihaz bağlantısı arasında 1 saniye bekle
                await connectToDevice(connDevice);
                await new Promise(r => setTimeout(r, 1000));
            }
        };

        startAllConnections();

        return () => {
            console.log("🏃 MultiWeightScreen'den çıkılıyor, temizlik başlıyor...");
            Object.keys(sessionsRef.current).forEach(id => {
                const session = sessionsRef.current[id];
                if (session) {
                    session.isTeardown = true;
                    session.isConnecting = false;
                    session.safeTeardown(true);
                }
            });
            Object.values(intervalsRef.current).forEach(id => {
                if (id) clearTimeout(id);
            });
        };
    }, []);

    const connectToDevice = async (deviceInfo) => {
        const sessionId = deviceInfo.id;
        const session = new ModbusService();
        sessionsRef.current[sessionId] = session;

        updateDeviceState(sessionId, { status: 'Bağlanıyor...', weight: '0.0', isConnected: false });

        try {
            if (deviceInfo.type === 'TCP') {
                await session.connectTCP(deviceInfo.ip, deviceInfo.port);
            } else {
                const manager = bleService.getManager();
                const bleDevice = await manager.connectToDevice(deviceInfo.id);
                await bleDevice.discoverAllServicesAndCharacteristics();
                session.setDevice(deviceInfo.id, bleDevice);
            }

            updateDeviceState(sessionId, { status: 'Bağlı', isConnected: true });

            session.onDataCallback = (data) => {
                parseAndSetData(sessionId, data, session);
            };

            // Önce Ayarları Oku
            try { await session.sendCommand(3, 118, 2); } catch (e) { }

            let isActive = true;
            const poll = async () => {
                if (!isActive || session.isTeardown) return;
                try {
                    await session.sendCommand(3, 7, 3);
                } catch (e) {
                    if (session.isTeardown) return;
                    if (e.message.includes("Socket null") || e.message.includes("mevcut değil")) {
                        updateDeviceState(sessionId, { status: 'Yeniden Bağlanıyor...', isConnected: false });
                        try {
                            await session.connectTCP(deviceInfo.ip, deviceInfo.port);
                            updateDeviceState(sessionId, { status: 'Bağlı', isConnected: true });
                        } catch (re) {
                            if (!session.isTeardown) updateDeviceState(sessionId, { status: 'Bağlantı Kesildi', isConnected: false });
                        }
                    }
                }
                if (isActive && !session.isTeardown) {
                    const tId = setTimeout(poll, 400);
                    intervalsRef.current[sessionId] = tId;
                }
            };
            poll();

        } catch (error) {
            if (!session.isTeardown) {
                updateDeviceState(sessionId, { status: 'Hata', isConnected: false });
            }
        }
    };

    const parseAndSetData = (id, data, session) => {
        try {
            const isStandardTCP = session.transport === 'TCP' && session.port === 502;
            const funcCode = isStandardTCP ? data[7] : data[1];
            if (funcCode !== 3) return;

            const dataOffset = isStandardTCP ? 9 : 3;
            const byteCount = isStandardTCP ? data[8] : data[2];

            if (byteCount === 4) {
                const dotVal = (data[dataOffset] << 8) | data[dataOffset + 1];
                const unitCode = (data[dataOffset + 2] << 8) | data[dataOffset + 3];
                const unitMap = { 0: 'kg', 1: 'g', 2: 'lb', 3: 'mV/V', 4: 'mV' };
                updateDeviceState(id, {
                    dot: (dotVal >= 0 && dotVal <= 5) ? dotVal : 0,
                    unit: unitMap[unitCode] || 'kg'
                });
            } else if (byteCount >= 6) {
                const status = (data[dataOffset] << 8) | data[dataOffset + 1];
                const isStable = (status & (1 << 6)) !== 0;
                const hasTare = (status & (1 << 10)) !== 0;
                const highWord = (data[dataOffset + 2] << 8) | data[dataOffset + 3];
                const lowWord = (data[dataOffset + 4] << 8) | data[dataOffset + 5];
                const rawValue = (highWord << 16) | lowWord;

                setDeviceStates(prev => {
                    const ds = prev[id] || {};
                    const dot = ds.dot || 0;
                    const formatted = (rawValue / Math.pow(10, dot)).toFixed(dot);
                    return { ...prev, [id]: { ...ds, weight: formatted, isStable, hasTare, status: 'Aktif' } };
                });
            }
        } catch (e) { }
    };

    const loadProfiles = async () => {
        try {
            const stored = await AsyncStorage.getItem('settings_profiles');
            if (stored) setProfiles(JSON.parse(stored));
        } catch (e) { }
    };

    const handleApplyProfile = async (profile) => {
        const sessionId = selectedSessionId;
        const session = sessionsRef.current[sessionId];
        if (!session || !profile) return;

        setProfileModalVisible(false);
        updateDeviceState(sessionId, { applyingProfile: true, profileProgress: 0 });

        try {
            await session.applyProfileData(profile.data, (progress) => {
                updateDeviceState(sessionId, { profileProgress: Math.round(progress * 100) });
            });
            Alert.alert("✓ Başarılı", `${profile.name} başarıyla uygulandı.`);
        } catch (error) {
            Alert.alert("❌ Hata", `Profil uygulanamadı: ${error.message}`);
        } finally {
            updateDeviceState(sessionId, { applyingProfile: false });
        }
    };

    const updateDeviceState = (id, newState) => {
        setDeviceStates(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...newState } }));
    };

    const handleCommand = async (id, cmd) => {
        const session = sessionsRef.current[id];
        if (!session) return;
        try {
            if (cmd === 'ZERO') await session.zero();
            if (cmd === 'TARE') {
                const state = deviceStates[id] || {};
                state.hasTare ? await session.clearTare() : await session.tare();
            }
        } catch (e) { Alert.alert("Hata", e.message); }
    };

    const renderDeviceCard = ({ item }) => {
        const state = deviceStates[item.id] || { status: 'Bekliyor...', weight: '---' };
        const isError = state.status?.includes('Hata') || state.status?.includes('Kesildi');

        return (
            <View style={[styles.card, isError && styles.errorCard]}>
                <View style={styles.cardHeader}>
                    <Text style={styles.deviceName} numberOfLines={1}>{item.name}</Text>
                    <View style={[styles.statusDot, { backgroundColor: state.isConnected ? '#4CAF50' : (isError ? '#F44336' : '#CCC') }]} />
                </View>

                {isError ? (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorTitle}>BAĞLANTI YOK</Text>
                        <TouchableOpacity style={styles.retryBtn} onPress={() => connectToDevice(item)}>
                            <Text style={styles.retryBtnText}>TEKRAR BAĞLAN</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <View style={styles.weightContainer}>
                            <Text style={styles.weightText}>{state.weight}</Text>
                            <Text style={styles.unitText}>{state.unit || 'kg'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={[styles.infoValue, { color: state.isStable ? '#4CAF50' : '#FF9800' }]}>
                                {state.isStable ? "STABİL" : "HAREKETLİ"}
                            </Text>
                        </View>
                        <View style={styles.buttonRow}>
                            <TouchableOpacity style={[styles.miniBtn, { backgroundColor: '#FF9800' }]} onPress={() => handleCommand(item.id, 'ZERO')}>
                                <Text style={styles.miniBtnText}>ZERO</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.miniBtn, { backgroundColor: '#2196F3' }]} onPress={() => handleCommand(item.id, 'TARE')}>
                                <Text style={styles.miniBtnText}>{state.hasTare ? "DARA İPT" : "DARA"}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.miniBtn, { backgroundColor: '#9C27B0' }]} onPress={() => { setSelectedSessionId(item.id); setProfileModalVisible(true); }}>
                                <Text style={styles.miniBtnText}>PRF</Text>
                            </TouchableOpacity>
                        </View>
                        {state.applyingProfile && (
                            <View style={styles.progressOverlay}>
                                <ActivityIndicator size="small" color="#fff" />
                                <Text style={styles.progressText}>%{state.profileProgress || 0}</Text>
                            </View>
                        )}
                    </>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()}><Text style={styles.backText}>‹ Geri</Text></TouchableOpacity>
                <Text style={styles.topTitle}>Çoklu Tartım</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={devices}
                keyExtractor={item => item.id}
                renderItem={renderDeviceCard}
                numColumns={2}
                contentContainerStyle={styles.listContent}
            />

            <Modal visible={profileModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Profil Seçin</Text>
                        <ScrollView style={{ width: '100%', maxHeight: 300, marginVertical: 15 }}>
                            {profiles.length > 0 ? profiles.map(p => (
                                <TouchableOpacity key={p.id} style={styles.profileItem} onPress={() => handleApplyProfile(p)}>
                                    <Text style={styles.profileItemText}>{p.name}</Text>
                                    <Text style={styles.profileItemAction}>Yükle ›</Text>
                                </TouchableOpacity>
                            )) : <Text style={{ textAlign: 'center', color: '#999' }}>Kayıtlı profil yok.</Text>}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setProfileModalVisible(false)}>
                            <Text style={styles.modalCloseBtnText}>Kapat</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F7FA' },
    topBar: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20,
        backgroundColor: '#fff', elevation: 3
    },
    backText: { fontSize: 18, color: '#2196F3', fontWeight: 'bold' },
    topTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    listContent: { padding: 6 },
    card: {
        flex: 1, backgroundColor: '#fff', margin: 6, padding: 12,
        borderRadius: 15, elevation: 4, minHeight: 160,
        justifyContent: 'space-between', overflow: 'hidden'
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    deviceName: { fontSize: 12, fontWeight: 'bold', color: '#555', flex: 1 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    errorCard: { backgroundColor: '#FBE9E7' },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 5 },
    errorTitle: { fontSize: 10, fontWeight: 'bold', color: '#D32F2F' },
    retryBtn: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#D32F2F', borderRadius: 8, marginTop: 5 },
    retryBtnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    weightContainer: { alignItems: 'center', marginVertical: 5 },
    weightText: { fontSize: 28, fontWeight: '900', color: '#2196F3' },
    unitText: { fontSize: 10, color: '#888' },
    infoRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 5 },
    infoValue: { fontSize: 10, fontWeight: 'bold' },
    buttonRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
    miniBtn: { paddingVertical: 6, borderRadius: 8, flex: 1, alignItems: 'center' },
    miniBtnText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '80%', backgroundColor: '#fff', borderRadius: 20, padding: 20, alignItems: 'center' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    profileItem: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 12, backgroundColor: '#f8f9fa', borderRadius: 10, marginBottom: 8
    },
    profileItemText: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    profileItemAction: { fontSize: 12, color: '#2196F3' },
    modalCloseBtn: { padding: 5 },
    modalCloseBtnText: { color: '#F44336', fontWeight: 'bold' },
    progressOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10
    },
    progressText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});
