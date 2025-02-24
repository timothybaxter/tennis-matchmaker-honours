// src/index.mjs
import { getCourts, searchNearby } from './handlers/courts.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    switch (`${event.httpMethod} ${event.resource}`) {
        case 'GET /courts':
            return await getCourts(event);
        case 'GET /courts/nearby':
            return await searchNearby(event);
        default:
            return createResponse(404, { message: 'Route not found' });
    }
};