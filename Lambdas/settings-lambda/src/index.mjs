import { createUserSettings, getUserSettings, updateUserSettings } from './handlers/settings.mjs';
import { createResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event received:', event);

    try {
        // Handle CORS preflight
        if (event.httpMethod === 'OPTIONS') {
            return createResponse(200, {});
        }

        // Route requests
        switch (`${event.httpMethod} ${event.resource}`) {
            case 'POST /settings':
                return createUserSettings(event);
            case 'GET /settings':
                return getUserSettings(event);
            case 'PUT /settings':
                return updateUserSettings(event);
            default:
                return createResponse(404, { message: 'Route not found' });
        }
    } catch (error) {
        console.error('Handler error:', error);
        return createResponse(500, { message: 'Internal server error' });
    }
};