import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../utils/database.mjs';

// Update your createResponse utility to include CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': 'http://localhost:5000',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
};

const createResponse = (statusCode, body) => ({
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
});

// Add an OPTIONS handler
export async function handleOptions() {
    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({})
    };
}

// Update the deleteMatch function with proper error handling
export async function deleteMatch(event) {
    console.log('Delete match event:', JSON.stringify(event));

    try {
        // Handle OPTIONS request
        if (event.httpMethod === 'OPTIONS') {
            return handleOptions();
        }

        const db = await connectToDatabase();
        const matches = db.collection('matches');
        const matchId = event.pathParameters?.id;

        console.log('Attempting to delete match:', matchId);

        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        // Verify token and get user ID
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return createResponse(401, { message: 'No authorization header' });
        }

        const token = authHeader.split(' ')[1];
        console.log('Token received:', token);

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;
        console.log('User ID from token:', userId);

        // Find the match and verify ownership
        const match = await matches.findOne({
            _id: new ObjectId(matchId)
        });

        if (!match) {
            return createResponse(404, { message: 'Match not found' });
        }

        if (match.creatorId !== userId) {
            return createResponse(403, { message: 'Not authorized to delete this match' });
        }

        // Delete the match
        const result = await matches.deleteOne({ _id: new ObjectId(matchId) });
        console.log('Delete result:', result);

        if (result.deletedCount === 0) {
            return createResponse(404, { message: 'Match not found' });
        }

        return createResponse(200, { message: 'Match deleted successfully' });
    } catch (error) {
        console.error('Delete match error:', error);
        if (error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid token' });
        }
        return createResponse(500, { message: 'Error deleting match', error: error.message });
    }
}

// Update index.mjs handler
export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event));

    // Handle OPTIONS requests
    if (event.httpMethod === 'OPTIONS') {
        return handleOptions();
    }

    // Route the request based on method and path
    const route = `${event.httpMethod} ${event.resource}`;
    console.log('Route:', route);

    try {
        switch (route) {
            case 'DELETE /matches/{id}':
                return await deleteMatch(event);
            // Add other routes here
            default:
                return createResponse(404, { message: 'Route not found' });
        }
    } catch (error) {
        console.error('Handler error:', error);
        return createResponse(500, { message: 'Internal server error' });
    }
};
