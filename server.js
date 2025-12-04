// server.js - archivo comentado línea por línea para explicar qué hace cada instrucción

// Importa el framework Express (basado en Node.js) para crear un servidor HTTP y rutas.
import express from "express";
// Importa body-parser, un middleware que ayuda a parsear cuerpos de petición (JSON, urlencoded).
import bodyParser from "body-parser";
// Importa funciones desde el módulo local db.js: initDB (inicializa DB) y saveDB (guardar DB en disco si aplica).
import { initDB, saveDB } from "./db.js";

// Crea una instancia de la aplicación Express.
const app = express();
// Define el puerto donde correrá el servidor; usa la variable de entorno PORT si existe, sino 3000.
const PORT = process.env.PORT || 3000;

// Middleware: bodyParser.json() convierte automáticamente JSON en req.body para rutas POST/PUT.
app.use(bodyParser.json());
// Middleware: sirve archivos estáticos desde la carpeta "public" (index.html, css, js, imágenes, etc.).
app.use(express.static("public"));

// Variable que contendrá la instancia/handle de la base de datos.
let db;
// Inicializa la base de datos y espera su resolución. Cuando initDB() resuelve, asigna la instancia a `db`.
// Nota: el uso de `await` aquí requiere que el archivo se ejecute en un contexto que soporte top-level await (Node moderno).
await initDB().then((instance) => (db = instance));

// Define helper functions using the local db instance
const run = (sql, params = []) => {
    try {
        console.log("run() called with params:", params);
        const stmt = db.prepare(sql);
        stmt.bind(params);
        stmt.step();
        stmt.free();
        saveDB();
    } catch (e) {
        console.error("run() error:", e.message);
        throw e;
    }
};

const all = (sql, params = []) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
};

// ======================
//  ORDERS
// ======================
// Ruta POST /orders: guarda una orden y sus items en la base de datos.
app.post("/orders", (req, res) => {
    try {
        // Desestructura campos esperados del body; provee valores por defecto (items = []) si no vienen.
        const { customer, store, timestamp, cups, subtotal, discount, total } = req.body;

        console.log("POST /orders received:");
        console.log("  customer:", customer);
        console.log("  store:", store);
        console.log("  timestamp:", timestamp);
        console.log("  cups type:", typeof cups);
        console.log("  cups value:", cups);
        console.log("  total:", total);

        // if (cups && cups.length) {
        //     cups.forEach(cup => Object.values(cup.items).forEach(item => allItems.push(item)));
        // } else {
        //     // Si no hay cups, usamos el array `items` directamente.
        //     allItems.push(...items);
        // }

        // Inserta una fila en la tabla orders con los datos recibidos.
        run("INSERT INTO orders (customer, store, timestamp, cups, subtotal, discount, total) VALUES (?, ?, ?, ?, ?, ?, ?)", [customer, store, timestamp, cups, subtotal, discount, total]);
        // Obtiene el id de la fila recién insertada usando last_insert_rowid.
        const results = db.exec("SELECT max(rowid) from orders");
        const orderId = results && results[0] && results[0].values && results[0].values[0] ? results[0].values[0][0] : null;

        console.log("Order inserted with ID:", orderId);

        // Responde al customer con el id de la orden y un mensaje de éxito en formato JSON.
        res.json({ id: orderId, message: "Order saved successfully" });
    } catch (err) {
        // Si ocurre cualquier error (ej. DB caída, formato inesperado), se responde con 500 y el mensaje del error.
        res.status(500).json({ error: err.message });
    }
});

// Ruta GET /orders: devuelve un listado de órdenes (limitable via query param `limit`) y sus items.
app.get("/orders", (req, res) => {
    // Toma `limit` desde querystring, lo parsea a entero; por defecto 20.
    const limit = parseInt(req.query.limit) || 20;
    // Determina la dirección del orden (ASC o DESC) con validación básica.
    const orderDir = req.query.order === "ASC" ? "ASC" : "DESC";
    // Ejecuta una consulta que trae órdenes y sus items mediante LEFT JOIN; se ordena por el id de la orden.
    const rows = all(`
    SELECT o.id, o.customer, o.store, o.timestamp, o.cups, o.subtotal, o.discount, o.total
    FROM orders o
    ORDER BY o.id ${orderDir}
    LIMIT ?;
  `, [limit]);

    // Construye un objeto `orders` agrupando filas por id para recomponer la estructura: cada orden con su lista de items.
    const orders = {};
    rows.forEach(r => {
        // Si aún no existe la orden en el objeto, la inicializa con campos base y un array items vacío.
        if (!orders[r.id]) orders[r.id] = { id: r.id, customer: r.customer, store: r.store, timestamp: r.timestamp, cups: r.cups, subtotal: r.subtotal, discount: r.discount, total: r.total };
        // Parse items from ticket if available
        // if (r.ticket && orders[r.id].items.length === 0) {
        //     const lines = r.ticket.split('\n');
        //     lines.forEach(line => {
        //         const match = line.match(/^(.+?)\s+(\d+)\s+-\s+-\s+-\s+\$(\d+\.\d{2})$/);
        //         if (match) {
        //             const [, flavor, quantity, price] = match;
        //             orders[r.id].items.push({ flavor: flavor.trim(), quantity: parseInt(quantity), price: parseFloat(price) });
        //         }
        //     });
        // }
    });


    // Responde con un array de órdenes (valores del objeto orders).
    res.json(Object.values(orders));
    console.log(orders);
});

