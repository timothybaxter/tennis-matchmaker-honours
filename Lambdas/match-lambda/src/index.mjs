import {
    createMatch,
    getMatches,
    getMatch,
    deleteMatch,
    updateMatch,
    requestMatch,
    getMatchRequests,
    respondToMatchRequest,
    cancelMatchRequest,
    getRequestedMatches,
    dismissRejectedRequest,
    dismissAcceptedRequest
} from './handlers/match.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    const routeKey = `${event.httpMethod} ${event.resource}`;
    console.log('Route key:', routeKey);

    switch (routeKey) {
        // Check specific routes first
        case 'GET /matches/user/requests':
            return await getRequestedMatches(event);
        case 'GET /matches/{id}':
            return await getMatch(event);
        case 'POST /matches/{id}/request':
            return await requestMatch(event);
        case 'GET /matches/{id}/requests':
            return await getMatchRequests(event);
        case 'POST /matches/{id}/respond':
            return await respondToMatchRequest(event);
        case 'POST /matches/{id}/cancel-request':
            return await cancelMatchRequest(event);
        case 'POST /matches/{id}/dismiss-rejected':
            return await dismissRejectedRequest(event);
        case 'POST /matches/{id}/dismiss-accepted':
            return await dismissAcceptedRequest(event);
        case 'POST /matches':
            return await createMatch(event);
        case 'GET /matches':
            return await getMatches(event);
        case 'DELETE /matches/{id}':
            return await deleteMatch(event);
        case 'POST /matches/{id}':
            return await updateMatch(event);

        default:
            console.error('Unknown route:', routeKey);
            return createResponse(404, {
                message: 'Route not found',
                route: routeKey,
                method: event.httpMethod,
                resource: event.resource
            });
    }
};