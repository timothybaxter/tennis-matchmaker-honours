// match-lambda/src/handlers/match.mjs
import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';

const verifyToken = (event) => {
    const token = event.headers.Authorization?.split(' ')[1];
    if (!token) throw new Error('Missing token');
    return jwt.verify(token, process.env.JWT_SECRET);
};

export async function createMatch(event) {
    try {
        const decoded = verifyToken(event);
        const userId = decoded.userId;

        const db = await connectToDatabase();
        const matches = db.collection('matches');

        const {
            courtLocation,
            posterName,
            matchTime,
            matchType
        } = JSON.parse(event.body);

        if (!courtLocation || !posterName || !matchTime || !matchType) {
            return createResponse(400, {
                message: 'Missing required fields'
            });
        }

        const newMatch = {
            courtLocation,
            posterName,
            matchTime: new Date(matchTime),
            matchType,
            userId,
            createdAt: new Date(),
            status: 'open'
        };

        const result = await matches.insertOne(newMatch);

        return createResponse(201, {
            message: 'Match created successfully',
            matchId: result.insertedId
        });
    } catch (error) {
        console.error('Create match error:', error);
        if (error.message === 'Missing token' || error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid or missing authentication token' });
        }
        return createResponse(500, {
            message: 'Error creating match',
            error: error.message
        });
    }
}

export async function getMatches(event) {
    try {
        const decoded = verifyToken(event);

        const db = await connectToDatabase();
        const matches = db.collection('matches');

        const { courtLocation, matchType, status } = event.queryStringParameters || {};

        let query = {};
        if (courtLocation) query.courtLocation = courtLocation;
        if (matchType) query.matchType = matchType;
        if (status) query.status = status;

        const matchList = await matches.find(query)
            .sort({ matchTime: 1 })
            .toArray();

        return createResponse(200, { matches: matchList });
    } catch (error) {
        console.error('Get matches error:', error);
        if (error.message === 'Missing token' || error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid or missing authentication token' });
        }
        return createResponse(500, {
            message: 'Error retrieving matches',
            error: error.message
        });
    }
}

// match-lambda/src/index.mjs
import { createMatch, getMatches } from './handlers/match.mjs';
import { createResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createResponse(200, {});
    }

    const route = `${event.httpMethod} ${event.resource}`;

    switch (route) {
        case 'POST /matches':
            return await createMatch(event);
        case 'GET /matches':
            return await getMatches(event);
        default:
            return createResponse(404, { message: 'Route not found' });
    }
};

// match-lambda/src/utils/responses.mjs
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: corsHeaders,
        body: JSON.stringify(body)
    };
}

// match-lambda/src/utils/database.mjs
import { MongoClient } from 'mongodb';

let cachedDb = null;

export async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }

    const uri = process.env.MONGODB_URI;
    const client = await MongoClient.connect(uri);
    const db = client.db('tennis-matchmaker');

    cachedDb = db;
    return db;
}