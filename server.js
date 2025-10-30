import express from "express";
import bodyParser from "body-parser";
import { initDB, all, run, saveDB } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static("public"));

let db;
await initDB().then((instance) => (db = instance));

// ======================
//  ORDERS
// ======================
app.post("/orders", (req, res) => {
    try {
        const { items = [], total, ticket, cups } = req.body;
        const timestamp = new Date().toISOString();
        const allItems = [];

        if (cups && cups.length) {
            cups.forEach(cup => Object.values(cup.items).forEach(item => allItems.push(item)));
        } else {
            allItems.push(...items);
        }

        run("INSERT INTO orders (timestamp, total, ticket) VALUES (?, ?, ?)", [timestamp, total, ticket]);
        const orderId = all("SELECT last_insert_rowid() AS id")[0].id;

        allItems.forEach(item => {
            run("INSERT INTO order_items (order_id, flavor, quantity, price) VALUES (?, ?, ?, ?)",
                [orderId, item.flavor, item.quantity, item.price]);
        });

        res.json({ id: orderId, message: "Order saved successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/orders", (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const orderDir = req.query.order === "ASC" ? "ASC" : "DESC";
    const rows = all(`
    SELECT o.id, o.timestamp, o.total, o.ticket, oi.flavor, oi.quantity, oi.price
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    ORDER BY o.id ${orderDir}
    LIMIT ?;
  `, [limit]);

    const orders = {};
    rows.forEach(r => {
        if (!orders[r.id]) orders[r.id] = { id: r.id, timestamp: r.timestamp, total: r.total, ticket: r.ticket, items: [] };
        if (r.flavor) orders[r.id].items.push({ flavor: r.flavor, quantity: r.quantity, price: r.price });
    });

    res.json(Object.values(orders));
});

// ======================
//  FLAVORS
// ======================
app.get("/flavors", (req, res) => {
    try {
        const rows = all("SELECT * FROM flavors ORDER BY name");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/flavors", (req, res) => {
    const { name, price } = req.body;
    if (!name || !price) return res.status(400).json({ error: "Name and price required" });
    try {
        run("INSERT INTO flavors (name, price) VALUES (?, ?)", [name, price]);
        res.json({ message: "Flavor added successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/flavors/:id", (req, res) => {
    const { id } = req.params;
    const { price, active } = req.body;
    const updates = [];
    const params = [];

    if (price !== undefined) { updates.push("price = ?"); params.push(price); }
    if (active !== undefined) { updates.push("active = ?"); params.push(active); }

    if (!updates.length) return res.status(400).json({ error: "No fields to update" });

    run(`UPDATE flavors SET ${updates.join(", ")} WHERE id = ?`, [...params, id]);
    res.json({ message: "Flavor updated" });
});

app.delete("/flavors/:id", (req, res) => {
    const { id } = req.params;
    run("DELETE FROM flavors WHERE id = ?", [id]);
    res.json({ message: "Flavor deleted" });
});

// ======================
//  STORE FLAVORS
// ======================

// Obtener sabores de una tienda
app.get("/store-flavors/:store", (req, res) => {
    const { store } = req.params;
    try {
        const existing = all("SELECT * FROM store_flavors WHERE store_name = ?", [store]);

        // Si puesto2 no tiene sabores, copiamos de puesto
        if (store === "puesto2" && existing.length === 0) {
            const puestoRows = all("SELECT * FROM store_flavors WHERE store_name = ?", ["puesto"]);
            if (puestoRows.length > 0) {
                puestoRows.forEach(row => {
                    run("INSERT INTO store_flavors (store_name, flavor_id, active) VALUES (?, ?, ?)", ["puesto2", row.flavor_id, row.active]);
                });
            }
        }

        const rows = all(`
      SELECT f.*, sf.active as store_active
      FROM flavors f
      LEFT JOIN store_flavors sf ON f.id = sf.flavor_id AND sf.store_name = ?
      ORDER BY f.name;
    `, [store]);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar asignaciones de sabores por tienda
app.post("/store-flavors/:store", (req, res) => {
    const { store } = req.params;
    const { flavorAssignments } = req.body;
    if (!Array.isArray(flavorAssignments)) {
        return res.status(400).json({ error: "flavorAssignments must be an array" });
    }

    try {
        // Limpiar asignaciones previas
        run("DELETE FROM store_flavors WHERE store_name = ?", [store]);

        flavorAssignments.forEach(a => {
            if (a.active) {
                run("INSERT INTO store_flavors (store_name, flavor_id, active) VALUES (?, ?, 1)", [store, a.flavorId]);
            }
        });

        res.json({ message: "Store flavors updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================
//  START SERVER
// ======================
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));
