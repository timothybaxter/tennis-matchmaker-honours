// src/handlers/notifications.mjs
import jwt from 'jsonwebtoken';
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';
import fetch from 'node-fetch';

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

        // Connect to notifications database (primary for this service)
        const notificationsDb = await connectToDatabase();
        const notifications = notificationsDb.collection('notifications');

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

        // Enhance notifications with source user details
        if (userNotifications.length > 0) {
            try {
                // Get unique source user IDs
                const sourceUserIds = [...new Set(
                    userNotifications
                        .filter(n => n.sourceUserId)
                        .map(n => n.sourceUserId)
                )];

                if (sourceUserIds.length > 0) {
                    // Connect to users database
                    const usersDb = await connectToSpecificDatabase('users-db');
                    const users = usersDb.collection('users');

                    // Get user details
                    const sourceUserObjectIds = sourceUserIds.map(id => {
                        try { return new ObjectId(id); }
                        catch (e) { return null; }
                    }).filter(id => id !== null);

                    const sourceUserDetails = await users.find({
                        _id: { $in: sourceUserObjectIds }
                    }).project({
                        _id: 1,
                        name: 1,
                        email: 1,
                        playerLevel: 1
                    }).toArray();

                    // Add source user details to notifications
                    userNotifications.forEach(notification => {
                        if (notification.sourceUserId) {
                            const sourceUser = sourceUserDetails.find(
                                u => u._id.toString() === notification.sourceUserId
                            );
                            if (sourceUser) {
                                notification.sourceUserName = sourceUser.name;
                                notification.sourceUserPlayerLevel = sourceUser.playerLevel;
                            }
                        }
                    });
                }
            } catch (userError) {
                console.error('Error fetching source user details:', userError);
                // Continue without source user details rather than failing the request
            }
        }

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

        const sourceUserId = token.decoded.userId;

        // Connect to notifications database (primary for this service)
        const notificationsDb = await connectToDatabase();
        const notifications = notificationsDb.collection('notifications');

        // Connect to users database for user verification and info
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        const { recipientId, type, content, relatedItemId } = JSON.parse(event.body);

        if (!recipientId || !type || !content) {
            return createResponse(400, { message: 'recipientId, type, and content are required' });
        }

        // Verify both users exist
        try {
            // Check source user
            const sourceUser = await users.findOne({ _id: new ObjectId(sourceUserId) });
            if (!sourceUser) {
                return createResponse(404, { message: 'Source user not found' });
            }

            // Check recipient user
            const recipientUser = await users.findOne({ _id: new ObjectId(recipientId) });
            if (!recipientUser) {
                return createResponse(404, { message: 'Recipient user not found' });
            }

            // Create the notification
            const newNotification = {
                userId: recipientId, // The user who will receive this notification
                sourceUserId: sourceUserId, // The user who generated this notification
                sourceUserName: sourceUser.name, // Add source user name for convenience
                type,
                content,
                relatedItemId: relatedItemId || null,
                isRead: false,
                createdAt: new Date()
            };

            const result = await notifications.insertOne(newNotification);

            // =====================================================
            // NEW CODE: Send real-time notification after database save
            // =====================================================
            try {
                const success = await sendRealTimeNotification(newNotification, token.original);
                console.log(`Real-time notification delivery ${success ? 'succeeded' : 'failed'}`);
            } catch (rtError) {
                console.error('Error sending real-time notification:', rtError);
                // Don't fail the overall operation if real-time delivery fails
            }
            // =====================================================

            return createResponse(201, {
                message: 'Notification created successfully',
                notificationId: result.insertedId,
                notification: newNotification
            });
        } catch (error) {
            console.error('Error verifying users:', error);
            return createResponse(400, { message: 'Invalid user ID format or users not found' });
        }
    } catch (error) {
        console.error('Create notification error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error creating notification', error: error.message });
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

        // Connect to notifications database (primary for this service)
        const notificationsDb = await connectToDatabase();
        const notifications = notificationsDb.collection('notifications');

        // Ensure the user only updates their own notifications
        try {
            const notificationObjectId = new ObjectId(notificationId);

            const result = await notifications.updateOne(
                { _id: notificationObjectId, userId: userId },
                { $set: { isRead: true } }
            );

            if (result.matchedCount === 0) {
                return createResponse(404, { message: 'Notification not found or not authorized' });
            }

            return createResponse(200, { message: 'Notification marked as read' });
        } catch (error) {
            console.error('Error parsing notification ID:', error);
            return createResponse(400, { message: 'Invalid notification ID format' });
        }
    } catch (error) {
        console.error('Mark notification read error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error updating notification', error: error.message });
    }
}

