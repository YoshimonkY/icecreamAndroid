// server.js — versión sql.js
import express from "express";
import bodyParser from "body-parser";
import { initDB, all, run, saveDB } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static("public"));

let db;
await initDB().then((instance) => (db = instance));

// 🔹 Guardar pedido (cup o legacy)
app.post("/orders", (req, res) => {
    try {
        const { items = [], total, ticket, cups } = req.body;
        const timestamp = new Date().toISOString();

        // Unificar estructura (legacy/cups)
        const allItems = [];
        if (cups && cups.length) {
            cups.forEach(cup => {
                Object.values(cup.items).forEach(item => allItems.push(item));
            });
        } else {
            allItems.push(...items);
        }

        run("INSERT INTO orders (timestamp, total, ticket) VALUES (?, ?, ?)", [timestamp, total, ticket]);
        const orderId = all("SELECT last_insert_rowid() AS id")[0].id;

        allItems.forEach(item => {
            run(
                "INSERT INTO order_items (order_id, flavor, quantity, price) VALUES (?, ?, ?, ?)",
                [orderId, item.flavor, item.quantity, item.price]
            );
        });

        saveDB();
        res.json({ id: orderId, message: "Order saved successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Obtener pedidos
app.get("/orders", (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const orderDir = req.query.order === "ASC" ? "ASC" : "DESC";
    const query = `
    SELECT o.id, o.timestamp, o.total, o.ticket, oi.flavor, oi.quantity, oi.price
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    ORDER BY o.id ${orderDir}
    LIMIT ?;
  `;
    const rows = all(query, [limit]);
    const orders = {};

    rows.forEach(r => {
        if (!orders[r.id]) {
            orders[r.id] = { id: r.id, timestamp: r.timestamp, total: r.total, ticket: r.ticket, items: [] };
        }
        if (r.flavor) orders[r.id].items.push({ flavor: r.flavor, quantity: r.quantity, price: r.price });
    });

    res.json(Object.values(orders));
});

// 🔹 Flavors CRUD
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
        saveDB();
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

    const sql = `UPDATE flavors SET ${updates.join(", ")} WHERE id = ?`;
    params.push(id);
    run(sql, params);
    saveDB();
    res.json({ message: "Flavor updated" });
});

app.delete("/flavors/:id", (req, res) => {
    const { id } = req.params;
    run("DELETE FROM flavors WHERE id = ?", [id]);
    saveDB();
    res.json({ message: "Flavor deleted" });
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));