import { createSettings, getSettings, updateSettings } from './handlers/settings.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event received:', event);

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    switch (`${event.httpMethod} ${event.resource}`) {
        case 'POST /settings':
            return await createSettings(event);
        case 'GET /settings/{id}':
            return await getSettings(event);
        case 'PUT /settings/{id}':
            return await updateSettings(event);
        case 'POST /update-settings':
            return await updateSettings(event);
        default:
            return createResponse(404, { message: 'Route not found' });
    }
};