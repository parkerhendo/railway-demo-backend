const express = require('express');
const { Client } = require('pg');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const winston = require('winston');
const app = express();
const PORT = process.env.PORT || 8080;

// Configure Winston logger
const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.json()
      )
    })
  ]
});

// Middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(cors());

const DATABASE_URL = process.env.NODE_ENV === 'production' ? process.env.DATABASE_URL : process.env.DATABASE_PUBLIC_URL;

const OTHER_VARIABLE = process.env.ENV_VAR

const onError = (request, error) => {
  logger.error('Error occurred', { level: 'error', error: error.message, stack: error.stack });
}

// Create users table if it doesn't exist
async function insertUserToDb(user) {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    const startTime = Date.now();
    await client.connect();
    logger.info('Database client connected successfully', { level: 'info' });

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

    await client.query(createTableQuery);
    logger.info('Users table created or already exists', { level: 'info' });

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
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Warn if database operation takes too long
    if (duration > 1000) {
      logger.warn('Slow database operation detected', {
        level: 'warn',
        operation: 'insert_user',
        duration_ms: duration,
        threshold_ms: 1000
      });
    }

    logger.info('User inserted successfully', {
      level: 'info',
      firstName: user.name.first,
      lastName: user.name.last,
      email: user.email,
      duration_ms: duration
    });
  } catch (err) {
    logger.error('Error inserting user into database', {
      level: 'error',
      error: err.message,
      stack: err.stack,
      user: {
        firstName: user.name.first,
        lastName: user.name.last,
        email: user.email
      }
    });
  } finally {
    await client.end();
  }
}

// Endpoint to fetch users from randomuser.me and store in database
app.post('/api/fetch-users', async (req, res) => {
  try {
    const count = req.body.count || 10;

    // Warn if requesting too many users
    if (count > 50) {
      logger.warn('Large user fetch request detected', {
        level: 'warn',
        requested_count: count,
        threshold: 50
      });
    }

    logger.info('Fetching users from randomuser.me', { level: 'info', count });

    const response = await axios.get(`https://randomuser.me/api/?results=${count}`);
    const users = response.data.results;
    logger.info('Successfully fetched users from randomuser.me', { level: 'info', count: users.length });

    // Insert users into database
    for (const user of users) {
      logger.info('Processing user for database insertion', {
        level: 'info',
        email: user.email
      });
      await insertUserToDb(user);
    }

    res.json({ message: `Successfully fetched and stored ${users.length} users` });
  } catch (error) {
    onError(req, error);
    logger.error('Error in fetch-users endpoint', {
      level: 'error',
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get all users from database
app.get('/api/users', async (req, res) => {
  const client = new Client({
    connectionString: DATABASE_URL,
  });
  try {
    const startTime = Date.now();
    await client.connect();
    logger.info('Database client connected for users fetch', { level: 'info' });

    const result = await client.query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Warn if query takes too long
    if (duration > 2000) {
      logger.warn('Slow database query detected', {
        level: 'warn',
        operation: 'fetch_all_users',
        duration_ms: duration,
        threshold_ms: 2000,
        result_count: result.rows.length
      });
    }

    // Warn if result set is large
    if (result.rows.length > 1000) {
      logger.warn('Large result set detected', {
        level: 'warn',
        operation: 'fetch_all_users',
        result_count: result.rows.length,
        threshold: 1000
      });
    }

    logger.info('Successfully fetched users from database', {
      level: 'info',
      count: result.rows.length,
      duration_ms: duration
    });

    res.json(result.rows);
  } catch (error) {
    onError(req, error);
    logger.error('Error fetching users from database', {
      level: 'error',
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to fetch users' });
  } finally {
    await client.end();
  }
});

// Endpoint to get total number of users
app.get('/api/user-count', async (req, res) => {
  const client = new Client({
    connectionString: DATABASE_URL,
  });
  try {
    await client.connect();
    logger.info('Database client connected for user count', { level: 'info' });

    const result = await client.query('SELECT COUNT(*) FROM users');
    const count = parseInt(result.rows[0].count);

    // Warn if user count is high
    if (count > 10000) {
      logger.warn('High user count detected', {
        level: 'warn',
        count: count,
        threshold: 10000
      });
    }

    logger.info('Successfully fetched user count', { level: 'info', count });

    res.json({ total: count });
  } catch (error) {
    onError(req, error);
    logger.error('Error getting user count', {
      level: 'error',
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to get user count' });
  } finally {
    await client.end();
  }
});

// Endpoint to trigger a failure
app.get('/api/trigger-failure', async (req, res) => {
  const client = new Client({
    connectionString: DATABASE_URL,
  });
  try {
    await client.connect();
    logger.info('Database client connected for failure test', { level: 'info' });

    // Attempt to perform an invalid query that will fail
    await client.query('SELECT * FROM nonexistent_table');

    res.json({ message: 'This should not be reached' });
  } catch (error) {
    onError(req, error);
    logger.error({
      message: "Deliberate failure triggered",
      error: error.message,
      stack: error.stack,
      endpoint: '/api/trigger-failure',
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      error: 'Failure successfully triggered',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

app.listen(PORT, () => {
  logger.info(`Server started successfully`, { level: 'info', port: PORT });
});
