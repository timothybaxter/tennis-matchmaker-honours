import { MongoClient } from 'mongodb';

let cachedDb = null;

export async function connectToDatabase() {
    try {
        console.log('Starting database connection...');

        if (cachedDb) {
            console.log('Using cached database connection');
            return cachedDb;
        }

        // Log the connection string (remove for production)
        const uri = process.env.MONGODB_URI;
        console.log('Connection URI starts with:', uri.substring(0, 20) + '...');

        const client = await MongoClient.connect(uri, {
            connectTimeoutMS: 5000,
            socketTimeoutMS: 5000,
            serverSelectionTimeoutMS: 5000
        });

        console.log('Connected to MongoDB client');

        const db = client.db('map-db');
        console.log('Database selected');

        // Test the connection
        await db.command({ ping: 1 });
        console.log('Database connection verified');

        cachedDb = db;
        return db;
    } catch (error) {
        console.error('Detailed connection error:', {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        throw new Error(`Database connection failed: ${error.message}`);
    }
}