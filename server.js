const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const dbPath = path.join(__dirname, 'transactions.db');
let db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            date TEXT NOT NULL,
            running_balance REAL NOT NULL
        )`, (err) => {
            if (err) {
                console.error('Error creating table', err.message);
            }
        });
    }
});

const calculateRunningBalance = async () => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM transactions ORDER BY date, id', (err, rows) => {
            if (err) {
                return reject(err);
            }

            let balance = 0;
            const transactions = rows.map(row => {
                balance = row.type === 'credit' ? balance + row.amount : balance - row.amount;
                return { ...row, running_balance: balance };
            });

            resolve(transactions);
        });
    });
};

const updateBalances = async () => {
    const transactions = await calculateRunningBalance();
    db.serialize(() => {
        transactions.forEach(transaction => {
            db.run(`UPDATE transactions SET running_balance = ? WHERE id = ?`, [transaction.running_balance, transaction.id], (err) => {
                if (err) {
                    console.error('Error updating balance', err.message);
                }
            });
        });
    });
};

app.get('/transactions', (req, res) => {
    db.all('SELECT * FROM transactions ORDER BY date desc, id', [], (err, rows) => {
        if (err) {
            res.status(500).send(err.message);
        } else {
            res.json(rows);
        }
    });
});

app.post('/transactions', async (req, res) => {
    const { type, amount, description, date } = req.body;
    if (!type || !amount || !date) {
        return res.status(400).send('Type, amount, and date are required');
    }
    const running_balance = await calculateRunningBalance();
    db.run(`INSERT INTO transactions (type, amount, description, date, running_balance) VALUES (?, ?, ?, ?, ?)`,
        [type, amount, description, date, running_balance], function(err) {
            if (err) {
                res.status(500).send(err.message);
            } else {
                updateBalances();
                res.status(201).send({ transactionId: this.lastID });
            }
        });
});

app.put('/transactions/:id', async (req, res) => {
    const { id } = req.params;
    const { type, amount, description, date } = req.body;
    if (!type || !amount || !date) {
        return res.status(400).send('Type, amount, and date are required');
    }

    db.run(`UPDATE transactions SET type = ?, amount = ?, description = ?, date = ? WHERE id = ?`,
        [type, amount, description, date, id], function(err) {
            if (err) {
                res.status(500).send(err.message);
            } else {
                updateBalances();
                res.status(200).send({ changes: this.changes });
            }
        });
});

app.delete('/transactions/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM transactions WHERE id = ?`, [id], function(err) {
        if (err) {
            res.status(500).send(err.message);
        } else {
            updateBalances();
            res.status(200).send({ changes: this.changes });
        }
    });
});

app.listen(3004, () => {
    console.log('Server is running on port 3000');
});
