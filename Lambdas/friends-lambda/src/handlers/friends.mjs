import jwt from 'jsonwebtoken';
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';
import { Lambda } from 'aws-sdk';

// Initialize AWS Lambda client
const lambda = new Lambda({
    region: process.env.AWS_REGION || 'us-east-1'
});

// Search users function
export async function searchUsers(event) {
    console.log('searchUsers called with query:', event.queryStringParameters?.query);

    try {
        // Extract and verify token
        const authHeader = event.headers.Authorization ||
            event.headers.authorization;

        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Get query parameter
        const query = event.queryStringParameters?.query;

        if (!query || query.length < 2) {
            return createResponse(400, { message: 'Search query must be at least 2 characters' });
        }

        // Connect to friends database to get existing friendships
        const friendsDb = await connectToDatabase();
        const friendships = friendsDb.collection('friendships');

        // Connect to users database to search users
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Get list of existing friendships
        const existingFriendships = await friendships.find({
            $or: [
                { userId1: userId },
                { userId2: userId }
            ]
        }).toArray();

        // Extract connected user IDs
        const connectedUserIds = [];
        existingFriendships.forEach(friendship => {
            if (friendship.userId1 === userId) {
                connectedUserIds.push(friendship.userId2);
            } else {
                connectedUserIds.push(friendship.userId1);
            }
        });

        // Add the current user to the exclusion list
        connectedUserIds.push(userId);

        // Convert string IDs to ObjectIds, handling errors gracefully
        const excludeObjectIds = [];
        for (const id of connectedUserIds) {
            try {
                excludeObjectIds.push(new ObjectId(id));
            } catch (err) {
                console.warn(`Invalid ObjectId: ${id}, skipping`);
            }
        }

        // Build search query
        const searchQuery = {
            $and: [
                // Exclude self and connected users
                { _id: { $nin: excludeObjectIds } },
                // Match name or email
                {
                    $or: [
                        { name: { $regex: query, $options: 'i' } },
                        { email: { $regex: query, $options: 'i' } }
                    ]
                }
            ]
        };

        // Execute search
        const searchResults = await users.find(searchQuery)
            .project({
                _id: 1,
                name: 1,
                email: 1,
                playerLevel: 1
            })
            .limit(10)
            .toArray();


        console.log(`Found ${searchResults.length} users matching query "${query}"`);

        return createResponse(200, { users: searchResults });
    } catch (error) {
        console.error('Error in searchUsers:', error);

        // Special handling for JWT errors
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return createResponse(401, { message: 'Invalid token', error: error.message });
        }

        return createResponse(500, { message: 'Internal server error' });
    }
}

// Search for users without filtering by friendship status
export async function searchAllUsers(event) {
    console.log('searchAllUsers called with query:', event.queryStringParameters?.query);
    try {
        // Extract and verify token
        const authHeader = event.headers.Authorization ||
            event.headers.authorization;
        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Get query parameter
        const query = event.queryStringParameters?.query;
        if (!query || query.length < 2) {
            return createResponse(400, { message: 'Search query must be at least 2 characters' });
        }

        // Connect to users database to search users
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Build search query - don't filter out friends, only exclude the current user
        const searchQuery = {
            $and: [
                // Only exclude current user
                { _id: { $ne: new ObjectId(userId) } },
                // Match name or email
                {
                    $or: [
                        { name: { $regex: query, $options: 'i' } },
                        { email: { $regex: query, $options: 'i' } }
                    ]
                }
            ]
        };

        // Execute search
        const searchResults = await users.find(searchQuery)
            .project({
                _id: 1,
                name: 1,
                email: 1,
                playerLevel: 1
            })
            .limit(10)
            .toArray();

        console.log(`Found ${searchResults.length} users matching query "${query}"`);
        return createResponse(200, { users: searchResults });
    } catch (error) {
        console.error('Error in searchAllUsers:', error);
        // Special handling for JWT errors
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return createResponse(401, { message: 'Invalid token', error: error.message });
        }
        return createResponse(500, { message: 'Internal server error' });
    }
}

