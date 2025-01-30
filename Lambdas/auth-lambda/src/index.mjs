import { register, login } from './handlers/auth.mjs';
import { createResponse } from './utils/responses.mjs';

console.log("Testing webhook");

export const handler = async (event) => {
    console.log('Event received:', event);

    try {
        // Handle CORS preflight
        if (event.httpMethod === 'OPTIONS') {
            return createResponse(200, {});
        }

        // Route requests
        if (event.path === '/auth/register' && event.httpMethod === 'POST') {
            return register(event);
        }

        if (event.path === '/auth/login' && event.httpMethod === 'POST') {
            return login(event);
        }

        return createResponse(404, { message: 'Route not found' });
    } catch (error) {
        console.error('Handler error:', error);
        return createResponse(500, { message: 'Internal server error' });
    }
};