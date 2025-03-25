import { getNotifications, createNotification, markNotificationRead, deleteNotification } from './handlers/notifications.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    try {
        // Create a route key from HTTP method and resource
        const routeKey = `${event.httpMethod} ${event.resource}`;
        console.log('Route key:', routeKey);

        switch (routeKey) {
            case 'GET /notifications':
                return await getNotifications(event);
            case 'POST /notifications':
                return await createNotification(event);
            case 'POST /notifications/read':
                return await markNotificationRead(event);
            case 'POST /notifications/delete':
                return await deleteNotification(event);
            case 'DELETE /notifications/{id}':
                return await deleteNotification(event);
            default:
                return createResponse(404, { message: 'Route not found', route: routeKey });
        }
    } catch (error) {
        console.error('Handler error:', error);
        console.error('Stack trace:', error.stack);
        return createResponse(500, {
            message: 'Internal server error',
            error: error.message
        });
    }
};