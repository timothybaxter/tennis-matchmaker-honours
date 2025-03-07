import { MongoClient } from 'mongodb';

// Cache for MongoDB client and database connections
let cachedClient = null;
let cachedDbs = {};

/**
 * Connect to the primary database for this service
 * Enhanced with debugging logs
 */
export async function connectToDatabase() {
    try {
        console.log('Attempting to connect to primary database...');

        // Determine which database to use
        const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || '';
        console.log(`Function name: ${functionName}`);

        let dbName = 'ladders-db'; // Default database

        // Set database name based on function name
        if (functionName.includes('friends')) {
            dbName = 'friends-db';
        } else if (functionName.includes('messages')) {
            dbName = 'messages-db';
        } else if (functionName.includes('notifications')) {
            dbName = 'notifications-db';
        } else if (functionName.includes('settings')) {
            dbName = 'settings-db';
        } else if (functionName.includes('match')) {
            dbName = 'matches-db';
        } else if (functionName.includes('auth')) {
            dbName = 'users-db';
        }

        console.log(`Using primary database: ${dbName}`);

        return await getDatabase(dbName);
    } catch (error) {
        console.error('Database connection error:', {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        throw new Error(`Database connection failed: ${error.message}`);
    }
}

/**
 * Connect to a specific database by name
 * Added support for users-db which contains user information
 */
export async function connectToSpecificDatabase(dbName) {
    try {
        console.log(`Connecting to specific database: ${dbName}`);
        return await getDatabase(dbName);
    } catch (error) {
        console.error(`Error connecting to ${dbName}:`, error);
        throw new Error(`Connection to ${dbName} failed: ${error.message}`);
    }
}

/**
 * Get or create a database connection
 */
async function getDatabase(dbName) {
    try {
        // Return cached connection if available
        if (cachedDbs[dbName]) {
            console.log(`Using cached connection to ${dbName}`);
            return cachedDbs[dbName];
        }

        // Get connection URI
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.error('MONGODB_URI environment variable not set');
            throw new Error('MONGODB_URI environment variable not set');
        }

        console.log('Connection URI starts with:', uri.substring(0, 20) + '...');

        // Initialize MongoDB client if needed
        if (!cachedClient) {
            console.log('Creating new MongoDB client...');
            cachedClient = new MongoClient(uri, {
                connectTimeoutMS: 5000,
                socketTimeoutMS: 5000,
                serverSelectionTimeoutMS: 5000
            });

            console.log('Connecting to MongoDB...');
            await cachedClient.connect();
            console.log('Connected to MongoDB client');
        }

        // Get database from client
        console.log(`Getting database: ${dbName}`);
        const db = cachedClient.db(dbName);

        // Test connection
        console.log('Testing database connection...');
        await db.command({ ping: 1 });
        console.log(`Successfully connected to ${dbName}`);

        // Cache the database connection
        cachedDbs[dbName] = db;
        return db;
    } catch (error) {
        console.error(`Error getting database ${dbName}:`, error);
        throw error;
    }
}