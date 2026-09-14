/*
 * ESP32-CAM Expiry Scanner Firmware
 * 
 * AI-Thinker ESP32-CAM module
 * Toma foto del empaque de un producto, la envía al servidor POS
 * para OCR de la fecha de vencimiento.
 * 
 * Conexiones:
 *   Botón captura: GPIO 13 (con pull-up externo de 10kΩ a 3.3V)
 *   LED RGB:
 *     Rojo: GPIO 12
 *     Verde: GPIO 14
 *     Azul: GPIO 15
 *   LED Flash: GPIO 4
 *   
 * Configuración:
 *   1. Al iniciar, entra en modo AP (SSID: "ESP32-Expiry-Scanner")
 *   2. Conéctate al WiFi AP y ve a http://192.168.4.1
 *   3. Configura SSID/PASSWORD del WiFi + URL del servidor POS
 *   4. Se reinicia y se conecta a tu red
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <EEPROM.h>
#include "esp_camera.h"

// ===== Pin Definitions (AI-Thinker ESP32-CAM) =====
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// ===== GPIO =====
#define BUTTON_PIN        13
#define LED_RED           12
#define LED_GREEN         14
#define LED_BLUE          15
#define FLASH_PIN          4

// ===== EEPROM Config =====
#define EEPROM_SIZE       512
#define CONFIG_MAGIC      0x4553  // "ES"

struct Config {
  uint16_t magic;
  char ssid[64];
  char password[64];
  char serverUrl[256];
  char apiKey[64];
};

Config config;
WebServer server(80);
bool configMode = false;
unsigned long lastCapture = 0;

// ===== Camera =====
static camera_config_t camera_config = {
  .pin_pwdn  = PWDN_GPIO_NUM,
  .pin_reset = RESET_GPIO_NUM,
  .pin_xclk = XCLK_GPIO_NUM,
  .pin_sscb_sda = SIOD_GPIO_NUM,
  .pin_sscb_scl = SIOC_GPIO_NUM,
  .pin_d7 = Y9_GPIO_NUM,
  .pin_d6 = Y8_GPIO_NUM,
  .pin_d5 = Y7_GPIO_NUM,
  .pin_d4 = Y6_GPIO_NUM,
  .pin_d3 = Y5_GPIO_NUM,
  .pin_d2 = Y4_GPIO_NUM,
  .pin_d1 = Y3_GPIO_NUM,
  .pin_d0 = Y2_GPIO_NUM,
  .pin_vsync = VSYNC_GPIO_NUM,
  .pin_href = HREF_GPIO_NUM,
  .pin_pclk = PCLK_GPIO_NUM,
  .xclk_freq_hz = 20000000,
  .pixel_format = PIXFORMAT_JPEG,
  .frame_size = FRAMESIZE_SVGA,   // 800x600 - good balance quality/speed
  .jpeg_quality = 12,
  .fb_count = 1,
};

// ===== LED Control =====
void setLED(bool r, bool g, bool b) {
  digitalWrite(LED_RED, r ? HIGH : LOW);
  digitalWrite(LED_GREEN, g ? HIGH : LOW);
  digitalWrite(LED_BLUE, b ? HIGH : LOW);
}

void ledReady()    { setLED(0, 0, 1); }  // Blue
void ledCapturing(){ setLED(1, 0, 1); }  // Purple
void ledSuccess()  { setLED(0, 1, 0); }  // Green
void ledError()    { setLED(1, 0, 0); }  // Red
void ledOff()      { setLED(0, 0, 0); }

// ===== EEPROM Config =====
void loadConfig() {
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.get(0, config);
  if (config.magic != CONFIG_MAGIC) {
    // Default config
    config.magic = CONFIG_MAGIC;
    strcpy(config.ssid, "");
    strcpy(config.password, "");
    strcpy(config.serverUrl, "http://192.168.1.100:3001");
    strcpy(config.apiKey, "");
    saveConfig();
  }
}

void saveConfig() {
  EEPROM.put(0, config);
  EEPROM.commit();
}

// ===== Camera Init =====
bool initCamera() {
  esp_err_t err = esp_camera_init(&camera_config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }
  
  sensor_t *s = esp_camera_sensor_get();
  s->set_brightness(s, 0);
  s->set_contrast(s, 0);
  s->set_saturation(s, 0);
  s->set_special_effect(s, 0);
  s->set_whitebal(s, 1);
  s->set_awb_gain(s, 1);
  s->set_wb_mode(s, 0);
  s->set_exposure_ctrl(s, 1);
  s->set_aec2(s, 0);
  s->set_ae_level(s, 0);
  s->set_aec_value(s, 300);
  s->set_gain_ctrl(s, 1);
  s->set_agc_gain(s, 0);
  s->set_gainceiling(s, (gainceiling_t)0);
  s->set_bpc(s, 0);
  s->set_wpc(s, 1);
  s->set_raw_gma(s, 1);
  s->set_lenc(s, 1);
  s->set_hmirror(s, 0);
  s->set_vflip(s, 0);
  s->set_dcw(s, 1);
  s->set_colorbar(s, 0);
  
  return true;
}

// ===== Capture and Send =====
String captureAndSend() {
  ledCapturing();
  
  // Flash on
  digitalWrite(FLASH_PIN, HIGH);
  delay(100);
  
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    digitalWrite(FLASH_PIN, LOW);
    ledError();
    return "ERROR: Camera capture failed";
  }
  
  digitalWrite(FLASH_PIN, LOW);
  
  // Send to server
  WiFiClient client;
  HTTPClient http;
  
  String url = String(config.serverUrl) + "/api/stock-batches/scan-expiry";
  
  http.begin(client, url);
  http.addHeader("Content-Type", "image/jpeg");
  
  int httpCode = http.POST(fb->buf, fb->len);
  
  esp_camera_fb_return(fb);
  
  String response;
  if (httpCode > 0) {
    response = http.getString();
    ledSuccess();
  } else {
    response = "ERROR: HTTP " + String(httpCode);
    ledError();
  }
  
  http.end();
  return response;
}

// ===== Web Handlers =====
void handleRoot() {
  String html = "<!DOCTYPE html><html><head>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<meta charset='UTF-8'>";
  html += "<title>ESP32-CAM Expiry Scanner</title>";
  html += "<style>body{font-family:Arial;background:#1e293b;color:#e2e8f0;padding:20px;max-width:600px;margin:auto}";
  html += "h1{color:#34d399}label{display:block;margin:12px 0 4px}input{width:100%;padding:8px;border:1px solid #475569;border-radius:6px;background:#334155;color:#e2e8f0;box-sizing:border-box}";
  html += "button{background:#34d399;color:#1e293b;border:none;padding:10px 20px;border-radius:6px;font-size:16px;cursor:pointer;margin:4px}";
  html += ".status{padding:10px;border-radius:6px;margin:10px 0;display:none}</style></head><body>";
  html += "<h1>🔍 Escáner de Vencimientos</h1>";
  
  if (configMode) {
    html += "<h2>Configuración WiFi</h2>";
    html += "<form method='POST' action='/save'>";
    html += "<label>SSID WiFi</label><input type='text' name='ssid' value='" + String(config.ssid) + "'>";
    html += "<label>Contraseña</label><input type='password' name='password'>";
    html += "<label>URL del Servidor POS</label><input type='text' name='serverUrl' value='" + String(config.serverUrl) + "'>";
    html += "<br><br><button type='submit'>Guardar y Reiniciar</button>";
    html += "</form>";
  } else {
    html += "<p>Conectado a: <strong>" + String(config.ssid) + "</strong></p>";
    html += "<p>Servidor: <strong>" + String(config.serverUrl) + "</strong></p>";
    html += "<button onclick='capture()' style='font-size:20px;padding:15px 30px'>📸 Capturar</button>";
    html += "<button onclick='toggleFlash()'>💡 Flash</button>";
    html += "<div id='status' class='status'></div>";
    html += "<div id='result' style='margin-top:12px;white-space:pre-wrap;font-size:12px;color:#94a3b8'></div>";
    html += "<script>";
    html += "var flash=false;";
    html += "function toggleFlash(){flash=!flash;fetch('/flash?on='+(flash?1:0));}";
    html += "function capture(){";
    html += "var s=document.getElementById('status');var r=document.getElementById('result');";
    html += "s.style.display='block';s.style.background='#3b82f6';s.innerText='📸 Capturando...';";
    html += "fetch('/capture').then(x=>x.text()).then(t=>{";
    html += "s.style.background='#22c55e';s.innerText='✅ Foto enviada';";
    html += "try{var d=JSON.parse(t);r.innerText='Fechas encontradas: '+(d.datesFound?d.datesFound.join(', '):'ninguna')+'\\nTexto: '+d.rawText;}";
    html += "catch(e){r.innerText=t;}";
    html += "}).catch(e=>{s.style.background='#ef4444';s.innerText='❌ Error: '+e;})";
    html += "}";
    html += "setInterval(function(){fetch('/ping').then(x=>x.text()).then(t=>{";
    html += "document.getElementById('status').style.display=t=='OK'?'none':'block';";
    html += "});},10000);";
    html += "</script>";
  }
  
  html += "</body></html>";
  server.send(200, "text/html", html);
}

void handleCapture() {
  String result = captureAndSend();
  server.send(200, "text/plain", result);
}

void handleFlash() {
  if (server.hasArg("on")) {
    digitalWrite(FLASH_PIN, server.arg("on") == "1" ? HIGH : LOW);
  }
  server.send(200, "text/plain", "OK");
}

void handlePing() {
  server.send(200, "text/plain", "OK");
}

void handleSave() {
  if (server.hasArg("ssid")) {
    strlcpy(config.ssid, server.arg("ssid").c_str(), sizeof(config.ssid));
  }
  if (server.hasArg("password") && server.arg("password").length() > 0) {
    strlcpy(config.password, server.arg("password").c_str(), sizeof(config.password));
  }
  if (server.hasArg("serverUrl")) {
    strlcpy(config.serverUrl, server.arg("serverUrl").c_str(), sizeof(config.serverUrl));
  }
  saveConfig();
  
  String html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta http-equiv='refresh' content='5'></head><body>";
  html += "<h2>✅ Configuración guardada. Reiniciando...</h2>";
  html += "</body></html>";
  server.send(200, "text/html", html);
  
  delay(1000);
  ESP.restart();
}

void handleAPConfig() {
  configMode = true;
  handleRoot();
  configMode = false;
}

// ===== Setup =====
void setup() {
  Serial.begin(115200);
  Serial.println("\n\nESP32-CAM Expiry Scanner v1.0");
  
  // GPIO
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);
  pinMode(FLASH_PIN, OUTPUT);
  ledOff();
  
  // Load config
  loadConfig();
  
  // Try to connect to WiFi
  if (strlen(config.ssid) > 0) {
    WiFi.begin(config.ssid, config.password);
    Serial.print("Connecting to WiFi");
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nConnected!");
      Serial.print("IP: ");
      Serial.println(WiFi.localIP());
      ledReady();
      configMode = false;
    } else {
      Serial.println("\nWiFi failed!");
      configMode = true;
    }
  } else {
    configMode = true;
  }
  
  if (configMode) {
    // Start AP mode for configuration
    WiFi.mode(WIFI_AP);
    WiFi.softAP("ESP32-Expiry-Scanner", "config123");
    Serial.print("AP IP: ");
    Serial.println(WiFi.softAPIP());
    ledError(); // Red = needs config
  }
  
  // Init camera
  if (!initCamera()) {
    Serial.println("Camera init failed!");
    // Blink red 3 times
    for (int i = 0; i < 3; i++) {
      ledError();
      delay(300);
      ledOff();
      delay(300);
    }
  }
  
  // Web server
  server.on("/", handleRoot);
  server.on("/capture", handleCapture);
  server.on("/flash", handleFlash);
  server.on("/ping", handlePing);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/config", handleAPConfig);
  server.begin();
  
  Serial.println("HTTP server started");
}

// ===== Loop =====
void loop() {
  server.handleClient();
  
  // Button press → capture and send
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(50); // Debounce
    if (digitalRead(BUTTON_PIN) == LOW) {
      while (digitalRead(BUTTON_PIN) == LOW) delay(10);
      
      if (!configMode) {
        Serial.println("Button press -> capturing");
        String result = captureAndSend();
        Serial.println(result);
        
        // Keep LED green for 2 seconds
        delay(2000);
        ledReady();
      }
    }
  }
}