// Get all friends for a user
export async function getFriends(event) {
    try {
        // Extract and verify token
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Connect to databases
        const friendsDb = await connectToDatabase();
        const usersDb = await connectToSpecificDatabase('users-db');

        const friendships = friendsDb.collection('friendships');
        const users = usersDb.collection('users');

        // Find all accepted friendships
        const existingFriendships = await friendships.find({
            $and: [
                { $or: [{ userId1: userId }, { userId2: userId }] },
                { status: 'accepted' }
            ]
        }).toArray();

        // If no friends, return empty array
        if (existingFriendships.length === 0) {
            return createResponse(200, { friends: [] });
        }

        // Extract friend IDs
        const friendIds = existingFriendships.map(friendship =>
            friendship.userId1 === userId ? friendship.userId2 : friendship.userId1
        );

        // Get friend details
        const friendObjectIds = friendIds
            .map(id => {
                try { return new ObjectId(id); }
                catch (e) { return null; }
            })
            .filter(id => id !== null);

        const friendDetails = await users.find({
            _id: { $in: friendObjectIds }
        }).project({
            _id: 1,
            name: 1,
            email: 1,
            playerLevel: 1
        }).toArray();


        return createResponse(200, { friends: friendDetails });
    } catch (error) {
        console.error('Error in getFriends:', error);

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return createResponse(401, { message: 'Invalid token', error: error.message });
        }

        return createResponse(500, { message: 'Internal server error' });
    }
}

// Send a friend request
export async function sendFriendRequest(event) {
    try {
        // Extract and verify token
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const senderId = decoded.userId;

        // Parse request body
        const { recipientId } = JSON.parse(event.body);

        if (!recipientId || recipientId === "undefined") {
            return createResponse(400, { message: 'Valid recipientId is required' });
        }

        if (senderId === recipientId) {
            return createResponse(400, { message: 'Cannot send friend request to yourself' });
        }

        // Connect to databases
        const friendsDb = await connectToDatabase();
        const usersDb = await connectToSpecificDatabase('users-db');
        const notificationsDb = await connectToSpecificDatabase('notifications-db');

        const friendships = friendsDb.collection('friendships');
        const users = usersDb.collection('users');
        const notifications = notificationsDb.collection('notifications');

        // Check if users exist
        let senderObjectId, recipientObjectId;
        try {
            senderObjectId = new ObjectId(senderId);
            recipientObjectId = new ObjectId(recipientId);
        } catch (error) {
            return createResponse(400, { message: 'Invalid user ID format' });
        }

        const sender = await users.findOne({ _id: senderObjectId });
        const recipient = await users.findOne({ _id: recipientObjectId });

        if (!sender) {
            return createResponse(404, { message: 'Sender account not found' });
        }

        if (!recipient) {
            return createResponse(404, { message: 'Recipient not found' });
        }

        // Check if friendship already exists
        const existingFriendship = await friendships.findOne({
            $or: [
                { userId1: senderId, userId2: recipientId },
                { userId1: recipientId, userId2: senderId }
            ]
        });

        if (existingFriendship) {
            if (existingFriendship.status === 'accepted') {
                return createResponse(400, { message: 'Already friends with this user' });
            } else if (existingFriendship.status === 'pending') {
                if (existingFriendship.userId1 === senderId) {
                    return createResponse(400, { message: 'Friend request already sent' });
                } else {
                    // If recipient has already sent a request, accept it
                    await friendships.updateOne(
                        { _id: existingFriendship._id },
                        { $set: { status: 'accepted', updatedAt: new Date() } }
                    );

                    // Create notification for the other user
                    const newNotification = {
                        userId: recipientId,
                        sourceUserId: senderId,
                        type: 'friend_accepted',
                        content: `${sender.name} accepted your friend request`,
                        relatedItemId: existingFriendship._id.toString(),
                        isRead: false,
                        createdAt: new Date()
                    };

                    await notifications.insertOne(newNotification);

                    return createResponse(200, { message: 'Friend request accepted' });
                }
            }
        }

        // Create new friendship
        const newFriendship = {
            userId1: senderId,
            userId2: recipientId,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await friendships.insertOne(newFriendship);

        // Create notification for recipient
        const newNotification = {
            userId: recipientId,
            sourceUserId: senderId,
            type: 'friend_request',
            content: `${sender.name} sent you a friend request`,
            relatedItemId: result.insertedId.toString(),
            isRead: false,
            createdAt: new Date()
        };

        await notifications.insertOne(newNotification);


        try {
            console.log(`Creating real-time notification for friend request recipient: ${recipientId}`);

            // Create notification using notification-lambda
            const notificationPayload = {
                userId: recipientId,
                sourceUserId: senderId,
                sourceUserName: sender.name,
                type: 'friend_request',
                content: `${sender.name} sent you a friend request`,
                relatedItemId: result.insertedId.toString(),
                token: token // Pass the JWT token for API Gateway authorization
            };

            // Invoke notification lambda
            const lambdaParams = {
                FunctionName: process.env.NOTIFICATION_LAMBDA_NAME || 'notification-lambda',
                InvocationType: 'Event', // asynchronous
                Payload: JSON.stringify({
                    httpMethod: 'POST',
                    path: '/notifications/direct',
                    body: JSON.stringify(notificationPayload)
                })
            };

            await lambda.invoke(lambdaParams).promise();
            console.log('✅ Notification lambda invoked successfully for friend request');
        } catch (notificationError) {
            // Log but don't fail if notification fails
            console.error('Error sending real-time notification:', notificationError);
        }

        return createResponse(201, {
            message: 'Friend request sent successfully',
            friendshipId: result.insertedId,
            notification: newNotification
        });
    } catch (error) {
        console.error('Error in sendFriendRequest:', error);

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return createResponse(401, { message: 'Invalid token', error: error.message });
        }

        return createResponse(500, { message: 'Error sending friend request' });
    }
}

