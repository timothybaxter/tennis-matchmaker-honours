import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';

// Get all notifications for a user
export async function getNotifications(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        console.log('Getting notifications for user:', userId);

        const db = await connectToDatabase();
        const notifications = db.collection('notifications');

        // Get query parameters
        const queryParams = event.queryStringParameters || {};
        const limit = parseInt(queryParams.limit) || 20;
        const unreadOnly = queryParams.unread === 'true';

        // Build query
        const query = { userId: userId };
        if (unreadOnly) {
            query.isRead = false;
        }

        console.log('Notifications query:', query);

        // Get notifications
        const userNotifications = await notifications
            .find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray();

        console.log(`Found ${userNotifications.length} notifications`);

        return createResponse(200, { notifications: userNotifications });
    } catch (error) {
        console.error('Get notifications error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error retrieving notifications', error: error.message });
    }
}

// Create a new notification
export async function createNotification(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const db = await connectToDatabase();
        const notifications = db.collection('notifications');

        const { recipientId, type, content, relatedItemId } = JSON.parse(event.body);

        if (!recipientId || !type || !content) {
            return createResponse(400, { message: 'recipientId, type, and content are required' });
        }

        const newNotification = {
            userId: recipientId, // The user who will receive this notification
            sourceUserId: token.decoded.userId, // The user who generated this notification
            type,
            content,
            relatedItemId: relatedItemId || null,
            isRead: false,
            createdAt: new Date()
        };

        const result = await notifications.insertOne(newNotification);

        return createResponse(201, {
            message: 'Notification created successfully',
            notificationId: result.insertedId
        });
    } catch (error) {
        console.error('Create notification error:', error);
        return createResponse(500, { message: 'Error creating notification' });
    }
}

// Mark notification as read
export async function markNotificationRead(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const { notificationId } = JSON.parse(event.body);

        if (!notificationId) {
            return createResponse(400, { message: 'notificationId is required' });
        }

        const db = await connectToDatabase();
        const notifications = db.collection('notifications');

        // Ensure the user only updates their own notifications
        const result = await notifications.updateOne(
            { _id: new ObjectId(notificationId), userId: userId },
            { $set: { isRead: true } }
        );

        if (result.matchedCount === 0) {
            return createResponse(404, { message: 'Notification not found or not authorized' });
        }

        return createResponse(200, { message: 'Notification marked as read' });
    } catch (error) {
        console.error('Mark notification read error:', error);
        return createResponse(500, { message: 'Error updating notification' });
    }
}

// Helper function to extract and verify JWT token
function extractAndVerifyToken(event) {
    const authHeader = event.headers.Authorization ||
        event.headers.authorization ||
        event.headers['Authorization'] ||
        event.headers['authorization'];

    if (!authHeader) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'No authorization token provided' })
        };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid authorization format' })
        };
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return {
            isValid: true,
            decoded
        };
    } catch (error) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid token' })
        };
    }
}