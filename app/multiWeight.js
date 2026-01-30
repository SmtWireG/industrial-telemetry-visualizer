import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
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

    useEffect(() => {
        // Tüm cihazlara bağlan
        devices.forEach(connDevice => {
            connectToDevice(connDevice);
        });

        return () => {
            // Temizlik: Tüm bağlantıları kapat ve interval'leri durdur
            Object.keys(sessionsRef.current).forEach(id => {
                sessionsRef.current[id].safeTeardown(true);
            });
            Object.values(intervalsRef.current).forEach(clearInterval);
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

            // Veri dinleyiciyi kur
            session.onDataCallback = (data) => {
                parseAndSetData(sessionId, data, session); // session instance'ını geçiyoruz
            };

            // Polling başlat (Ağırlık ve durum oku)
            let isActive = true;
            const poll = async () => {
                if (!isActive) return;
                try {
                    await session.sendCommand(3, 7, 3);
                } catch (e) {
                    console.warn(`[MULTI] ${deviceInfo.name} poll error:`, e.message);
                }
                if (isActive) {
                    const timeoutId = setTimeout(poll, 300);
                    intervalsRef.current[sessionId] = timeoutId;
                }
            };
            poll();

        } catch (error) {
            console.error(`[MULTI] ${deviceInfo.name} error:`, error);
            updateDeviceState(sessionId, { status: 'Hata: ' + error.message, isConnected: false });
        }
    };

    const parseAndSetData = (id, data, session) => {
        try {
            // Modbus TCP (502) ile RTU Over TCP (23) farklı ofsetler kullanır
            const isStandardTCP = session.transport === 'TCP' && session.port === 502;
            const funcCode = isStandardTCP ? data[7] : data[1];
            if (funcCode !== 3) return;

            const dataOffset = isStandardTCP ? 9 : 3;
            const status = (data[dataOffset] << 8) | data[dataOffset + 1];
            const isStable = (status & (1 << 6)) !== 0;

            const highWord = (data[dataOffset + 2] << 8) | data[dataOffset + 3];
            const lowWord = (data[dataOffset + 4] << 8) | data[dataOffset + 5];
            let rawValue = (highWord << 16) | lowWord;
            if (rawValue & 0x80000000) rawValue -= 0x100000000;

            // Şimdilik noktayı (dot) 0 varsayalım veya her cihaz için ayrıca oku
            setDeviceStates(prev => ({
                ...prev,
                [id]: {
                    ...prev[id],
                    weight: (rawValue / 100).toFixed(2), // Örnek: 2 nokta varsayımı
                    isStable,
                    status: 'Aktif'
                }
            }));
        } catch (e) { }
    };

    const updateDeviceState = (id, newState) => {
        setDeviceStates(prev => ({
            ...prev,
            [id]: { ...(prev[id] || {}), ...newState }
        }));
    };

    const handleCommand = async (id, cmd) => {
        const session = sessionsRef.current[id];
        if (!session) return;

        try {
            if (cmd === 'ZERO') await session.zero();
            if (cmd === 'TARE') await session.tare();
        } catch (error) {
            Alert.alert("Komut Hatası", error.message);
        }
    };

    const renderDeviceCard = ({ item }) => {
        const state = deviceStates[item.id] || { status: 'Bekliyor...', weight: '---' };
        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <Text style={styles.deviceName}>{item.name}</Text>
                    <View style={[styles.statusDot, { backgroundColor: state.isConnected ? '#4CAF50' : '#F44336' }]} />
                </View>

                <View style={styles.weightContainer}>
                    <Text style={styles.weightText}>{state.weight}</Text>
                    <Text style={styles.unitText}>kg</Text>
                </View>

                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Durum:</Text>
                    <Text style={[styles.infoValue, { color: state.isStable ? '#4CAF50' : '#FF9800' }]}>
                        {state.isStable ? "STABİL" : "HAREKETLİ"}
                    </Text>
                </View>

                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.miniBtn, { backgroundColor: '#FF9800' }]}
                        onPress={() => handleCommand(item.id, 'ZERO')}
                    >
                        <Text style={styles.miniBtnText}>ZERO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.miniBtn, { backgroundColor: '#2196F3' }]}
                        onPress={() => handleCommand(item.id, 'TARE')}
                    >
                        <Text style={styles.miniBtnText}>TARE</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.backText}>‹ Geri</Text>
                </TouchableOpacity>
                <Text style={styles.topTitle}>Çoklu Tartım Takibi</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={devices}
                keyExtractor={item => item.id}
                renderItem={renderDeviceCard}
                numColumns={2}
                contentContainerStyle={styles.listContent}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f7fa' },
    topBar: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20,
        backgroundColor: '#fff', elevation: 3
    },
    backText: { fontSize: 18, color: '#2196F3', fontWeight: 'bold' },
    topTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    listContent: { padding: 10 },
    card: {
        flex: 1, backgroundColor: '#fff', margin: 8, padding: 15,
        borderRadius: 20, elevation: 4, minHeight: 180,
        justifyContent: 'space-between'
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    deviceName: { fontSize: 14, fontWeight: 'bold', color: '#555', flex: 1 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    weightContainer: { alignItems: 'center', marginVertical: 10 },
    weightText: { fontSize: 32, fontWeight: '900', color: '#2196F3' },
    unitText: { fontSize: 12, color: '#888' },
    infoRow: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginBottom: 10 },
    infoLabel: { fontSize: 10, color: '#999' },
    infoValue: { fontSize: 10, fontWeight: 'bold' },
    buttonRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
    miniBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, flex: 1, alignItems: 'center' },
    miniBtnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' }
});
