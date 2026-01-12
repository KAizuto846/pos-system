# 💰 Sistema POS (Punto de Venta)

Sistema de punto de venta r\u00e1pido, robusto y completamente local. Dise\u00f1ado para funcionar en GitHub Codespaces y ser f\u00e1cil de actualizar.

## \u2728 Caracter\u00edsticas

- \u2705 **100% Local**: Base de datos SQLite, sin dependencias cloud
- \ud83d\ude80 **R\u00e1pido**: Node.js + Express, sin frameworks pesados
- \ud83d\udd12 **Seguro**: Autenticaci\u00f3n con bcrypt y sesiones
- \ud83d\udcbb **Codespaces Ready**: Funciona perfectamente en GitHub Codespaces
- \ud83d\udd04 **F\u00e1cil de actualizar**: Solo `git pull` y listo

## \ud83d\udee0\ufe0f Instalaci\u00f3n

### En GitHub Codespaces

1. Abre este repositorio en Codespaces
2. Instala dependencias:
```bash
npm install
```

3. Inicia el servidor:
```bash
npm start
```

4. Abre el puerto 3000 en tu navegador

### Local

1. Clona el repositorio:
```bash
git clone https://github.com/KAizuto846/pos-system.git
cd pos-system
```

2. Instala dependencias:
```bash
npm install
```

3. Inicia el servidor:
```bash
npm start
```

4. Abre http://localhost:3000

## \ud83d\udcda Estructura del Proyecto

```
pos-system/
\u251c\u2500\u2500 database/
\u2502   \u251c\u2500\u2500 init.js         # Inicializaci\u00f3n de SQLite
\u2502   \u2514\u2500\u2500 pos.db          # Base de datos (auto-generada)
\u251c\u2500\u2500 public/
\u2502   \u251c\u2500\u2500 index.html      # Interfaz de login
\u2502   \u251c\u2500\u2500 styles.css      # Estilos
\u2502   \u2514\u2500\u2500 login.js        # L\u00f3gica del login
\u251c\u2500\u2500 server.js           # Servidor Express
\u251c\u2500\u2500 package.json
\u2514\u2500\u2500 README.md
```

## \ud83d\udcdd Uso

### Primera Vez

1. Al abrir la aplicaci\u00f3n por primera vez, se te pedir\u00e1 crear un administrador
2. Ingresa un usuario y contrase\u00f1a (m\u00ednimo 6 caracteres)
3. El administrador quedar\u00e1 guardado en la base de datos local

### Siguientes Usos

1. Ingresa con tu usuario y contrase\u00f1a
2. Accede al sistema

## \ud83d\udd04 Actualizaci\u00f3n

Para actualizar a la \u00faltima versi\u00f3n:

```bash
git pull origin main
npm install  # Solo si hay nuevas dependencias
```

**Nota**: La base de datos est\u00e1 en `.gitignore`, por lo que tus datos NO se sobrescribir\u00e1n al actualizar.

## \ud83d\udce6 API Endpoints

### Autenticaci\u00f3n

- `GET /api/check-admin` - Verifica si existe administrador
- `POST /api/create-admin` - Crea el primer administrador
- `POST /api/login` - Inicia sesi\u00f3n
- `POST /api/logout` - Cierra sesi\u00f3n
- `GET /api/session` - Verifica sesi\u00f3n actual

## \ud83d\udc68\u200d\ud83d\udcbb Tecnolog\u00edas

- **Backend**: Node.js + Express
- **Base de datos**: SQLite (better-sqlite3)
- **Seguridad**: bcrypt + express-session
- **Frontend**: HTML5 + CSS3 + JavaScript Vanilla

## \ud83d\udd10 Seguridad

- Contrase\u00f1as hasheadas con bcrypt (10 rounds)
- Sesiones seguras con express-session
- Validaciones en cliente y servidor
- Base de datos local protegida

## \ud83d\udee3\ufe0f Roadmap

- [x] Sistema de autenticaci\u00f3n
- [ ] Dashboard principal
- [ ] Gesti\u00f3n de productos
- [ ] M\u00f3dulo de ventas
- [ ] Inventario
- [ ] Reportes
- [ ] Impresi\u00f3n de tickets

## \ud83d\udc65 Autor

**Victor Rivera** - [KAizuto846](https://github.com/KAizuto846)

## \ud83d\udcdd Licencia

MIT License - Puedes usar este proyecto libremente

---

\ud83d\ude80 **Desarrollado con velocidad y robustez en mente**
