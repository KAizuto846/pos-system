# ESP32-CAM Expiry Scanner

Firmware para ESP32-CAM (AI-Thinker) que captura fotos de fechas de vencimiento
y las envía al servidor POS para reconocimiento OCR.

## Requisitos

- Arduino IDE o PlatformIO
- Board: AI-Thinker ESP32-CAM
- Librerías:
  - ESP32 Arduino Core 2.0+
  - WiFi
  - WebServer
  - ESP32 Camera

## Pinout (AI-Thinker ESP32-CAM)

| Componente | GPIO |
|-----------|------|
| Botón Captura | 13 |
| LED Rojo | 12 |
| LED Verde | 14 |
| LED Azul | 15 |
| LED Flash | 4 |

## Instalación

1. Abre el archivo `esp32cam-expiry-scanner.ino` en Arduino IDE
2. Selecciona Board: "AI-Thinker ESP32-CAM"
3. Configura:
   - Partition Scheme: "Huge APP (3MB NO OTA)"
   - Flash Mode: "QIO"
   - Flash Frequency: "80MHz"
4. Conecta el programador FTDI (TX→RX, RX→TX, GND→GND, 5V→5V)
5. Conecta GPIO 0 a GND para modo flash
6. Enciende y sube el firmware
7. Desconecta GPIO 0 de GND y reinicia

## Primer uso

1. La ESP32-CAM crea un AP WiFi: "ESP32-Expiry-Scanner" (pass: config123)
2. Conéctate al AP y ve a http://192.168.4.1
3. Configura:
   - SSID y password de tu WiFi
   - URL del servidor POS (ej: http://192.168.1.100:3001)
4. Guarda — el módulo se reinicia y se conecta a tu red
5. La IP se muestra en el Monitor Serial

## Uso diario

- **Botón físico**: Presiona para capturar foto y enviar al servidor
- **Web UI**: Abre http://[IP-ESP32] y presiona "Capturar"
- **Flujo en POS**: En Pedidos → Recibir, usa el botón "Escanear con ESP32-CAM"

## LEDs de estado

| Color | Significado |
|-------|------------|
| Azul | Listo, conectado |
| Púrpura | Capturando foto |
| Verde | Éxito — fecha enviada |
| Rojo | Error o modo configuración |

## POST endpoint

La ESP32-CAM envía POST a `/api/stock-batches/scan-expiry` con:
- Content-Type: image/jpeg
- Body: raw JPEG bytes

El servidor responde JSON con:
```json
{
  "success": true,
  "rawText": "...",
  "datesFound": ["2026-12-31"],
  "imageSize": 48291
}
```

## API directa (sin ESP32-CAM)

```bash
curl -X POST http://localhost:3001/api/stock-batches/scan-expiry \
  -F "image=@foto.jpg"
```
