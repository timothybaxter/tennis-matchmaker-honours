import { getFriends, getFriendRequests, sendFriendRequest, respondToFriendRequest, searchUsers, searchAllUsers, checkFriendship } from './handlers/friends.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Received event:', JSON.stringify(event));

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        console.log('Handling OPTIONS request');
        return createCorsResponse();
    }

    try {
        // Create a route key from the HTTP method and path
        const routeKey = `${event.httpMethod} ${event.resource}`;
        console.log('Route key:', routeKey);

        switch (routeKey) {
            case 'GET /friends':
                console.log('Routing to getFriends');
                return await getFriends(event);

            case 'GET /friends/requests':
                console.log('Routing to getFriendRequests');
                return await getFriendRequests(event);

            case 'POST /friends/request':
                console.log('Routing to sendFriendRequest');
                return await sendFriendRequest(event);

            case 'POST /friends/respond':
                console.log('Routing to respondToFriendRequest');
                return await respondToFriendRequest(event);
                
            case 'GET /friends/check/{id}':
                console.log('Routing to checkFriendship');
                return await checkFriendship(event);

            case 'GET /friends/search':
                console.log('Routing to searchUsers with query:', event.queryStringParameters);
                return await searchUsers(event);
                
            case 'GET /users/search-all':
                console.log('Routing to searchAllUsers with query:', event.queryStringParameters);
                return await searchAllUsers(event);

            default:
                console.log('Route not found:', routeKey);
                return createResponse(404, {
                    message: 'Route not found',
                    requestedRoute: routeKey
                });
        }
    } catch (error) {
        console.error('Handler error:', error);
        console.error('Stack trace:', error.stack);
        return createResponse(500, {
            message: 'Internal server error',
            error: error.message,
            stack: error.stack
        });
    }
};