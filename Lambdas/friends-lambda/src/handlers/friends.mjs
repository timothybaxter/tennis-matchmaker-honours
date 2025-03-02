import jwt from 'jsonwebtoken';
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';

console.log("webhook test");

// Get all friends for a user
export async function getFriends(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        console.log('Getting friends for user:', userId);

        // Connect to friends database (primary for this service)
        const friendsDb = await connectToDatabase();
        const friendships = friendsDb.collection('friendships');

        // Connect to users database (cross-service access)
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Find all accepted friendships where the user is either user1 or user2
        const friendships = await friendships.find({
            $and: [
                { $or: [{ userId1: userId }, { userId2: userId }] },
                { status: 'accepted' }
            ]
        }).toArray();

        console.log('Found friendships:', friendships);

        // Extract friend IDs
        const friendIds = friendships.map(friendship =>
            friendship.userId1 === userId ? friendship.userId2 : friendship.userId1
        );

        console.log('Friend IDs:', friendIds);

        // If no friends, return empty array
        if (friendIds.length === 0) {
            return createResponse(200, { friends: [] });
        }

        // Get friend details
        const friendObjectIds = friendIds.map(id => {
            try {
                return new ObjectId(id);
            } catch (error) {
                console.error(`Invalid ObjectId for friend: ${id}`);
                return null;
            }
        }).filter(id => id !== null);

        const friendDetails = await users.find({
            _id: { $in: friendObjectIds }
        }).project({
            password: 0 // Exclude sensitive information
        }).toArray();

        console.log('Found friend details:', friendDetails.length);

        return createResponse(200, { friends: friendDetails });
    } catch (error) {
        console.error('Get friends error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error retrieving friends', error: error.message });
    }
}

// Get friend requests (pending)
export async function getFriendRequests(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;

        // Connect to friends database (primary for this service)
        const friendsDb = await connectToDatabase();
        const friendships = friendsDb.collection('friendships');

        // Connect to users database (cross-service access)
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Get incoming friend requests
        const friendRequests = await friendships.find({
            userId2: userId,
            status: 'pending'
        }).toArray();

        // Get details of users who sent requests
        const requestorIds = friendRequests.map(request => request.userId1);

        // Handle empty requests array
        if (requestorIds.length === 0) {
            return createResponse(200, { friendRequests: [] });
        }

        const requestorDetails = await users.find({
            _id: { $in: requestorIds.map(id => new ObjectId(id)) }
        }).project({
            password: 0
        }).toArray();

        // Combine friendship data with user details
        const detailedRequests = friendRequests.map(request => {
            const requester = requestorDetails.find(user =>
                user._id.toString() === request.userId1
            );
            return {
                friendshipId: request._id,
                requester: requester,
                createdAt: request.createdAt
            };
        });

        return createResponse(200, { friendRequests: detailedRequests });
    } catch (error) {
        console.error('Get friend requests error:', error);
        return createResponse(500, { message: 'Error retrieving friend requests' });
    }
}

export async function sendFriendRequest(event) {
    try {
        console.log('Processing friend request with body:', event.body);

        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const senderId = token.decoded.userId;
        const { recipientId } = JSON.parse(event.body);

        console.log('Friend request details:', {
            senderId,
            recipientId,
            tokenInfo: token.decoded
        });

        if (!recipientId || recipientId === "undefined") {
            return createResponse(400, { message: 'Valid recipientId is required' });
        }

        if (senderId === recipientId) {
            return createResponse(400, { message: 'Cannot send friend request to yourself' });
        }

        // Connect to friends database (primary for this service)
        const friendsDb = await connectToDatabase();
        const friendships = friendsDb.collection('friendships');

        // Connect to users database (cross-service access)
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Connect to notifications database (cross-service access)
        const notificationsDb = await connectToSpecificDatabase('notifications-db');
        const notifications = notificationsDb.collection('notifications');

        // Get sender's info for notification content
        const senderInfo = await users.findOne({ _id: new ObjectId(senderId) });
        if (!senderInfo) {
            return createResponse(404, { message: 'Sender account not found' });
        }

        // Check if recipient exists
        let recipientObjectId;
        try {
            recipientObjectId = new ObjectId(recipientId);
        } catch (error) {
            console.error('Invalid recipient ID format:', error);
            return createResponse(400, { message: 'Invalid recipient ID format' });
        }

        const recipientExists = await users.findOne({ _id: recipientObjectId });
        if (!recipientExists) {
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

                    // Create a notification for the other user
                    const newNotification = {
                        userId: recipientId,
                        sourceUserId: senderId,
                        type: 'friend_accepted',
                        content: `${senderInfo.name} accepted your friend request`,
                        relatedItemId: existingFriendship._id.toString(),
                        isRead: false,
                        createdAt: new Date()
                    };

                    await notifications.insertOne(newNotification);

                    return createResponse(200, { message: 'Friend request accepted' });
                }
            }
        }

        // Create new friendship request
        const newFriendship = {
            userId1: senderId, // Sender
            userId2: recipientId, // Recipient
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await friendships.insertOne(newFriendship);

        // Create a notification for the recipient
        const newNotification = {
            userId: recipientId,
            sourceUserId: senderId,
            type: 'friend_request',
            content: `${senderInfo.name} sent you a friend request`,
            relatedItemId: result.insertedId.toString(),
            isRead: false,
            createdAt: new Date()
        };

        await notifications.insertOne(newNotification);
        console.log('Created notification:', newNotification);

        return createResponse(201, {
            message: 'Friend request sent successfully',
            friendshipId: result.insertedId,
            notification: newNotification
        });
    } catch (error) {
        console.error('Send friend request error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, {
            message: 'Error sending friend request',
            error: error.message
        });
    }
}

