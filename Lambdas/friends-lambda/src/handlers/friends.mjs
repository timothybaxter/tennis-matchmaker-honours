import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';

// Get all friends for a user
export async function getFriends(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const db = await connectToDatabase();
        const friends = db.collection('friendships');
        const users = db.collection('users');

        // Find all accepted friendships where the user is either user1 or user2
        const friendships = await friends.find({
            $and: [
                { $or: [{ userId1: userId }, { userId2: userId }] },
                { status: 'accepted' }
            ]
        }).toArray();

        // Extract friend IDs
        const friendIds = friendships.map(friendship =>
            friendship.userId1 === userId ? friendship.userId2 : friendship.userId1
        );

        // Get friend details
        const friendDetails = await users.find({
            _id: { $in: friendIds.map(id => new ObjectId(id)) }
        }).project({
            password: 0 // Exclude sensitive information
        }).toArray();

        return createResponse(200, { friends: friendDetails });
    } catch (error) {
        console.error('Get friends error:', error);
        return createResponse(500, { message: 'Error retrieving friends' });
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
        const db = await connectToDatabase();
        const friends = db.collection('friendships');
        const users = db.collection('users');

        // Get incoming friend requests
        const friendRequests = await friends.find({
            userId2: userId,
            status: 'pending'
        }).toArray();

        // Get details of users who sent requests
        const requestorIds = friendRequests.map(request => request.userId1);
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

        const db = await connectToDatabase();
        const friendships = db.collection('friendships');
        const users = db.collection('users');

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
                    const notifications = db.collection('notifications');
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
        const notifications = db.collection('notifications');
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

        // Create new friendship request
        const newFriendship = {
            userId1: senderId, // Sender
            userId2: recipientId, // Recipient
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await friendships.insertOne(newFriendship);

        return createResponse(201, {
            message: 'Friend request sent successfully',
            friendshipId: result.insertedId
        });
    } catch (error) {
        console.error('Send friend request error:', error);
        return createResponse(500, { message: 'Error sending friend request' });
    }
}

// Respond to a friend request
export async function respondToFriendRequest(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const { friendshipId, accept } = JSON.parse(event.body);

        if (!friendshipId || accept === undefined) {
            return createResponse(400, { message: 'friendshipId and accept are required' });
        }

        const db = await connectToDatabase();
        const friendships = db.collection('friendships');

        // Find the friendship request and ensure user is the recipient
        const friendship = await friendships.findOne({
            _id: new ObjectId(friendshipId),
            userId2: userId,
            status: 'pending'
        });

        if (!friendship) {
            return createResponse(404, { message: 'Friend request not found or not authorized' });
        }

        if (accept) {
            // Accept request
            await friendships.updateOne(
                { _id: friendship._id },
                { $set: { status: 'accepted', updatedAt: new Date() } }
            );
            return createResponse(200, { message: 'Friend request accepted' });
        } else {
            // Reject by deleting the request
            await friendships.deleteOne({ _id: friendship._id });
            return createResponse(200, { message: 'Friend request rejected' });
        }
    } catch (error) {
        console.error('Respond to friend request error:', error);
        return createResponse(500, { message: 'Error responding to friend request' });
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

        if (!query || query.length < 2) {
            return createResponse(400, { message: 'Search query must be at least 2 characters' });
        }

        const db = await connectToDatabase();
        const users = db.collection('users');
        const friendships = db.collection('friendships');

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

        // Search for users matching the query who aren't already connected
        const searchResults = await users.find({
            $and: [
                { _id: { $nin: excludeIds.map(id => new ObjectId(id)) } },
                {
                    $or: [
                        { name: { $regex: query, $options: 'i' } },
                        { email: { $regex: query, $options: 'i' } }
                    ]
                }
            ]
        }).project({
            _id: 1,
            name: 1,
            email: 1,
            playerLevel: 1
        }).limit(10).toArray();

        return createResponse(200, { users: searchResults });
    } catch (error) {
        console.error('Search users error:', error);
        return createResponse(500, { message: 'Error searching for users' });
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