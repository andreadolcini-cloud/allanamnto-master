import { useCallback, useEffect, useRef, useState } from 'react';
import type { BluetoothHRState } from '../types/fitness';

// Minimal Web Bluetooth type declarations for standard TypeScript compilation
interface BluetoothRemoteGATTCharacteristic {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  readValue(): Promise<DataView>;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string | number): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string | number): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDeviceHandle {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface NavigatorWithBluetooth extends Navigator {
  bluetooth?: {
    requestDevice(options: {
      filters?: Array<{ services?: Array<string | number>; namePrefix?: string }>;
      optionalServices?: Array<string | number>;
      acceptAllDevices?: boolean;
    }): Promise<BluetoothDeviceHandle>;
  };
}

function parseHeartRateMeasurement(value: DataView) {
  const flags = value.getUint8(0);
  const is16Bit = (flags & 0x01) !== 0;
  const contactStatusBits = (flags >> 1) & 0x03;
  const hasEnergyExpended = (flags & 0x08) !== 0;
  const hasRRIntervals = (flags & 0x10) !== 0;

  let offset = 1;
  let bpm = 0;
  if (is16Bit) {
    bpm = value.getUint16(offset, true);
    offset += 2;
  } else {
    bpm = value.getUint8(offset);
    offset += 1;
  }

  if (hasEnergyExpended && value.byteLength >= offset + 2) {
    offset += 2;
  }

  const rrIntervalsMs: number[] = [];
  if (hasRRIntervals) {
    while (offset + 1 < value.byteLength) {
      // Bluetooth spec: RR-Interval is uint16 in 1/1024 second units
      const rawRR = value.getUint16(offset, true);
      rrIntervalsMs.push((rawRR / 1024) * 1000);
      offset += 2;
    }
  }

  let sensorContact: BluetoothHRState['sensorContact'] = 'unknown';
  if (contactStatusBits === 0 || contactStatusBits === 1) {
    sensorContact = 'not-supported';
  } else if (contactStatusBits === 2) {
    sensorContact = 'supported-none';
  } else if (contactStatusBits === 3) {
    sensorContact = 'supported-detected';
  }

  return { bpm, sensorContact, rrIntervalsMs };
}

export function useBluetoothHR() {
  const isSupported =
    typeof navigator !== 'undefined' && 'bluetooth' in navigator && !!(navigator as NavigatorWithBluetooth).bluetooth;

  const [state, setState] = useState<BluetoothHRState>({
    isSupported,
    isConnecting: false,
    isConnected: false,
    deviceName: null,
    bpm: null,
    sensorContact: 'unknown',
    batteryLevel: null,
    hrvRmssdMs: null,
    error: null,
  });

  const deviceRef = useRef<BluetoothDeviceHandle | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const rrHistoryRef = useRef<number[]>([]);

  const handleHRNotification = useCallback((event: Event) => {
    const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
    if (!target?.value) return;

    const parsed = parseHeartRateMeasurement(target.value);

    let rmssd: number | null = null;
    if (parsed.rrIntervalsMs.length > 0) {
      rrHistoryRef.current.push(...parsed.rrIntervalsMs);
      if (rrHistoryRef.current.length > 24) {
        rrHistoryRef.current = rrHistoryRef.current.slice(-24);
      }
      if (rrHistoryRef.current.length >= 4) {
        let sumSqDiff = 0;
        for (let i = 1; i < rrHistoryRef.current.length; i++) {
          const diff = rrHistoryRef.current[i] - rrHistoryRef.current[i - 1];
          sumSqDiff += diff * diff;
        }
        rmssd = Math.round(Math.sqrt(sumSqDiff / (rrHistoryRef.current.length - 1)));
      }
    }

    setState((prev) => ({
      ...prev,
      bpm: parsed.bpm > 25 && parsed.bpm < 245 ? parsed.bpm : prev.bpm,
      sensorContact: parsed.sensorContact,
      hrvRmssdMs: rmssd ?? prev.hrvRmssdMs,
    }));
  }, []);

  const handleDisconnected = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      bpm: null,
      sensorContact: 'unknown',
    }));
  }, []);

  const disconnect = useCallback(() => {
    if (characteristicRef.current) {
      try {
        characteristicRef.current.removeEventListener('characteristicvaluechanged', handleHRNotification);
        void characteristicRef.current.stopNotifications();
      } catch {
        // Ignore cleanup errors
      }
      characteristicRef.current = null;
    }
    if (deviceRef.current) {
      deviceRef.current.removeEventListener('gattserverdisconnected', handleDisconnected);
      if (deviceRef.current.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
      deviceRef.current = null;
    }
    rrHistoryRef.current = [];
    setState((prev) => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      deviceName: null,
      bpm: null,
      sensorContact: 'unknown',
      batteryLevel: null,
      hrvRmssdMs: null,
      error: null,
    }));
  }, [handleDisconnected, handleHRNotification]);

  const connect = useCallback(async () => {
    const bt = (navigator as NavigatorWithBluetooth).bluetooth;
    if (!bt) {
      setState((prev) => ({
        ...prev,
        error: 'Web Bluetooth non supportato su questo browser. Usa Chrome su Android, Windows o macOS.',
      }));
      return;
    }

    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const device = await bt.requestDevice({
        filters: [{ services: ['heart_rate'] }],
        optionalServices: ['battery_service'],
      });

      deviceRef.current = device;
      device.addEventListener('gattserverdisconnected', handleDisconnected);

      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('Impossibile avviare il server GATT sul dispositivo.');
      }

      const hrService = await server.getPrimaryService('heart_rate');
      const hrChar = await hrService.getCharacteristic('heart_rate_measurement');
      characteristicRef.current = hrChar;

      hrChar.addEventListener('characteristicvaluechanged', handleHRNotification);
      await hrChar.startNotifications();

      // Try reading battery level optionally
      let batteryLevel: number | null = null;
      try {
        const batteryService = await server.getPrimaryService('battery_service');
        const batteryChar = await batteryService.getCharacteristic('battery_level');
        const batVal = await batteryChar.readValue();
        batteryLevel = batVal.getUint8(0);
      } catch {
        batteryLevel = null;
      }

      setState((prev) => ({
        ...prev,
        isConnecting: false,
        isConnected: true,
        deviceName: device.name || 'Cardiofrequenzimetro BLE',
        batteryLevel,
        error: null,
      }));
    } catch (err) {
      const e = err as DOMException | Error;
      // Ignore silent user cancel
      if (e.name === 'NotFoundError') {
        setState((prev) => ({ ...prev, isConnecting: false, error: null }));
        return;
      }
      const message =
        e.name === 'SecurityError'
          ? 'Accesso Bluetooth bloccato dal contesto corrente o dalla policy del browser.'
          : e.message || 'Errore durante la connessione al cardiofrequenzimetro Bluetooth.';
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        isConnected: false,
        error: message,
      }));
    }
  }, [handleDisconnected, handleHRNotification]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
  };
}
