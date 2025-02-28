import { getConversations, getMessages, sendMessage, createConversation } from './handlers/messages.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    try {
        // Create a route key from the HTTP method and path
        const routeKey = `${event.httpMethod} ${event.resource}`;
        console.log('Route key:', routeKey);

        switch (routeKey) {
            case 'GET /messages/conversations':
                return await getConversations(event);
            case 'GET /messages/{id}':
                return await getMessages(event);
            case 'POST /messages':
                return await sendMessage(event);
            case 'POST /messages/conversation':
                return await createConversation(event);
            default:
                console.log('Route not found:', routeKey);
                return createResponse(404, { message: 'Route not found' });
        }
    } catch (error) {
        console.error('Handler error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Internal server error', error: error.message });
    }
};