// ======================
//  ALL ORDERS
// ======================
// Ruta GET /all-orders: similar a /orders, pero adicionalmente intenta parsear items desde el campo `ticket`
// cuando la consulta a order_items no devuelve filas (útil si antiguas órdenes almacenaron solo el texto del ticket).
app.get("/all-orders", (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const orderDir = req.query.order === "ASC" ? "ASC" : "DESC";
    const rows = all(`
    SELECT o.id, o.customer, o.store, o.timestamp, o.cups, o.subtotal, o.discount, o.total
    FROM orders o
    ORDER BY o.id ${orderDir}
    LIMIT ?;
  `, [limit]);

    const orders = {};
    rows.forEach(r => {
        if (!orders[r.id]) orders[r.id] = {
            id: r.id, customer: r.customer, store: r.store, timestamp: r.timestamp,
            cups: r.cups, subtotal: r.subtotal, discount: r.discount, total: r.total
        };
        // Parse items from ticket if available
        if (r.ticket && orders[r.id].items.length === 0) {
            const lines = r.ticket.split('\n');
            lines.forEach(line => {
                const match = line.match(/^(.+?)\s+(\d+)\s+-\s+-\s+-\s+\$(\d+\.\d{2})$/);
                if (match) {
                    const [, flavor, quantity, price] = match;
                    orders[r.id].items.push({ flavor: flavor.trim(), quantity: parseInt(quantity), price: parseFloat(price) });
                }
            });
        }
    });

    // Ticket parsing is already done in the forEach above

    // Responde con todas las órdenes (convertidas a array).
    res.json(Object.values(orders));
});

// ======================
//  FLAVORS
// ======================
// Ruta GET /flavors: devuelve todos los sabores disponibles ordenados por nombre.
app.get("/flavors", (req, res) => {
    try {
        const rows = all("SELECT * FROM flavors ORDER BY name");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta POST /flavors: agrega un nuevo sabor con nombre y precio.
app.post("/flavors", (req, res) => {
    const { name, price } = req.body; // toma name y price del cuerpo JSON
    // Validación básica: ambos campos son requeridos.
    if (!name || !price) return res.status(400).json({ error: "Name and price required" });
    try {
        // Inserta nuevo registro en la tabla flavors.
        run("INSERT INTO flavors (name, price) VALUES (?, ?)", [name, price]);
        res.json({ message: "Sabor agregado" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta PUT /flavors/:name: actualiza campos (price) de un sabor específico.
app.put("/flavors/:name", (req, res) => {
    const { name } = req.params; // name proviene de la ruta
    const { price } = req.body; // campos que pueden actualizarse
    const updates = [];
    const params = [];

    // Solo agrega a la lista de updates si vienen en el body (no undefined).
    if (price !== undefined) { updates.push("price = ?"); params.push(price); }

    // Si no hay campos para actualizar, responde 400 (bad request).
    if (!updates.length) return res.status(400).json({ error: "No fields to update" });

    // Ejecuta la sentencia UPDATE con los parámetros acumulados y el name al final.
    run(`UPDATE flavors SET ${updates.join(", ")} WHERE name = ?`, [...params, name]);
    res.json({ message: "Flavor updated" });
});

// Ruta DELETE /flavors/:name: elimina un sabor por name.
app.delete("/flavors/:name", (req, res) => {
    const { name } = req.params;
    run("DELETE FROM flavors WHERE name = ?", [name]);
    res.json({ message: "Flavor deleted" });
});

// ======================
//  STORE FLAVORS
// ======================

// Obtener sabores de una tienda (store-specific flavors)
app.get("/store-flavors/:store", (req, res) => {
    const { store } = req.params; // nombre de la store en la ruta
    try {
        // Consulta asignaciones existentes para esa tienda en la tabla store_flavors.
        const existing = all("SELECT * FROM store_flavors WHERE store_name = ?", [store]);

        // Si la tienda es "puesto2" y no tiene sabores asignados, copiamos los sabores del "puesto" base.
        if (store === "puesto2" && existing.length === 0) {
            const puestoRows = all("SELECT * FROM store_flavors WHERE store_name = ?", ["puesto"]);
            if (puestoRows.length > 0) {
                // Insertamos para puesto2 las mismas asignaciones encontradas en "puesto".
                puestoRows.forEach(row => {
                    run("INSERT INTO store_flavors (store_name, flavor_name) VALUES (?, ?)", ["puesto2", row.flavor_name]);
                });
            }
        }

        // Consulta que trae todos los sabores y une con store_flavors para indicar si están activos en la tienda.
        const rows = all(`
          SELECT f.*, CASE WHEN sf.flavor_name IS NOT NULL THEN 1 ELSE 0 END as store_active
          FROM flavors f
          LEFT JOIN store_flavors sf ON f.name = sf.flavor_name AND sf.store_name = ?
          ORDER BY f.name;
        `, [store]);

        // Devuelve la lista de sabores con la información de si está activo en esa tienda.
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar asignaciones de sabores por tienda: recibe un array de flavorAssignments en el body.
app.post("/store-flavors/:store", (req, res) => {
    const { store } = req.params;
    const { flavorAssignments } = req.body;
    // Valida que flavorAssignments sea un array.
    if (!Array.isArray(flavorAssignments)) {
        return res.status(400).json({ error: "flavorAssignments must be an array" });
    }

    try {
        // Borra asignaciones previas para esa tienda antes de insertar las nuevas (operación de reemplazo).
        run("DELETE FROM store_flavors WHERE store_name = ?", [store]);

        // Inserta las asignaciones que vengan en el array.
        flavorAssignments.forEach(a => {
            run("INSERT INTO store_flavors (store_name, flavor_name) VALUES (?, ?)", [store, a.flavorName]);
        });

        res.json({ message: "Store flavors updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================
//  START SERVER
// ======================
// Inicia el servidor escuchando en el puerto configurado y en todas las interfaces (0.0.0.0).
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));
