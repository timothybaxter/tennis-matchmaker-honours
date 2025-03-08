import { createSettings, getSettings, partialUpdateSettings, getProfile } from './handlers/settings.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    switch (`${event.httpMethod} ${event.resource}`) {
        case 'POST /settings':
            return await createSettings(event);
        case 'GET /settings':
            return await getSettings(event);
        case 'POST /settings/update-settings':
            return await partialUpdateSettings(event);
        case 'GET /settings/profile/{id}':
            return await getProfile(event);
        default:
            return createResponse(404, { message: 'Route not found', route: `${event.httpMethod} ${event.resource}` });
    }
};