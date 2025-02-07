import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';

export async function createMatch(event) {
    try {
        const db = await connectToDatabase();
        const matches = db.collection('matches');
        const { courtLocation, posterName, matchTime, matchType, skillLevel } = JSON.parse(event.body);

        // Remove skillLevel from required check
        if (!courtLocation || !posterName || !matchTime || !matchType) {
            return createResponse(400, { message: 'Missing required fields' });
        }

        const newMatch = {
            courtLocation,
            posterName,
            matchTime: new Date(matchTime),
            matchType,
            skillLevel: skillLevel || 'Not Specified', // Default value if not provided
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
        return createResponse(500, { message: 'Error creating match' });
    }
}

export async function getMatches(event) {
    try {
        const db = await connectToDatabase();
        const matches = db.collection('matches');
        const { courtLocation, matchType, status, skillLevel } = event.queryStringParameters || {};

        const query = {};
        if (courtLocation) query.courtLocation = courtLocation;
        if (matchType) query.matchType = matchType;
        if (status) query.status = status;
        if (skillLevel) query.skillLevel = skillLevel;

        const matchList = await matches.find(query)
            .sort({ matchTime: 1 })
            .limit(100)
            .toArray();

        return createResponse(200, { matches: matchList });
    } catch (error) {
        console.error('Get matches error:', error);
        return createResponse(500, { message: 'Error retrieving matches' });
    }
}