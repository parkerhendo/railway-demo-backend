const express = require('express');
const { Client } = require('pg');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(cors());

const DATABASE_URL = process.env === "production" ? process.env.DATABASE_URL : process.env.DATABASE_PUBLIC_URL;
const API_URL = process.env === "production" ? process.env.API_URL : `http://localhost${PORT}`;

// Create users table if it doesn't exist

async function insertUserToDb(user) {
    const client = new Client({
        connectionString: DATABASE_URL,
    });

    try {
        await client.connect();

        console.log("client connected");

        // Create table if not exists
        const createTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            email VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        `;

        client.query(createTableQuery)
            .then(() => console.log('Users table created successfully'))
            .catch(err => console.error('Error creating table:', err));

        // Insert user data
        const insertQuery = `
            INSERT INTO users (first_name, last_name, email)
            VALUES ($1, $2, $3)
          `;
        const values = [
            user.name.first,
            user.name.last,
            user.email,
        ];

        await client.query(insertQuery, values);
        console.log("User successfully inserted into the database.");
    } catch (err) {
        console.error("Error inserting user into database:", err);
    } finally {
        await client.end();
    }
}

// Endpoint to fetch users from randomuser.me and store in database
app.post('/api/fetch-users', async (req, res) => {
    try {
        const count = req.body.count || 10; // Default to 10 users if not specified
        const response = await axios.get(`https://randomuser.me/api/?results=${count}`);
        const users = response.data.results;

        // Insert users into database
        for (const user of users) {
            console.log("Inserting user into database", user);
            await insertUserToDb(user);
        }

        res.json({ message: `Successfully fetched and stored ${users.length} users` });
    } catch (error) {
        console.error('Error fetching and storing users:', error);
        res.status(500).json({ error: error });
    }
});

// Endpoint to get all users from database
app.get('/api/users', async (req, res) => {
    const client = new Client({
        connectionString: DATABASE_URL,
    });
    try {
        await client.connect(); // Missing client.connect()
        console.log("client connected");
        console.log("querying users...");
        const result = await client.query(
            'SELECT * FROM users ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    } finally {
        await client.end(); // Missing client cleanup
    }
});

// Endpoint to get total number of users
app.get('/api/user-count', async (req, res) => {
    try {
        const client = new Client({
            connectionString: DATABASE_URL,
        });
        const result = await client.query('SELECT COUNT(*) FROM users');
        res.json({ total: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Error getting user count:', error);
        res.status(500).json({ error: 'Failed to get user count' });
    }
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