// Get pending friend requests
export async function getFriendRequests(event) {
    try {
        // Extract and verify token
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Connect to databases
        const friendsDb = await connectToDatabase();
        const usersDb = await connectToSpecificDatabase('users-db');

        const friendships = friendsDb.collection('friendships');
        const users = usersDb.collection('users');

        // Get pending friend requests
        const requests = await friendships.find({
            userId2: userId,
            status: 'pending'
        }).toArray();

        // If no requests, return empty array
        if (requests.length === 0) {
            return createResponse(200, { friendRequests: [] });
        }

        // Get requester details
        const requesterIds = requests.map(req => req.userId1);
        const requesterObjectIds = requesterIds
            .map(id => {
                try { return new ObjectId(id); }
                catch (e) { return null; }
            })
            .filter(id => id !== null);

        const requesters = await users.find({
            _id: { $in: requesterObjectIds }
        }).project({
            _id: 1,
            name: 1,
            email: 1,
            playerLevel: 1
        }).toArray();

        // Combine data
        const friendRequests = requests.map(req => {
            const requester = requesters.find(
                user => user._id.toString() === req.userId1
            );

            return {
                friendshipId: req._id,
                requester: requester || { id: req.userId1 },
                createdAt: req.createdAt
            };
        });

        return createResponse(200, { friendRequests });
    } catch (error) {
        console.error('Error in getFriendRequests:', error);

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return createResponse(401, { message: 'Invalid token', error: error.message });
        }

        return createResponse(500, { message: 'Error retrieving friend requests' });
    }
}

