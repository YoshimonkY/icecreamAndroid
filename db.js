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
      customer TEXT,
      store TEXT,
      timestamp TEXT,
      cups TEXT,
      subtotal REAL,
      discount REAL,
      total REAL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS flavors (
      name TEXT PRIMARY KEY UNIQUE NOT NULL,
      price REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS store_flavors (
      store_name TEXT NOT NULL,
      flavor_name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(flavor_name) REFERENCES flavors(flavor_name)
    );
  `);

  // Insertar sabores iniciales
  const defaultFlavors = [
    'Acai Asai',
    'Arroz con leche',
    'Café',
    'Cajeta',
    'Cereza',
    'Choco Menta',
    'Chocolate (amaranto-cereza envinada)',
    'Coco',
    'Frambuesa',
    'Frambuesa yoghurt',
    'Fresa',
    'Fresa mora',
    'Fresas con crema',
    'Frutos rojos',
    'Gazpacho',
    'Guanábana',
    'Guayaba',
    'Jugo verde',
    'Limón',
    'Malvavisco',
    'Mamey',
    'Mandarina',
    'Mango',
    'Maracuyá',
    'Matcha',
    'Mazapán',
    'Melón',
    'Mezcal higo',
    'Mouse de Naranja',
    'Nanche',
    'Oreo',
    'Pay de limón',
    'Pistache',
    'Pitahaya',
    'Pitaya',
    'Piña',
    'Piñón',
    'Queso',
    'Rompope',
    'Sandía',
    'Tamarindo',
    'Taro',
    'Tequila limón',
    'Tinto',
    'Tuna',
    'Vainilla',
    'Zapote'
  ];

  defaultFlavors.forEach(flavor => {
    db.run(`INSERT OR IGNORE INTO flavors (name, price) VALUES (?, 12.00);`, [flavor]);
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
