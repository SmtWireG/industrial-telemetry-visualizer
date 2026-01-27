import { BleManager } from 'react-native-ble-plx';

class BleService {
    constructor() {
        this.manager = new BleManager();
    }

    getManager() {
        return this.manager;
    }
}

const bleService = new BleService();
export default bleService;
