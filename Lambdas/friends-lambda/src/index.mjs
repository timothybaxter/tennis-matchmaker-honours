import { getFriends, getFriendRequests, sendFriendRequest, respondToFriendRequest, searchUsers } from './handlers/friends.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    switch (`${event.httpMethod} ${event.resource}`) {
        case 'GET /friends':
            return await getFriends(event);
        case 'GET /friends/requests':
            return await getFriendRequests(event);
        case 'POST /friends/request':
            return await sendFriendRequest(event);
        case 'POST /friends/respond':
            return await respondToFriendRequest(event);  
        case 'GET /friends/search':
            return await searchUsers(event);
        default:
            return createResponse(404, { message: 'Route not found', route: `${event.httpMethod} ${event.resource}` });
    }
};