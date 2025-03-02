import { searchUsers } from './handlers/friends.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Received event:', JSON.stringify(event));

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        console.log('Handling OPTIONS request');
        return createCorsResponse();
    }

    try {
        // Focus just on the search route for now
        if (event.httpMethod === 'GET' && event.resource === '/friends/search') {
            console.log('Routing to searchUsers with query:', event.queryStringParameters);
            return await searchUsers(event);
        }

        // For any other route, return a simple response for now
        return createResponse(200, { message: 'Route handled' });
    } catch (error) {
        console.error('Handler error:', error);
        return createResponse(500, {
            message: 'Internal server error',
            error: error.message
        });
    }
};