import { getFriends, getFriendRequests, sendFriendRequest, respondToFriendRequest, searchUsers } from './handlers/friends.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    // Create a route key from the HTTP method and path
    const routeKey = `${event.httpMethod} ${event.resource}`;
    console.log('Route key:', routeKey);

    try {
        switch (routeKey) {
            case 'GET /friends':
                return await getFriends(event);
            case 'GET /friends/requests':
                return await getFriendRequests(event);
            case 'POST /friends/request':
                return await sendFriendRequest(event);
            case 'POST /friends/respond':
                return await respondToFriendRequest(event);
            case 'GET /friends/search':
                console.log('Routing to search users with query:', event.queryStringParameters);
                return await searchUsers(event);
            default:
                console.log('Route not found:', routeKey);
                return createResponse(404, { message: 'Route not found' });
        }
    } catch (error) {
        console.error('Handler error:', error);
        return createResponse(500, { message: 'Internal server error', error: error.message });
    }
};