export async function respondToFriendRequest(event) {
    try {
        console.log('Processing friend request response with body:', event.body);

        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const { friendshipId, accept } = JSON.parse(event.body);

        console.log('Friend request response details:', {
            userId,
            friendshipId,
            accept,
            tokenInfo: token.decoded
        });

        if (!friendshipId || accept === undefined) {
            return createResponse(400, { message: 'friendshipId and accept are required' });
        }

        // Connect to friends database (primary for this service)
        const friendsDb = await connectToDatabase();
        const friendships = friendsDb.collection('friendships');

        // Connect to users database (cross-service access)
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Connect to notifications database (cross-service access)
        const notificationsDb = await connectToSpecificDatabase('notifications-db');
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
            console.error('Error parsing friendship ID:', error);
            return createResponse(400, { message: 'Invalid friendship ID format' });
        }

        if (!friendship) {
            return createResponse(404, { message: 'Friend request not found or not authorized' });
        }

        // Get the requester's info for notification
        const requester = await users.findOne({ _id: new ObjectId(friendship.userId1) });

        // Get the current user's info
        const currentUser = await users.findOne({ _id: new ObjectId(userId) });

        if (accept) {
            // Accept request
            await friendships.updateOne(
                { _id: friendship._id },
                { $set: { status: 'accepted', updatedAt: new Date() } }
            );

            // Create notification for the requester
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

            return createResponse(200, { message: 'Friend request accepted' });
        } else {
            // Reject by deleting the request
            await friendships.deleteOne({ _id: friendship._id });

            // Create rejection notification (optional)
            const newNotification = {
                userId: friendship.userId1,
                sourceUserId: userId,
                type: 'friend_rejected',
                content: `${currentUser.name} declined your friend request`,
                isRead: false,
                createdAt: new Date()
            };

            await notifications.insertOne(newNotification);

            return createResponse(200, { message: 'Friend request rejected' });
        }
    } catch (error) {
        console.error('Respond to friend request error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error responding to friend request', error: error.message });
    }
}

// Search for users to add as friends
export async function searchUsers(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const { query } = event.queryStringParameters || {};

        console.log(`Searching users with query: ${query} for user ${userId}`);

        if (!query || query.length < 2) {
            return createResponse(400, { message: 'Search query must be at least 2 characters' });
        }

        // Connect to friends database (primary for this service)
        const friendsDb = await connectToDatabase();
        const friendships = friendsDb.collection('friendships');

        // Connect to users database (cross-service access)
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Get list of existing friendships
        const userFriendships = await friendships.find({
            $or: [{ userId1: userId }, { userId2: userId }]
        }).toArray();

        // Extract IDs of users who are already friends or have pending requests
        const connectedUserIds = userFriendships.flatMap(friendship => [
            friendship.userId1, friendship.userId2
        ]).filter(id => id !== userId);

        // Add the current user's ID to the exclusion list
        const excludeIds = [...connectedUserIds, userId];

        console.log(`Excluding connected users: ${excludeIds.join(', ')}`);

        // Create array of ObjectIds, handling potential invalid IDs
        const excludeObjectIds = [];
        for (const id of excludeIds) {
            try {
                excludeObjectIds.push(new ObjectId(id));
            } catch (error) {
                console.warn(`Invalid ObjectId: ${id}, skipping`);
            }
        }

        // Search for users matching the query who aren't already connected
        const searchQuery = {
            $and: [
                { _id: { $nin: excludeObjectIds } },
                {
                    $or: [
                        { name: { $regex: query, $options: 'i' } },
                        { email: { $regex: query, $options: 'i' } }
                    ]
                }
            ]
        };

        console.log('MongoDB search query:', JSON.stringify(searchQuery));

        const searchResults = await users.find(searchQuery)
            .project({
                _id: 1,
                name: 1,
                email: 1,
                playerLevel: 1
            })
            .limit(10)
            .toArray();

        console.log(`Found ${searchResults.length} users matching query`);

        return createResponse(200, { users: searchResults });
    } catch (error) {
        console.error('Search users error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error searching for users', error: error.message });
    }
}

// Helper function to extract and verify JWT token
function extractAndVerifyToken(event) {
    // Add debug logging
    console.log('Auth header:', event.headers.Authorization ||
        event.headers.authorization ||
        event.headers['Authorization'] ||
        event.headers['authorization']);

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
        console.log('Decoded token:', JSON.stringify(decoded)); // Add debug logging
        return {
            isValid: true,
            decoded
        };
    } catch (error) {
        console.error('Token verification error:', error.message);
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid token' })
        };
    }
}