// Respond to a friend request
export async function respondToFriendRequest(event) {
    try {
        // Extract and verify token
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Parse request body
        const { friendshipId, accept } = JSON.parse(event.body);

        if (!friendshipId || accept === undefined) {
            return createResponse(400, { message: 'friendshipId and accept are required' });
        }

        // Connect to databases
        const friendsDb = await connectToDatabase();
        const usersDb = await connectToSpecificDatabase('users-db');
        const notificationsDb = await connectToSpecificDatabase('notifications-db');

        const friendships = friendsDb.collection('friendships');
        const users = usersDb.collection('users');
        const notifications = notificationsDb.collection('notifications');

        // Find the friendship
        let friendship;
        try {
            const friendshipObjectId = new ObjectId(friendshipId);
            friendship = await friendships.findOne({
                _id: friendshipObjectId,
                userId2: userId,
                status: 'pending'
            });
        } catch (error) {
            return createResponse(400, { message: 'Invalid friendship ID format' });
        }

        if (!friendship) {
            return createResponse(404, { message: 'Friend request not found or not authorized' });
        }

        // Get user details for notification
        const requester = await users.findOne({ _id: new ObjectId(friendship.userId1) });
        const currentUser = await users.findOne({ _id: new ObjectId(userId) });

        if (!requester || !currentUser) {
            return createResponse(404, { message: 'User not found' });
        }

        if (accept) {
            // Accept request
            await friendships.updateOne(
                { _id: friendship._id },
                { $set: { status: 'accepted', updatedAt: new Date() } }
            );

            // Create notification for requester
            const newNotification = {
                userId: friendship.userId1,
                sourceUserId: userId,
                type: 'friend_accepted',
                content: `${currentUser.name} accepted your friend request`,
                relatedItemId: friendship._id.toString(),
                isRead: false,
                createdAt: new Date()
            };

            await notifications.insertOne(newNotification);


            try {
                console.log(`Creating real-time acceptance notification for: ${friendship.userId1}`);

                // Create notification using notification-lambda
                const notificationPayload = {
                    userId: friendship.userId1,
                    sourceUserId: userId,
                    sourceUserName: currentUser.name,
                    type: 'friend_accepted',
                    content: `${currentUser.name} accepted your friend request`,
                    relatedItemId: friendship._id.toString(),
                    token: token // Pass the JWT token for API Gateway authorization
                };

                // Invoke notification lambda
                const lambdaParams = {
                    FunctionName: process.env.NOTIFICATION_LAMBDA_NAME || 'notification-lambda',
                    InvocationType: 'Event', // asynchronous
                    Payload: JSON.stringify({
                        httpMethod: 'POST',
                        path: '/notifications/direct',
                        body: JSON.stringify(notificationPayload)
                    })
                };

                await lambda.invoke(lambdaParams).promise();
                console.log('✅ Notification lambda invoked successfully for friend acceptance');
            } catch (notificationError) {
                // Log but don't fail if notification fails
                console.error('Error sending real-time notification for acceptance:', notificationError);
            }

            return createResponse(200, { message: 'Friend request accepted' });
        } else {
            // Reject by deleting the request
            await friendships.deleteOne({ _id: friendship._id });

            // Optionally create rejection notification
            const newNotification = {
                userId: friendship.userId1,
                sourceUserId: userId,
                type: 'friend_rejected',
                content: `${currentUser.name} declined your friend request`,
                isRead: false,
                createdAt: new Date()
            };

            await notifications.insertOne(newNotification);

            try {
                console.log(`Creating real-time rejection notification for: ${friendship.userId1}`);

                // Create notification using notification-lambda
                const notificationPayload = {
                    userId: friendship.userId1,
                    sourceUserId: userId,
                    sourceUserName: currentUser.name,
                    type: 'friend_rejected',
                    content: `${currentUser.name} declined your friend request`,
                    token: token // Pass the JWT token for API Gateway authorization
                };

                // Invoke notification lambda
                const lambdaParams = {
                    FunctionName: process.env.NOTIFICATION_LAMBDA_NAME || 'notification-lambda',
                    InvocationType: 'Event', // asynchronous
                    Payload: JSON.stringify({
                        httpMethod: 'POST',
                        path: '/notifications/direct',
                        body: JSON.stringify(notificationPayload)
                    })
                };

                await lambda.invoke(lambdaParams).promise();
                console.log('✅ Notification lambda invoked successfully for friend rejection');
            } catch (notificationError) {
                // Log but don't fail if notification fails
                console.error('Error sending real-time notification for rejection:', notificationError);
            }

            return createResponse(200, { message: 'Friend request rejected' });
        }
    } catch (error) {
        console.error('Error in respondToFriendRequest:', error);

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return createResponse(401, { message: 'Invalid token', error: error.message });
        }

        return createResponse(500, { message: 'Error responding to friend request' });
    }
}

// Remove a friend
export async function removeFriend(event) {
    try {
        // Extract and verify token
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Parse request body
        const { friendId } = JSON.parse(event.body);

        if (!friendId) {
            return createResponse(400, { message: 'friendId is required' });
        }

        // Connect to database
        const friendsDb = await connectToDatabase();
        const friendships = friendsDb.collection('friendships');

        // Find and delete the friendship
        const result = await friendships.deleteOne({
            $or: [
                { userId1: userId, userId2: friendId, status: 'accepted' },
                { userId1: friendId, userId2: userId, status: 'accepted' }
            ]
        });

        if (result.deletedCount === 0) {
            return createResponse(404, { message: 'Friendship not found' });
        }

        return createResponse(200, { message: 'Friend removed successfully' });
    } catch (error) {
        console.error('Error in removeFriend:', error);

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return createResponse(401, { message: 'Invalid token', error: error.message });
        }

        return createResponse(500, { message: 'Error removing friend' });
    }
}

// Check if users are friends
export async function checkFriendship(event) {
    try {
        // Extract and verify token
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Get query parameter
        const otherId = event.pathParameters?.id;

        if (!otherId) {
            return createResponse(400, { message: 'userId query parameter is required' });
        }

        // Connect to database
        const friendsDb = await connectToDatabase();
        const friendships = friendsDb.collection('friendships');

        // Check friendship status
        const friendship = await friendships.findOne({
            $or: [
                { userId1: userId, userId2: otherId },
                { userId1: otherId, userId2: userId }
            ]
        });

        if (!friendship) {
            return createResponse(200, { status: 'none' });
        }

        if (friendship.status === 'pending') {
            if (friendship.userId1 === userId) {
                return createResponse(200, { status: 'requested' });
            } else {
                return createResponse(200, { status: 'pending' });
            }
        }

        return createResponse(200, { status: 'accepted' });
    } catch (error) {
        console.error('Error in checkFriendship:', error);

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return createResponse(401, { message: 'Invalid token', error: error.message });
        }

        return createResponse(500, { message: 'Error checking friendship status' });
    }
}