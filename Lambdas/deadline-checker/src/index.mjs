// index.mjs - Main entry point for the deadline checker Lambda
import { handler as checkDeadlines } from './handlers/deadline-checker.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    try {
        // This Lambda only handles the deadline checker functionality
        if (event.httpMethod === 'POST' &&
            (event.resource === '/deadline-checker' || event.path === '/deadline-checker')) {
            return await checkDeadlines(event);
        }

        // No other routes should be handled by this Lambda
        return createResponse(404, {
            message: 'Route not found',
            method: event.httpMethod,
            resource: event.resource || event.path
        });
    } catch (error) {
        console.error('Handler error:', error);
        return createResponse(500, {
            message: 'Internal server error',
            error: error.message
        });
    }
};