import { MongoClient } from 'mongodb';

// Cache for MongoDB client and database connections
let cachedClient = null;
let cachedDbs = {};

/**
 * Connect to the primary database for this service
 */
export async function connectToDatabase() {
    try {
        console.log('Connecting to primary database...');

        // Determine which is the primary database for this service
        const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || '';
        const dbName = getPrimaryDbName(functionName);

        return await getDatabase(dbName);
    } catch (error) {
        console.error('Database connection error:', error);
        throw new Error(`Database connection failed: ${error.message}`);
    }
}

/**
 * Connect to a specific database by name
 * @param {string} dbName - The name of the database to connect to
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
 * @param {string} dbName - The name of the database
 */
async function getDatabase(dbName) {
    try {
        // Return cached connection if available
        if (cachedDbs[dbName]) {
            console.log(`Using cached connection to ${dbName}`);
            return cachedDbs[dbName];
        }

        // Initialize MongoDB client if needed
        if (!cachedClient) {
            const uri = process.env.MONGODB_URI;
            if (!uri) {
                throw new Error('MONGODB_URI environment variable not set');
            }

            console.log('Initializing MongoDB client...');
            cachedClient = await MongoClient.connect(uri, {
                connectTimeoutMS: 5000,
                socketTimeoutMS: 5000,
                serverSelectionTimeoutMS: 5000
            });
        }

        // Get database from client
        const db = cachedClient.db(dbName);

        // Test connection
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

/**
 * Determine the primary database name based on the Lambda function
 */
function getPrimaryDbName(functionName) {
    if (functionName.includes('auth')) {
        return 'users-db';
    } else if (functionName.includes('friends')) {
        return 'friends-db';
    } else if (functionName.includes('messages')) {
        return 'messages-db';
    } else if (functionName.includes('notifications')) {
        return 'notifications-db';
    } else if (functionName.includes('match')) {
        return 'matches-db';
    } else if (functionName.includes('settings')) {
        return 'settings-db';
    } else if (functionName.includes('map')) {
        return 'maps-db';
    } else {
        console.log('Using default database: users-db');
        return 'users-db';
    }
}