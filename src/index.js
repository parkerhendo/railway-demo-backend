const express = require('express');
const { Client } = require('pg');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8081;

// Middleware
app.use(express.json());
app.use(cors());

const DATABASE_URL = process.env === "production" ? process.env.DATABASE_URL : process.env.DATABASE_PUBLIC_URL;
const API_URL = process.env === "production" ? process.env.API_URL : `http://localhost${PORT}`;



// PostgreSQL connection configuration
const pool = new Client({
    connectionString: DATABASE_URL,
});

// Create users table if it doesn't exist
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(100),
    avatar VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

pool.query(createTableQuery)
  .then(() => console.log('Users table created successfully'))
  .catch(err => console.error('Error creating table:', err));

// Endpoint to fetch users from randomuser.me and store in database
app.post('/api/fetch-users', async (req, res) => {
  try {
    const count = req.query.count || 5; // Default to 5 users if not specified
    const response = await axios.get(`https://randomuser.me/api/?results=${count}`);
    const users = response.data.results;

    // Insert users into database
    for (const user of users) {
      await pool.query(
        'INSERT INTO users (first_name, last_name, email, avatar) VALUES ($1, $2, $3, $4)',
        [
          user.name.first,
          user.name.last,
          user.email,
          user.picture.large
        ]
      );
    }

    res.json({ message: `Successfully fetched and stored ${users.length} users` });
  } catch (error) {
    console.error('Error fetching and storing users:', error);
    res.status(500).json({ error: 'Failed to fetch and store users' });
  }
});

// Endpoint to get all users from database
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
