import { getNotifications, createNotification, markNotificationRead, deleteNotification } from './handlers/notifications.mjs';
import { createResponse, createCorsResponse } from './utils/responses.mjs';

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return createCorsResponse();
    }

    switch (`${event.httpMethod} ${event.resource}`) {
        case 'GET /notifications':
            return await getNotifications(event);
        case 'POST /notifications':
            return await createNotification(event);
        case 'POST /notifications/read':
            return await markNotificationRead(event);  
        case 'POST /notifications/delete':
            return await deleteNotification(event);
        default:
            return createResponse(404, { message: 'Route not found', route: `${event.httpMethod} ${event.resource}` });
    }
};