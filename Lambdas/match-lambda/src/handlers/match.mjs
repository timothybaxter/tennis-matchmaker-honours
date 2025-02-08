import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';

export async function createMatch(event) {
    try {
        const db = await connectToDatabase();
        const matches = db.collection('matches');

        const { courtLocation, posterName, matchTime, matchType, skillLevel } = JSON.parse(event.body);

        // Get user ID from JWT token
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        if (!courtLocation || !posterName || !matchTime || !matchType) {
            return createResponse(400, { message: 'Missing required fields' });
        }

        const newMatch = {
            courtLocation,
            posterName,
            matchTime: new Date(matchTime),
            matchType,
            skillLevel: skillLevel || 'Not Specified',
            createdAt: new Date(),
            status: 'open',
            creatorId: userId,
            participants: [userId], // Array to store all participant IDs
            requestedBy: [] // Array to store IDs of users who requested to join
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
        const { courtLocation, matchType, status, skillLevel, personal } = event.queryStringParameters || {};

        // Get user ID from JWT token
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const query = {};
        if (courtLocation) query.courtLocation = courtLocation;
        if (matchType) query.matchType = matchType;
        if (status) query.status = status;
        if (skillLevel) query.skillLevel = skillLevel;

        // If personal flag is true, only return matches created by the user
        if (personal === 'true') {
            query.creatorId = userId;
        }

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

export async function deleteMatch(event) {
    try {
        const db = await connectToDatabase();
        const matches = db.collection('matches');

        const { matchId } = JSON.parse(event.body);
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Check if match exists and user is the creator
        const match = await matches.findOne({
            _id: new ObjectId(matchId),
            creatorId: userId
        });

        if (!match) {
            return createResponse(404, { message: 'Match not found or unauthorized' });
        }

        await matches.deleteOne({ _id: new ObjectId(matchId) });
        return createResponse(200, { message: 'Match deleted successfully' });
    } catch (error) {
        console.error('Delete match error:', error);
        return createResponse(500, { message: 'Error deleting match' });
    }
}

export async function updateMatch(event) {
    try {
        const db = await connectToDatabase();
        const matches = db.collection('matches');

        const { matchId, ...updateData } = JSON.parse(event.body);
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Check if match exists and user is the creator
        const match = await matches.findOne({
            _id: new ObjectId(matchId),
            creatorId: userId
        });

        if (!match) {
            return createResponse(404, { message: 'Match not found or unauthorized' });
        }

        const result = await matches.updateOne(
            { _id: new ObjectId(matchId) },
            { $set: updateData }
        );

        return createResponse(200, {
            message: 'Match updated successfully',
            matchId: matchId
        });
    } catch (error) {
        console.error('Update match error:', error);
        return createResponse(500, { message: 'Error updating match' });
    }
}