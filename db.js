// db.js — versión sql.js (sin dependencias nativas)
import initSqlJs from "sql.js";
import fs from "fs";

const dbFile = "./icecream.db";
let db;

export async function initDB() {
    const SQL = await initSqlJs({
        locateFile: (file) => `node_modules/sql.js/dist/${file}`,
    });

    // Cargar base existente o crear una nueva
    if (fs.existsSync(dbFile)) {
        const fileBuffer = fs.readFileSync(dbFile);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Crear tablas
    db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      total REAL,
      ticket TEXT
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      flavor TEXT,
      quantity INTEGER,
      price REAL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS flavors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      price REAL NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS store_flavors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_name TEXT NOT NULL,
      flavor_id INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(flavor_id) REFERENCES flavors(id),
      UNIQUE(store_name, flavor_id)
    );
  `);

    // Insertar sabores iniciales
    const defaultFlavors = [
        'Limón', 'Mango', 'Fresa', 'Fresa mora', 'Guanábana', 'Guayaba',
        'Maracuyá', 'Tuna', 'Sandía', 'Melón', 'Nanche', 'Tinto',
        'Jugo verde', 'Mandarina', 'Pitaya', 'Pitahaya', 'Tamarindo',
        'Piña', 'Acai Asai', 'Zapote', 'Gazpacho', 'Frambuesa',
        'Frutos rojos', 'Tequila limón', 'Mezcal higo', 'Queso',
        'Taro', 'Mamey', 'Coco', 'Pistache', 'Piñón', 'Choco Menta',
        'Chocolate (amaranto-cereza envinada)', 'Vainilla', 'Oreo',
        'Malvavisco', 'Cajeta', 'Fresas con crema', 'Café',
        'Pay de limón', 'Matcha', 'Mouse de Naranja', 'Arroz con leche',
        'Mazapán', 'Cereza', 'Frambuesa yoghurt', 'Rompope'
    ];

    defaultFlavors.forEach(name => {
        db.run(`INSERT OR IGNORE INTO flavors (name, price) VALUES (?, 12.00);`, [name]);
    });

    saveDB();
    return db;
}

// Guardar cambios en disco
export function saveDB() {
    const data = db.export();
    fs.writeFileSync(dbFile, Buffer.from(data));
}

// Ejecutar query sin retorno
export function run(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
    saveDB();
}

// Obtener varias filas
export function all(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

// Obtener una sola fila
export function get(sql, params = []) {
    const rows = all(sql, params);
    return rows[0] || null;
}
