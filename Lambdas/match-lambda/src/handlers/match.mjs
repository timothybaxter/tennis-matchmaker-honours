import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';

export async function createMatch(event) {
    try {
        const token = event.headers.Authorization?.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Missing Authentication Token' });
        }

        let userId;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.userId;
        } catch (error) {
            return createResponse(401, { message: 'Invalid Authentication Token' });
        }

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
        return createResponse(500, {
            message: 'Error creating match',
            error: error.message
        });
    }
}

export async function getMatches(event) {
    try {
        const token = event.headers.Authorization?.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Missing Authentication Token' });
        }

        try {
            jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return createResponse(401, { message: 'Invalid Authentication Token' });
        }

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
        return createResponse(500, {
            message: 'Error retrieving matches',
            error: error.message
        });
    }
}