// Delete notification
export async function deleteNotification(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;

        let notificationId;

        if (event.httpMethod === 'DELETE' && event.pathParameters && event.pathParameters.id) {
            notificationId = event.pathParameters.id;
            console.log('Deleting notification via DELETE request, ID from path:', notificationId);
        }
        else if (event.body) {
            const bodyData = JSON.parse(event.body);
            notificationId = bodyData.notificationId;
            console.log('Deleting notification via POST request, ID from body:', notificationId);
        }

        if (!notificationId) {
            return createResponse(400, { message: 'notificationId is required' });
        }

        const notificationsDb = await connectToDatabase();
        const notifications = notificationsDb.collection('notifications');

        try {
            const notificationObjectId = new ObjectId(notificationId);

            const result = await notifications.deleteOne(
                { _id: notificationObjectId, userId: userId }
            );

            if (result.deletedCount === 0) {
                return createResponse(404, { message: 'Notification not found or not authorized' });
            }

            return createResponse(200, { message: 'Notification deleted successfully' });
        } catch (error) {
            console.error('Error processing notification deletion:', error);
            return createResponse(400, { message: 'Invalid notification ID format or database error', error: error.message });
        }
    } catch (error) {
        console.error('Delete notification error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error deleting notification', error: error.message });
    }
}

// =====================================================
// NEW FUNCTION: Send real-time notification via API Gateway
// =====================================================
async function sendRealTimeNotification(notification, jwtToken) {
    try {
        console.log('Sending real-time notification:', JSON.stringify(notification));

        // Determine notification type and endpoint
        let endpoint;
        let requestBody;

        // Configure endpoint and request body based on notification type
        if (notification.type.startsWith('friend_')) {
            endpoint = 'friend-request';
            requestBody = {
                recipientId: notification.userId,
                senderId: notification.sourceUserId,
                senderName: notification.sourceUserName,
                friendshipId: notification.relatedItemId || 'unknown',
                timestamp: notification.createdAt
            };
        } else if (notification.type.startsWith('message')) {
            endpoint = 'message';
            requestBody = {
                recipientId: notification.userId,
                senderId: notification.sourceUserId,
                senderName: notification.sourceUserName,
                conversationId: notification.relatedItemId || 'unknown',
                content: notification.content,
                timestamp: notification.createdAt
            };
        } else if (notification.type.startsWith('match_') ||
            notification.type.startsWith('tournament_') ||
            notification.type.startsWith('ladder_')) {
            // Generic notification for other types
            endpoint = 'generic';
            requestBody = {
                userId: notification.userId,
                type: notification.type,
                message: notification.content,
                relatedItemId: notification.relatedItemId,
                source: {
                    userId: notification.sourceUserId,
                    name: notification.sourceUserName
                },
                timestamp: notification.createdAt
            };
        } else {
            // Default to generic notification
            endpoint = 'generic';
            requestBody = {
                userId: notification.userId,
                type: notification.type,
                message: notification.content,
                relatedItemId: notification.relatedItemId,
                timestamp: notification.createdAt
            };
        }

        // Make request to API Gateway
        console.log(`Calling ${process.env.NOTIFICATION_API_URL}/notificationsapi/${endpoint}`);
        console.log('Request body:', JSON.stringify(requestBody));

        const response = await fetch(`${process.env.NOTIFICATION_API_URL}/notificationsapi/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const responseStatus = response.status;
        let responseText;

        try {
            responseText = await response.text();
        } catch (e) {
            responseText = 'Could not read response text';
        }

        console.log(`Real-time notification API response: ${responseStatus} - ${responseText}`);

        return responseStatus >= 200 && responseStatus < 300;
    } catch (error) {
        console.error('Error sending real-time notification:', error);
        return false;
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
            decoded,
            original: token  // Save the original token for API calls
        };
    } catch (error) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid token' })
        };
    }
}


export async function createNotificationDirect(event) {
    try {
        // For direct Lambda invocation, we expect a specific payload format
        const payload = JSON.parse(event.body || '{}');
        const { userId, type, content, relatedItemId, sourceUserId, sourceUserName } = payload;

        if (!userId || !type || !content) {
            console.error('Missing required fields for direct notification:', payload);
            return createResponse(400, { message: 'userId, type, and content are required' });
        }

        // Connect to notifications database
        const notificationsDb = await connectToDatabase();
        const notifications = notificationsDb.collection('notifications');

        // Create the notification
        const newNotification = {
            userId,
            sourceUserId,
            sourceUserName,
            type,
            content,
            relatedItemId: relatedItemId || null,
            isRead: false,
            createdAt: new Date()
        };

        const result = await notifications.insertOne(newNotification);

        // Send real-time notification (without token validation)
        try {
            // Get token for API Gateway call from environment or payload
            const jwtToken = payload.token || process.env.NOTIFICATION_API_TOKEN;

            if (!jwtToken) {
                console.warn('No JWT token available for real-time notification');
            } else {
                const success = await sendRealTimeNotification(newNotification, jwtToken);
                console.log(`Direct real-time notification delivery ${success ? 'succeeded' : 'failed'}`);
            }
        } catch (rtError) {
            console.error('Error sending direct real-time notification:', rtError);
        }

        return createResponse(201, {
            message: 'Notification created successfully',
            notificationId: result.insertedId,
            notification: newNotification
        });
    } catch (error) {
        console.error('Create direct notification error:', error);
        return createResponse(500, { message: 'Error creating notification', error: error.message });
    }
}
